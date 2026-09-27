import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
function key(){const value=process.env.CREDENTIAL_ENCRYPTION_KEY;if(!value||!/^[a-f0-9]{64}$/i.test(value))throw new Error('Encryption key is not configured');return Buffer.from(value,'hex');}
export function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64')).join('.');}
export function decrypt(value:string){const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64'));const decipher=createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8');}
