import { Queue,Worker } from 'bullmq';
import { config } from '@orvexa/core/config';
import { pool } from '@orvexa/core/db';
import { startRun } from '@orvexa/core/service';
import { executeRun } from '@orvexa/core/runner';
const env=config();const url=new URL(env.REDIS_URL);const connection={host:url.hostname,port:Number(url.port)||6379,password:url.password||undefined,maxRetriesPerRequest:null};
const queue=new Queue('orvexa-runs',{connection});
const worker=new Worker('orvexa-runs',async job=>executeRun(job.data.runId),{connection,concurrency:2,lockDuration:180000});
worker.on('error',()=>console.error('Worker connection error'));queue.on('error',()=>console.error('Queue connection error'));
let dispatching=false;let lastSchedule=0;
async function dispatch(){if(dispatching)return;dispatching=true;try{if(Date.now()-lastSchedule>30000){lastSchedule=Date.now();const due=(await pool.query('SELECT * FROM task_schedules WHERE next_at<=now() ORDER BY next_at LIMIT 10')).rows;for(const task of due){try{await startRun(task.created_by,task.workspace_id,task.task_id,true);}catch{console.warn('Scheduled task deferred',task.task_id);}}}const {rows}=await pool.query("SELECT o.id,o.run_id FROM outbox o JOIN runs r ON r.id=o.run_id JOIN workspaces w ON w.id=r.workspace_id WHERE o.published_at IS NULL AND r.status IN ('queued','running') AND COALESCE((w.profile->>'paused')::boolean,false)=false ORDER BY o.created_at LIMIT 25");for(const row of rows){await queue.add('execute',{runId:row.run_id},{jobId:row.id,attempts:2,backoff:{type:'exponential',delay:3000},removeOnComplete:500,removeOnFail:500});await pool.query('UPDATE outbox SET published_at=now() WHERE id=$1',[row.id]);}await pool.query("WITH expired AS (UPDATE approvals SET status='expired' WHERE status='pending' AND expires_at<now() RETURNING run_id) UPDATE runs SET status='cancelled',error_code='APPROVAL_EXPIRED',updated_at=now() WHERE id IN (SELECT run_id FROM expired) AND status='waiting_approval'");}catch{console.error('Dispatcher temporarily unavailable');}finally{dispatching=false;}}
const timer=setInterval(dispatch,1500);await dispatch();console.log('ORVEXA worker ready. Concurrency: 2.');
let closing=false;async function shutdown(){if(closing)return;closing=true;clearInterval(timer);await worker.close();await queue.close();await pool.end();process.exit(0);}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
