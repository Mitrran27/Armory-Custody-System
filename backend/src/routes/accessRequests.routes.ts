import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull, isNotNull, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accessRequests, guards, zones, firearms } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { createAuditEvent } from '../services/audit.js';

export const accessRequestsRouter = Router();
accessRequestsRouter.use(requireAuth);

const createSchema = z
	.object({
		type: z.enum(['zone_access', 'firearm_assignment']),
		guardId: z.string().min(1),
		zoneId: z.string().nullable().optional(),
		firearmId: z.string().nullable().optional(),
		notes: z.string().nullable().optional()
	})
	.refine((v) => (v.type === 'zone_access' ? !!v.zoneId : !!v.firearmId), {
		message: 'zone_access requests need a zoneId; firearm_assignment requests need a firearmId.'
	});

/**
 * "Certain roles can enter the armory, certain guards can be issued certain
 * firearms — and it goes through an application admins approve." This file
 * is that workflow. See zones.routes.ts (entry) and firearms.routes.ts
 * (checkout) for where an approved request here actually gets checked.
 */
accessRequestsRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const q = z
			.object({
				type: z.enum(['zone_access', 'firearm_assignment']).optional(),
				status: z.enum(['pending', 'approved', 'rejected', 'revoked']).optional(),
				guardId: z.string().optional(),
				firearmId: z.string().optional(),
				includeDeleted: z.coerce.boolean().optional()
			})
			.parse(req.query);

		const conditions: SQL[] = [];
		if (!q.includeDeleted) conditions.push(isNull(accessRequests.deletedAt));
		if (q.type) conditions.push(eq(accessRequests.type, q.type));
		if (q.status) conditions.push(eq(accessRequests.status, q.status));
		if (q.guardId) conditions.push(eq(accessRequests.guardId, q.guardId));
		if (q.firearmId) conditions.push(eq(accessRequests.firearmId, q.firearmId));

		const rows = await db.query.accessRequests.findMany({
			where: conditions.length ? and(...conditions) : undefined,
			with: { guard: true, zone: true, firearm: true }
		});
		res.json(rows);
	})
);

accessRequestsRouter.get(
	'/:id',
	asyncHandler(async (req, res) => {
		const row = await db.query.accessRequests.findFirst({
			where: eq(accessRequests.id, pid(req.params.id)),
			with: { guard: true, zone: true, firearm: true, decidedBy: true, requestedBy: true }
		});
		if (!row) throw new ApiError(404, 'Access request not found.');
		res.json(row);
	})
);

/** File an application. Staff-submitted on the guard's behalf — guards don't hold system logins. */
accessRequestsRouter.post(
	'/',
	requireRole('admin', 'duty_officer', 'armorer'),
	asyncHandler(async (req, res) => {
		const body = createSchema.parse(req.body);

		const [guard] = await db.select().from(guards).where(and(eq(guards.id, body.guardId), isNull(guards.deletedAt)));
		if (!guard) throw new ApiError(404, 'Guard not found.');
		if (body.type === 'zone_access') {
			const [zone] = await db.select().from(zones).where(eq(zones.id, body.zoneId!));
			if (!zone) throw new ApiError(404, 'Zone not found.');
		} else {
			const [firearm] = await db.select().from(firearms).where(and(eq(firearms.id, body.firearmId!), isNull(firearms.deletedAt)));
			if (!firearm) throw new ApiError(404, 'Firearm not found.');
		}

		const [row] = await db
			.insert(accessRequests)
			.values({
				id: genId('AR'),
				type: body.type,
				guardId: body.guardId,
				zoneId: body.zoneId ?? null,
				firearmId: body.firearmId ?? null,
				notes: body.notes ?? null,
				requestedByUserId: req.user!.sub
			})
			.returning();
		res.status(201).json(row);
	})
);

const decisionSchema = z.object({ notes: z.string().nullable().optional() });

