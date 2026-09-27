import { z } from 'zod';
const name=z.string().trim().min(2).max(120);
const optionalId=z.string().uuid().nullable().optional();
export const schemas={
 division:z.object({name,description:z.string().max(1000).default(''),color:z.enum(['blue','purple','green','orange']).default('blue')}),
 agent:z.object({name,role:name,divisionId:optionalId,instructions:z.string().max(8000).default(''),status:z.enum(['active','paused']).default('active'),avatar:z.enum(['blue','purple','green','orange']).default('blue')}),
 project:z.object({name,description:z.string().max(4000).default(''),status:z.enum(['planning','active','completed']).default('active')}),
 task:z.object({name,description:z.string().max(6000).default(''),projectId:optionalId,agentId:optionalId,status:z.enum(['todo','in_progress','completed']).default('todo'),priority:z.enum(['low','medium','high']).default('medium'),requiresApproval:z.boolean().default(false),schedule:z.enum(['none','daily','weekly']).default('none')}),
 knowledge:z.object({name,category:z.enum(['company','product','policy','faq']).default('company'),content:z.string().trim().min(5).max(20000),status:z.enum(['published','draft']).default('published')})
};
export type Kind=keyof typeof schemas;
export const profileSchema=z.object({name,industry:z.string().max(120),description:z.string().max(6000),website:z.union([z.literal(''),z.string().url()]),language:z.enum(['id','en']).default('id'),timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},'Timezone tidak valid').default('Asia/Jakarta'),autonomous:z.boolean().default(true),paused:z.boolean().default(false)});
export type Entity={id:string;workspace_id:string;kind:Kind;data:Record<string,any>;created_at:string;updated_at:string};
export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
export const allowed=(role:string,operation:'read'|'write'|'admin')=> operation==='read'||(operation==='write'?['owner','admin','member'].includes(role):['owner','admin'].includes(role));
export const terminal=(status:string)=>['succeeded','failed','cancelled'].includes(status);
