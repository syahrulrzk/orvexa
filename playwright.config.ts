import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:90000,expect:{timeout:15000},workers:1,use:{baseURL:process.env.E2E_BASE_URL||'http://localhost:5173',viewport:{width:1440,height:1080},screenshot:'only-on-failure',trace:'retain-on-failure'},reporter:'list'});
