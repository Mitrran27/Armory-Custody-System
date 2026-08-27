import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { zones, zoneSessions, guards } from '../db/schema.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { createAuditEvent } from '../services/audit.js';
import { admitGuardToZone } from '../services/zoneEntry.js';

export const zonesRouter = Router();
zonesRouter.use(requireAuth);

const gateEnum = z.enum(['qr', 'facial', 'rfid_threshold', 'none']);

zonesRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const rows = await db.query.zones.findMany({
			with: { zoneSessions: { where: isNull(zoneSessions.exitedAt), with: { guard: true } }, room: { with: { doors: true, racks: true } } }
		});
		res.json(rows);
	})
);

zonesRouter.get(
	'/:id',
	asyncHandler(async (req, res) => {
		const row = await db.query.zones.findFirst({
			where: eq(zones.id, pid(req.params.id)),
			with: { zoneSessions: { where: isNull(zoneSessions.exitedAt), with: { guard: true } }, room: { with: { doors: true, racks: true } } }
		});
		if (!row) throw new ApiError(404, 'Zone not found.');
		res.json(row);
	})
);

const zonePatchSchema = z.object({
	label: z.string().min(1).optional(),
	description: z.string().nullable().optional(),
	status: z.enum(['clear', 'occupied', 'alert']).optional()
});

zonesRouter.patch(
	'/:id',
	requireRole('admin', 'duty_officer'),
	asyncHandler(async (req, res) => {
		const body = zonePatchSchema.parse(req.body);
		const [row] = await db.update(zones).set({ ...body, updatedAt: new Date() }).where(eq(zones.id, pid(req.params.id))).returning();
		if (!row) throw new ApiError(404, 'Zone not found.');
		res.json(row);
	})
);

const entrySchema = z.object({ guardId: z.string().min(1), method: gateEnum });

/** Records a guard entering a zone: opens a ZoneSession, updates guard + zone state, appends an audit event. */
zonesRouter.post(
	'/:id/entry',
	requireRole('admin', 'duty_officer', 'armorer'),
	asyncHandler(async (req, res) => {
		const { guardId, method } = entrySchema.parse(req.body);
		const result = await admitGuardToZone({ guardId, zoneId: pid(req.params.id), method });
		res.status(201).json(result);
	})
);

const exitSchema = z.object({ guardId: z.string().min(1) });

/** Records a guard leaving a zone: closes their ZoneSession, updates guard + zone state, appends an audit event. */
zonesRouter.post(
	'/:id/exit',
	requireRole('admin', 'duty_officer', 'armorer'),
	asyncHandler(async (req, res) => {
		const { guardId } = exitSchema.parse(req.body);

		const result = await db.transaction(async (tx) => {
			const [zone] = await tx.select().from(zones).where(eq(zones.id, pid(req.params.id)));
			if (!zone) throw new ApiError(404, 'Zone not found.');
			const [guard] = await tx.select().from(guards).where(eq(guards.id, guardId));
			if (!guard) throw new ApiError(404, 'Guard not found.');

			const [openSession] = await tx
				.select()
				.from(zoneSessions)
				.where(and(eq(zoneSessions.zoneId, zone.id), eq(zoneSessions.guardId, guard.id), isNull(zoneSessions.exitedAt)));
			if (!openSession) throw new ApiError(409, 'This guard has no open session in that zone.');

			const [session] = await tx
				.update(zoneSessions)
				.set({ exitedAt: new Date() })
				.where(eq(zoneSessions.id, openSession.id))
				.returning();

			if (guard.currentZoneId === zone.id) {
				await tx.update(guards).set({ currentZoneId: null }).where(eq(guards.id, guard.id));
			}

			const [remaining] = await tx
				.select({ id: zoneSessions.id })
				.from(zoneSessions)
				.where(and(eq(zoneSessions.zoneId, zone.id), isNull(zoneSessions.exitedAt)));
			if (!remaining && zone.status === 'occupied') {
				await tx.update(zones).set({ status: 'clear', updatedAt: new Date() }).where(eq(zones.id, zone.id));
			}

			const event = await createAuditEvent(tx, {
				type: 'admin_action',
				actorName: guard.name,
				actorGuardId: guard.id,
				zoneId: zone.id,
				detail: `${guard.name} exited ${zone.label}`
			});

			return { session, event };
		});

		res.json(result);
	})
);
