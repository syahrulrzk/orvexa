import {test,expect} from 'bun:test';
import {allowed,profileSchema,schemas,terminal} from '../packages/core/src/contracts';
import {encrypt,decrypt} from '../packages/core/src/crypto';
test('viewer cannot mutate; member cannot administer',()=>{expect(allowed('viewer','write')).toBe(false);expect(allowed('member','admin')).toBe(false);expect(allowed('owner','admin')).toBe(true);});
test('task references and timezone are validated',()=>{expect(schemas.task.safeParse({name:'Test task',agentId:'foreign-id'}).success).toBe(false);expect(profileSchema.safeParse({name:'Test company',industry:'Retail',description:'',website:'',timezone:'Not/AZone'}).success).toBe(false);});
test('credential ciphertext is randomized and tamper-evident',()=>{process.env.CREDENTIAL_ENCRYPTION_KEY='a'.repeat(64);const first=encrypt('secret-api-key'),second=encrypt('secret-api-key');expect(first).not.toBe(second);expect(decrypt(first)).toBe('secret-api-key');const parts=first.split('.');parts[2]=Buffer.from('tampered').toString('base64');expect(()=>decrypt(parts.join('.'))).toThrow();});
test('terminal statuses cannot be replayed as active',()=>{expect(terminal('succeeded')).toBe(true);expect(terminal('cancelled')).toBe(true);expect(terminal('waiting_approval')).toBe(false);});
