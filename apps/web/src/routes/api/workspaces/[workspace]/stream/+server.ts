import {error} from '@sveltejs/kit';
import {access} from '@orvexa/core/service';
import {pool} from '@orvexa/core/db';
import {auth} from '$lib/server/auth';
import type {RequestHandler} from './$types';
export const GET:RequestHandler=async({locals,params,request,url})=>{
 if(!locals.user)error(401,'Unauthorized');const userId=locals.user.id,w=params.workspace;try{await access(userId,w);}catch{error(404,'Not found');}
 let cursor=Number(request.headers.get('last-event-id')??url.searchParams.get('after')??0);if(!Number.isSafeInteger(cursor)||cursor<0)error(400,'Invalid cursor');
 let interval:ReturnType<typeof setInterval>|undefined,closed=false,pending=false;
 const encoder=new TextEncoder();
 function stop(){closed=true;if(interval)clearInterval(interval);}
 const stream=new ReadableStream({start(controller){const close=()=>{if(!closed){stop();try{controller.close();}catch{}}};const tick=async()=>{if(closed||pending)return;pending=true;try{const session=await auth.api.getSession({headers:request.headers});if(!session||session.user.id!==userId){close();return;}await access(userId,w);const {rows}=await pool.query('SELECT id,kind FROM events WHERE workspace_id=$1 AND id>$2 ORDER BY id LIMIT 100',[w,cursor]);for(const row of rows){if(closed)return;cursor=Number(row.id);controller.enqueue(encoder.encode(`id: ${cursor}\ndata: ${JSON.stringify({id:cursor,kind:row.kind})}\n\n`));}if(!closed)controller.enqueue(encoder.encode(': heartbeat\n\n'));}catch{close();}finally{pending=false;}};controller.enqueue(encoder.encode('retry: 4000\n\n'));interval=setInterval(tick,3000);request.signal.addEventListener('abort',close,{once:true});void tick();},cancel(){stop();}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
};
