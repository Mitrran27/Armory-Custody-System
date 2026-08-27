import { desc } from 'drizzle-orm';
import { auditEvents } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { computeAuditHash } from '../utils/auditHash.js';
import type { DbClient, Tx } from '../db/index.js';

type DbOrTx = DbClient | Tx;

export interface CreateAuditEventInput {
	type: (typeof auditEvents.$inferInsert)['type'];
	severity?: (typeof auditEvents.$inferInsert)['severity'];
	actorName: string;
	actorGuardId?: string | null;
	actorUserId?: string | null;
	zoneId?: string | null;
	firearmId?: string | null;
	detail: string;
}

/**
 * Appends one event to the audit trail. Must be called with the same
 * transaction handle as any related writes (e.g. a firearm checkout) so the
 * audit record and the state change it describes commit together or not at
 * all — see routes/firearms.routes.ts for an example.
 */
export async function createAuditEvent(tx: DbOrTx, input: CreateAuditEventInput) {
	const [last] = await tx.select({ hash: auditEvents.hash }).from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(1);

	const id = genId('E');
	const timestamp = new Date();

	const hash = computeAuditHash({
		id,
		type: input.type,
		severity: input.severity ?? 'info',
		timestamp: timestamp.toISOString(),
		actorName: input.actorName,
		zoneId: input.zoneId ?? null,
		firearmId: input.firearmId ?? null,
		detail: input.detail,
		prevHash: last?.hash ?? null
	});

	const [row] = await tx
		.insert(auditEvents)
		.values({
			id,
			type: input.type,
			severity: input.severity ?? 'info',
			timestamp,
			actorName: input.actorName,
			actorGuardId: input.actorGuardId ?? null,
			actorUserId: input.actorUserId ?? null,
			zoneId: input.zoneId ?? null,
			firearmId: input.firearmId ?? null,
			detail: input.detail,
			hash,
			prevHash: last?.hash ?? null
		})
		.returning();

	return row;
}
