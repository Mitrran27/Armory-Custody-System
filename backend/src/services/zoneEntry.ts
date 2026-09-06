import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { zones, zoneSessions, guards, auditEventTypeEnum } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { ApiError } from '../utils/asyncHandler.js';
import { createAuditEvent } from './audit.js';
import { createActivityLog } from './activityLog.js';
import { hasApprovedZoneAccess } from './accessControl.js';

type Gate = (typeof import('../db/schema.js').doorGateEnum.enumValues)[number];

const gateToAuditType: Record<Gate, (typeof auditEventTypeEnum.enumValues)[number]> = {
	qr: 'qr_scan',
	facial: 'facial_match',
	rfid_threshold: 'admin_action',
	none: 'admin_action'
};

/**
 * Admits a guard into a zone: checks zone_access authorization (logging a
 * security alert and refusing if it's missing on an authorization-gated
 * zone), opens a ZoneSession, updates guard + zone occupancy state, and
 * appends the corresponding audit event and activity-log entry. Shared by
 * the direct POST /api/zones/:id/entry route and the QR door-scan flow so
 * both go through the exact same authorization + state-transition logic.
 */
export async function admitGuardToZone(params: { guardId: string; zoneId: string; method: Gate; imageUrl?: string | null }) {
	const { guardId, zoneId, method, imageUrl = null } = params;

	const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
	if (!zone) throw new ApiError(404, 'Zone not found.');
	const [guard] = await db.select().from(guards).where(and(eq(guards.id, guardId), isNull(guards.deletedAt)));
	if (!guard) throw new ApiError(404, 'Guard not found.');

	if (zone.requiresAuthorization) {
		const authorized = await hasApprovedZoneAccess(db, guardId, zone.id);
		if (!authorized) {
			await createAuditEvent(db, {
				type: 'alert',
				severity: 'critical',
				actorName: guard.name,
				actorGuardId: guard.id,
				zoneId: zone.id,
				detail: `Unauthorized entry attempt: ${guard.name} has no approved access request for ${zone.label}`
			});
			throw new ApiError(403, 'This guard is not authorized to enter this zone. An approved access request is required.');
		}
	}

	return db.transaction(async (tx) => {
		const [session] = await tx
			.insert(zoneSessions)
			.values({ id: genId('ZS'), zoneId: zone.id, guardId: guard.id, method })
			.returning();

		await tx.update(guards).set({ currentZoneId: zone.id, lastSeen: new Date() }).where(eq(guards.id, guard.id));
		if (zone.status === 'clear') {
			await tx.update(zones).set({ status: 'occupied', updatedAt: new Date() }).where(eq(zones.id, zone.id));
		}

		const event = await createAuditEvent(tx, {
			type: gateToAuditType[method],
			actorName: guard.name,
			actorGuardId: guard.id,
			zoneId: zone.id,
			detail: `${guard.name} entered ${zone.label} via ${method.replace('_', ' ')}`
		});

		const log = await createActivityLog(tx, {
			eventType: 'zone_entry',
			personName: guard.name,
			guardId: guard.id,
			zoneId: zone.id,
			detail: `${guard.name} entered ${zone.label} via ${method.replace('_', ' ')}`,
			imageUrl
		});

		return { session, event, log };
	});
}
