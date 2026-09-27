import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export default defineConfig(({mode})=>{Object.assign(process.env,loadEnv(mode,root,''));return {envDir:root,plugins:[sveltekit()],server:{port:5173,fs:{allow:[root]}}};});
