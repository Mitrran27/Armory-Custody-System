import { createHash } from 'node:crypto';

export interface AuditHashInput {
	id: string;
	type: string;
	severity: string;
	timestamp: string; // ISO
	actorName: string;
	zoneId: string | null;
	firearmId: string | null;
	detail: string;
	prevHash: string | null;
}

/**
 * Deterministically hashes one audit event together with the previous event's
 * hash. Because each hash depends on the one before it, changing or deleting
 * any historical row breaks every hash after it — which is what
 * `npm run verify-audit-chain` checks for. This is why AuditEvent has no
 * update/delete route: doing either only would only corrupt the row, not
 * hide the tampering.
 */
export function computeAuditHash(input: AuditHashInput): string {
	const payload = [
		input.id,
		input.type,
		input.severity,
		input.timestamp,
		input.actorName,
		input.zoneId ?? '',
		input.firearmId ?? '',
		input.detail,
		input.prevHash ?? 'GENESIS'
	].join('|');
	return createHash('sha256').update(payload).digest('hex');
}
