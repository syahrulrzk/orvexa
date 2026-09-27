import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
export const pool = new pg.Pool({ connectionString:process.env.DATABASE_URL, max:10 });
export const workspaces=pgTable('workspaces',{id:text('id').primaryKey(),name:text('name').notNull(),ownerId:text('owner_id').notNull(),profile:jsonb('profile').$type<Record<string,any>>().notNull(),createdAt:timestamp('created_at').notNull()});
export const entities=pgTable('entities',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),kind:text('kind').notNull(),data:jsonb('data').$type<Record<string,any>>().notNull(),createdAt:timestamp('created_at').notNull(),updatedAt:timestamp('updated_at').notNull()});
export const db=drizzle(pool,{schema:{workspaces,entities}});
export const uid=()=>crypto.randomUUID();
