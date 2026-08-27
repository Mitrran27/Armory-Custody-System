import 'dotenv/config';
import { asc } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { auditEvents } from '../db/schema.js';
import { computeAuditHash } from '../utils/auditHash.js';

async function main() {
	const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.createdAt));

	if (rows.length === 0) {
		console.log('No audit events yet — nothing to verify.');
		return;
	}

	let prevHash: string | null = null;
	let broken = 0;

	for (const row of rows) {
		const expected = computeAuditHash({
			id: row.id,
			type: row.type,
			severity: row.severity,
			timestamp: row.timestamp.toISOString(),
			actorName: row.actorName,
			zoneId: row.zoneId,
			firearmId: row.firearmId,
			detail: row.detail,
			prevHash
		});

		const linkOk = row.prevHash === prevHash;
		const hashOk = row.hash === expected;

		if (!linkOk || !hashOk) {
			broken++;
			console.error(`✗ ${row.id} — ${!linkOk ? 'chain link broken (prevHash mismatch)' : ''}${!linkOk && !hashOk ? ' & ' : ''}${!hashOk ? 'hash does not match recomputed content' : ''}`);
		}

		prevHash = row.hash;
	}

	if (broken === 0) {
		console.log(`✓ All ${rows.length} audit events verified — chain intact.`);
	} else {
		console.error(`\n${broken} of ${rows.length} audit events failed verification. The trail has been tampered with or corrupted.`);
		process.exitCode = 1;
	}
}

main()
	.catch((err) => {
		console.error('Verification failed to run:', err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await pool.end();
	});