/** Admin approval — the actual gate that lets an approved guard through zone entry / firearm checkout. */
accessRequestsRouter.post(
	'/:id/approve',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const body = decisionSchema.parse(req.body ?? {});
		const result = await db.transaction(async (tx) => {
			const [existing] = await tx
				.select()
				.from(accessRequests)
				.where(and(eq(accessRequests.id, pid(req.params.id)), isNull(accessRequests.deletedAt)));
			if (!existing) throw new ApiError(404, 'Access request not found.');
			if (existing.status !== 'pending') throw new ApiError(409, `Request is already "${existing.status}".`);

			const [guard] = await tx.select().from(guards).where(eq(guards.id, existing.guardId));

			const [row] = await tx
				.update(accessRequests)
				.set({ status: 'approved', decidedByUserId: req.user!.sub, decidedAt: new Date(), notes: body.notes ?? existing.notes, updatedAt: new Date() })
				.where(eq(accessRequests.id, existing.id))
				.returning();

			const detail =
				existing.type === 'zone_access'
					? `${req.user!.name} approved armory access for ${guard?.name ?? existing.guardId} (${existing.zoneId})`
					: `${req.user!.name} approved firearm assignment: ${existing.firearmId} to ${guard?.name ?? existing.guardId}`;

			await createAuditEvent(tx, {
				type: 'admin_action',
				actorName: req.user!.name,
				actorUserId: req.user!.sub,
				zoneId: existing.zoneId,
				firearmId: existing.firearmId,
				detail
			});

			return row;
		});
		res.json(result);
	})
);

accessRequestsRouter.post(
	'/:id/reject',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const body = decisionSchema.parse(req.body ?? {});
		const result = await db.transaction(async (tx) => {
			const [existing] = await tx
				.select()
				.from(accessRequests)
				.where(and(eq(accessRequests.id, pid(req.params.id)), isNull(accessRequests.deletedAt)));
			if (!existing) throw new ApiError(404, 'Access request not found.');
			if (existing.status !== 'pending') throw new ApiError(409, `Request is already "${existing.status}".`);

			const [row] = await tx
				.update(accessRequests)
				.set({ status: 'rejected', decidedByUserId: req.user!.sub, decidedAt: new Date(), notes: body.notes ?? existing.notes, updatedAt: new Date() })
				.where(eq(accessRequests.id, existing.id))
				.returning();

			await createAuditEvent(tx, {
				type: 'admin_action',
				actorName: req.user!.name,
				actorUserId: req.user!.sub,
				zoneId: existing.zoneId,
				firearmId: existing.firearmId,
				detail: `${req.user!.name} rejected access request ${existing.id}${body.notes ? ` — ${body.notes}` : ''}`
			});

			return row;
		});
		res.json(result);
	})
);

/** Pulls a previously approved authorization (e.g. a guard is reassigned or suspended). */
accessRequestsRouter.post(
	'/:id/revoke',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const body = decisionSchema.parse(req.body ?? {});
		const result = await db.transaction(async (tx) => {
			const [existing] = await tx
				.select()
				.from(accessRequests)
				.where(and(eq(accessRequests.id, pid(req.params.id)), isNull(accessRequests.deletedAt)));
			if (!existing) throw new ApiError(404, 'Access request not found.');
			if (existing.status !== 'approved') throw new ApiError(409, `Only an approved request can be revoked (currently "${existing.status}").`);

			const [row] = await tx
				.update(accessRequests)
				.set({ status: 'revoked', decidedByUserId: req.user!.sub, decidedAt: new Date(), notes: body.notes ?? existing.notes, updatedAt: new Date() })
				.where(eq(accessRequests.id, existing.id))
				.returning();

			await createAuditEvent(tx, {
				type: 'admin_action',
				severity: 'warning',
				actorName: req.user!.name,
				actorUserId: req.user!.sub,
				zoneId: existing.zoneId,
				firearmId: existing.firearmId,
				detail: `${req.user!.name} revoked access request ${existing.id}${body.notes ? ` — ${body.notes}` : ''}`
			});

			return row;
		});
		res.json(result);
	})
);

accessRequestsRouter.delete(
	'/:id',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(accessRequests)
			.set({ deletedAt: new Date() })
			.where(and(eq(accessRequests.id, pid(req.params.id)), isNull(accessRequests.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Access request not found or already deleted.');
		res.json({ message: 'Access request soft-deleted.', accessRequest: row });
	})
);

accessRequestsRouter.post(
	'/:id/restore',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(accessRequests)
			.set({ deletedAt: null })
			.where(and(eq(accessRequests.id, pid(req.params.id)), isNotNull(accessRequests.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Access request not found or not deleted.');
		res.json({ message: 'Access request restored.', accessRequest: row });
	})
);
