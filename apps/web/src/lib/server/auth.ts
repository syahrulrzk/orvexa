import { betterAuth } from 'better-auth';
import { pool } from '@orvexa/core/db';
import { env } from '$env/dynamic/private';
export const auth=betterAuth({database:pool,secret:env.BETTER_AUTH_SECRET,baseURL:env.APP_ORIGIN,emailAndPassword:{enabled:true,minPasswordLength:10},rateLimit:{enabled:true,window:60,max:60},trustedOrigins:[env.APP_ORIGIN||'http://localhost:5173',...(env.TRUSTED_ORIGINS||'').split(',').filter(Boolean)]});
