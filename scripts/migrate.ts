import { pool } from '../packages/core/src/db';
import { readFile } from 'node:fs/promises';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
const client=await pool.connect();
try { await client.query('BEGIN'); await client.query("SELECT pg_advisory_xact_lock(917240)"); await client.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8')); await client.query('COMMIT'); } catch(e) { await client.query('ROLLBACK'); throw e; } finally {client.release();}
const saver=PostgresSaver.fromConnString(process.env.DATABASE_URL!);await saver.setup();await saver.end();await pool.end();console.log('Database and LangGraph checkpoint schema ready.');
