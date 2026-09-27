import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
export const handle:Handle=async({event,resolve})=>{if(!building){const session=await auth.api.getSession({headers:event.request.headers});if(session)event.locals.user={id:session.user.id,name:session.user.name,email:session.user.email};}return svelteKitHandler({event,resolve,auth,building});};
