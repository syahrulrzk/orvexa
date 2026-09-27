import { betterAuth } from 'better-auth';
import { randomBytes } from 'node:crypto';
import { pool } from '../packages/core/src/db';
import { createWorkspace } from '../packages/core/src/service';
const email='admin@orvexa.local';
const existing=(await pool.query('SELECT id FROM "user" WHERE email=$1',[email])).rows[0];
if(existing){console.log('Administrator already exists; password was not changed.');await pool.end();process.exit(0);}
const password='Orvexa!'+randomBytes(12).toString('base64url');
const auth=betterAuth({database:pool,secret:process.env.BETTER_AUTH_SECRET,baseURL:process.env.APP_ORIGIN,emailAndPassword:{enabled:true,minPasswordLength:10}});
const result=await auth.api.signUpEmail({body:{name:'Administrator',email,password}});
await createWorkspace(result.user.id,{name:'ORVEXA',industry:'Usaha Mikro, Kecil, dan Menengah',description:'',website:'',language:'id',timezone:'Asia/Jakarta',autonomous:true,paused:false});
console.log(JSON.stringify({email,password,role:'Workspace owner / administrator'}));
await pool.end();
