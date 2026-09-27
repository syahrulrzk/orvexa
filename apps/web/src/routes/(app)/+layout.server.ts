import { redirect } from '@sveltejs/kit';
import { pool } from '@orvexa/core/db';
import { loadWorkspace } from '@orvexa/core/service';
export const load=async({locals,cookies,depends})=>{depends('app:data');if(!locals.user)redirect(303,'/login');const choices=(await pool.query('SELECT w.id,w.name FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.created_at',[locals.user.id])).rows;if(!choices.length)redirect(303,'/onboarding');const selected=cookies.get('workspace');const id=choices.find(w=>w.id===selected)?.id??choices[0].id;return {...await loadWorkspace(locals.user.id,id),choices,user:locals.user};};
