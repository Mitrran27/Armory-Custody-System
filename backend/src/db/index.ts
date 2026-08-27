import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in.');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type DbClient = typeof db;
/** The transaction-scoped client passed into db.transaction(async (tx) => ...) */
export type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];
