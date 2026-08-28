import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

/**
 * Drops and recreates the public schema. Use this instead of hunting for
 * psql on PATH (especially on Windows, where a PostgreSQL install doesn't
 * always add its bin/ folder to PATH) — this only needs Node and the `pg`
 * package, both already installed as part of this project.
 *
 * Needed whenever the migration history itself changes (a squashed/rebased
 * set of migration files) rather than just adding a new one — in that case
 * `db:migrate` can't reconcile an existing database against files it
 * doesn't recognize, so start clean instead:
 *
 *   npm run db:reset
 *   npm run db:migrate
 *   npm run db:seed
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in.');
	}

	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	console.log('Dropping and recreating the public schema...');
	await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
	// Drizzle's own migration-tracking table lives in a separate `drizzle`
	// schema, not `public`. If we don't drop this too, `db:migrate` will
	// see the old migrations already marked as applied and silently skip
	// re-running them against the now-empty public schema — leaving you
	// with zero tables and no error. It's recreated automatically the next
	// time `db:migrate` runs.
	console.log('Dropping the drizzle migration-tracking schema...');
	await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE;');
	console.log('Done. Database is now empty — run `npm run db:migrate` next.');
	await pool.end();
}

main().catch((err) => {
	console.error('Reset failed:', err);
	process.exit(1);
});
