import { z } from 'zod';
export function config() {
 return z.object({ DATABASE_URL:z.string().min(1), REDIS_URL:z.string().url(), BETTER_AUTH_SECRET:z.string().min(32), APP_ORIGIN:z.string().url(), CREDENTIAL_ENCRYPTION_KEY:z.string().regex(/^[a-f0-9]{64}$/i) }).parse(process.env);
}
