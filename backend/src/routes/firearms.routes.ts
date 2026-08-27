import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { firearms, guards, maintenanceRecords, systemUsers } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { createAuditEvent } from '../services/audit.js';
import { hasApprovedFirearmAssignment } from '../services/accessControl.js';

export const firearmsRouter = Router();
firearmsRouter.use(requireAuth);

const statusEnum = z.enum(['in_armory', 'checked_out', 'maintenance', 'decommissioned']);
const tagHealthEnum = z.enum(['ok', 'weak', 'tamper']);

const createSchema = z.object({
	serial: z.string().min(1),
	rfidTag: z.string().min(1),
	model: z.string().min(1),
	caliber: z.string().min(1),
	rack: z.string().min(1),
	slot: z.string().min(1),
	status: statusEnum.optional(),
	tagHealth: tagHealthEnum.optional()
});
const updateSchema = createSchema.partial().extend({
	holderId: z.string().nullable().optional()
});

// --- Firearm CRUD -----------------------------------------------------

firearmsRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const includeDeleted = req.query.includeDeleted === 'true';
		const rows = await db.query.firearms.findMany({
			where: includeDeleted ? undefined : isNull(firearms.deletedAt),
			with: { maintenance: { where: isNull(maintenanceRecords.deletedAt), with: { armorer: true, assignedBy: true } }, holder: true }
		});
		res.json(rows);
	})
);

firearmsRouter.get(
	'/:id',
	asyncHandler(async (req, res) => {
		const row = await db.query.firearms.findFirst({
			where: eq(firearms.id, pid(req.params.id)),
			with: { maintenance: { where: isNull(maintenanceRecords.deletedAt), with: { armorer: true, assignedBy: true } }, holder: true }
		});
		if (!row) throw new ApiError(404, 'Firearm not found.');
		res.json(row);
	})
);

firearmsRouter.post(
	'/',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const body = createSchema.parse(req.body);
		const [row] = await db
			.insert(firearms)
			.values({
				id: genId('F'),
				...body,
				status: body.status ?? 'in_armory',
				tagHealth: body.tagHealth ?? 'ok'
			})
			.returning();
		res.status(201).json(row);
	})
);

firearmsRouter.patch(
	'/:id',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const body = updateSchema.parse(req.body);
		const [row] = await db
			.update(firearms)
			.set({ ...body, updatedAt: new Date() })
			.where(and(eq(firearms.id, pid(req.params.id)), isNull(firearms.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Firearm not found.');
		res.json(row);
	})
);

firearmsRouter.delete(
	'/:id',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(firearms)
			.set({ deletedAt: new Date() })
			.where(and(eq(firearms.id, pid(req.params.id)), isNull(firearms.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Firearm not found or already deleted.');
		res.json({ message: 'Firearm soft-deleted.', firearm: row });
	})
);

firearmsRouter.post(
	'/:id/restore',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(firearms)
			.set({ deletedAt: null })
			.where(and(eq(firearms.id, pid(req.params.id)), isNotNull(firearms.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Firearm not found or not deleted.');
		res.json({ message: 'Firearm restored.', firearm: row });
	})
);

// --- Checkout / check-in (state change + audit event, atomically) -----

const checkoutSchema = z.object({ guardId: z.string().min(1) });

firearmsRouter.post(
	'/:id/checkout',
	requireRole('admin', 'armorer', 'duty_officer'),
	asyncHandler(async (req, res) => {
		const { guardId } = checkoutSchema.parse(req.body);

		// Same pattern as zone entry: check authorization outside the write
		// transaction so a denial's audit-alert persists even though the
		// checkout itself doesn't.
		const [precheckFirearm] = await db.select().from(firearms).where(and(eq(firearms.id, pid(req.params.id)), isNull(firearms.deletedAt)));
		if (!precheckFirearm) throw new ApiError(404, 'Firearm not found.');
		const [precheckGuard] = await db.select().from(guards).where(and(eq(guards.id, guardId), isNull(guards.deletedAt)));
		if (!precheckGuard) throw new ApiError(404, 'Guard not found.');

		const authorized = await hasApprovedFirearmAssignment(db, guardId, precheckFirearm.id);
		if (!authorized) {
			await createAuditEvent(db, {
				type: 'alert',
				severity: 'critical',
				actorName: precheckGuard.name,
				actorGuardId: precheckGuard.id,
				firearmId: precheckFirearm.id,
				zoneId: precheckGuard.currentZoneId,
				detail: `Unauthorized checkout attempt: ${precheckGuard.name} has no approved assignment for ${precheckFirearm.model} (${precheckFirearm.id})`
			});
			throw new ApiError(403, 'This guard is not authorized to be issued this firearm. An approved firearm assignment request is required.');
		}

		const result = await db.transaction(async (tx) => {
			const [firearm] = await tx.select().from(firearms).where(and(eq(firearms.id, pid(req.params.id)), isNull(firearms.deletedAt)));
			if (!firearm) throw new ApiError(404, 'Firearm not found.');
			if (firearm.status !== 'in_armory') {
				throw new ApiError(409, `Firearm is currently "${firearm.status}", not available to check out.`);
			}
			const [guard] = await tx.select().from(guards).where(and(eq(guards.id, guardId), isNull(guards.deletedAt)));
			if (!guard) throw new ApiError(404, 'Guard not found.');

			const [updated] = await tx
				.update(firearms)
				.set({ status: 'checked_out', holderId: guardId, checkedOutAt: new Date(), updatedAt: new Date() })
				.where(eq(firearms.id, firearm.id))
				.returning();

			const event = await createAuditEvent(tx, {
				type: 'firearm_taken',
				actorName: guard.name,
				actorGuardId: guard.id,
				firearmId: firearm.id,
				zoneId: guard.currentZoneId,
				detail: `${firearm.model} (${firearm.rfidTag}, ${firearm.id}) checked out by ${guard.name}`
			});

			return { firearm: updated, event };
		});

		res.json(result);
	})
);

firearmsRouter.post(
	'/:id/checkin',
	requireRole('admin', 'armorer', 'duty_officer'),
	asyncHandler(async (req, res) => {
		const result = await db.transaction(async (tx) => {
			const [firearm] = await tx.select().from(firearms).where(and(eq(firearms.id, pid(req.params.id)), isNull(firearms.deletedAt)));
			if (!firearm) throw new ApiError(404, 'Firearm not found.');
			if (firearm.status !== 'checked_out') {
				throw new ApiError(409, `Firearm is currently "${firearm.status}", not checked out.`);
			}
			const guard = firearm.holderId
				? (await tx.select().from(guards).where(eq(guards.id, firearm.holderId)))[0]
				: undefined;

			const [updated] = await tx
				.update(firearms)
				.set({ status: 'in_armory', holderId: null, checkedOutAt: null, updatedAt: new Date() })
				.where(eq(firearms.id, firearm.id))
				.returning();

			const event = await createAuditEvent(tx, {
				type: 'firearm_returned',
				actorName: guard?.name ?? 'Unknown guard',
				actorGuardId: guard?.id ?? null,
				firearmId: firearm.id,
				zoneId: guard?.currentZoneId ?? null,
				detail: `${firearm.model} (${firearm.rfidTag}, ${firearm.id}) returned by ${guard?.name ?? 'unknown guard'}`
			});

			return { firearm: updated, event };
		});

		res.json(result);
	})
);

// --- Maintenance sub-resource ------------------------------------------

const maintenanceCreateSchema = z.object({
	date: z.coerce.date(),
	armorerId: z.string().nullable().optional(),
	work: z.string().min(1),
	nextDue: z.coerce.date()
});
const maintenanceUpdateSchema = maintenanceCreateSchema.partial();

firearmsRouter.get(
	'/:id/maintenance',
	asyncHandler(async (req, res) => {
		const includeDeleted = req.query.includeDeleted === 'true';
		const rows = await db
			.select()
			.from(maintenanceRecords)
			.where(
				includeDeleted
					? eq(maintenanceRecords.firearmId, pid(req.params.id))
					: and(eq(maintenanceRecords.firearmId, pid(req.params.id)), isNull(maintenanceRecords.deletedAt))
			);
		res.json(rows);
	})
);

firearmsRouter.post(
	'/:id/maintenance',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const body = maintenanceCreateSchema.parse(req.body);
		const [firearm] = await db.select().from(firearms).where(and(eq(firearms.id, pid(req.params.id)), isNull(firearms.deletedAt)));
		if (!firearm) throw new ApiError(404, 'Firearm not found.');

		const result = await db.transaction(async (tx) => {
			const [record] = await tx
				.insert(maintenanceRecords)
				.values({ id: genId('M'), firearmId: firearm.id, status: 'completed', completedAt: body.date, ...body })
				.returning();

			const armorerName = req.user!.name;
			await createAuditEvent(tx, {
				type: 'maintenance',
				actorName: armorerName,
				actorUserId: req.user!.sub,
				firearmId: firearm.id,
				detail: `${body.work} logged for ${firearm.model} (${firearm.id})`
			});

			return record;
		});

		res.status(201).json(result);
	})
);

const maintenanceAssignSchema = z.object({
	armorerId: z.string().min(1),
	work: z.string().min(1),
	nextDue: z.coerce.date(),
	date: z.coerce.date().optional()
});

/**
 * Assigns a firearm's maintenance to a specific armorer — "the person in
 * charge" — as an open work item (status "assigned"), separate from logging
 * a maintenance action that's already been carried out. Also flips the
 * firearm to "maintenance" status so it can't be checked out mid-repair.
 */
firearmsRouter.post(
	'/:id/maintenance/assign',
	requireRole('admin', 'duty_officer'),
	asyncHandler(async (req, res) => {
		const body = maintenanceAssignSchema.parse(req.body);

		const result = await db.transaction(async (tx) => {
			const [firearm] = await tx.select().from(firearms).where(and(eq(firearms.id, pid(req.params.id)), isNull(firearms.deletedAt)));
			if (!firearm) throw new ApiError(404, 'Firearm not found.');

			const [armorer] = await tx.select().from(systemUsers).where(and(eq(systemUsers.id, body.armorerId), isNull(systemUsers.deletedAt)));
			if (!armorer) throw new ApiError(404, 'Armorer (system user) not found.');
			if (armorer.role !== 'armorer' && armorer.role !== 'admin') {
				throw new ApiError(400, `${armorer.name} has role "${armorer.role}" — maintenance can only be assigned to an armorer or admin.`);
			}

			const [record] = await tx
				.insert(maintenanceRecords)
				.values({
					id: genId('M'),
					firearmId: firearm.id,
					date: body.date ?? new Date(),
					armorerId: armorer.id,
					assignedByUserId: req.user!.sub,
					status: 'assigned',
					work: body.work,
					nextDue: body.nextDue
				})
				.returning();

			if (firearm.status !== 'maintenance') {
				await tx.update(firearms).set({ status: 'maintenance', updatedAt: new Date() }).where(eq(firearms.id, firearm.id));
			}

			await createAuditEvent(tx, {
				type: 'maintenance',
				actorName: req.user!.name,
				actorUserId: req.user!.sub,
				firearmId: firearm.id,
				detail: `${req.user!.name} assigned ${firearm.model} (${firearm.id}) maintenance to ${armorer.name}: ${body.work}`
			});

			return record;
		});

		res.status(201).json(result);
	})
);

const maintenanceCompleteSchema = z.object({
	work: z.string().min(1).optional(),
	returnToService: z.boolean().optional() // defaults true — set false to send straight to decommissioned instead
});

/** Marks an assigned/in-progress maintenance item done and returns the firearm to the armory. */
firearmsRouter.post(
	'/maintenance/:recordId/complete',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const body = maintenanceCompleteSchema.parse(req.body ?? {});

		const result = await db.transaction(async (tx) => {
			const [record] = await tx
				.select()
				.from(maintenanceRecords)
				.where(and(eq(maintenanceRecords.id, pid(req.params.recordId)), isNull(maintenanceRecords.deletedAt)));
			if (!record) throw new ApiError(404, 'Maintenance record not found.');
			if (record.status === 'completed') throw new ApiError(409, 'This maintenance record is already completed.');

			const [updated] = await tx
				.update(maintenanceRecords)
				.set({ status: 'completed', completedAt: new Date(), work: body.work ?? record.work, updatedAt: new Date() })
				.where(eq(maintenanceRecords.id, record.id))
				.returning();

			const [firearm] = await tx.select().from(firearms).where(eq(firearms.id, record.firearmId));
			if (firearm && firearm.status === 'maintenance') {
				const nextStatus = body.returnToService === false ? 'decommissioned' : 'in_armory';
				await tx.update(firearms).set({ status: nextStatus, updatedAt: new Date() }).where(eq(firearms.id, firearm.id));
			}

			await createAuditEvent(tx, {
				type: 'maintenance',
				actorName: req.user!.name,
				actorUserId: req.user!.sub,
				firearmId: record.firearmId,
				detail: `${req.user!.name} marked maintenance complete on ${firearm?.model ?? record.firearmId}: ${updated.work}`
			});

			return updated;
		});

		res.json(result);
	})
);

firearmsRouter.patch(
	'/maintenance/:recordId',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const body = maintenanceUpdateSchema.parse(req.body);
		const [row] = await db
			.update(maintenanceRecords)
			.set({ ...body, updatedAt: new Date() })
			.where(and(eq(maintenanceRecords.id, pid(req.params.recordId)), isNull(maintenanceRecords.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Maintenance record not found.');
		res.json(row);
	})
);

firearmsRouter.delete(
	'/maintenance/:recordId',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(maintenanceRecords)
			.set({ deletedAt: new Date() })
			.where(and(eq(maintenanceRecords.id, pid(req.params.recordId)), isNull(maintenanceRecords.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Maintenance record not found or already deleted.');
		res.json({ message: 'Maintenance record soft-deleted.', record: row });
	})
);

firearmsRouter.post(
	'/maintenance/:recordId/restore',
	requireRole('admin', 'armorer'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(maintenanceRecords)
			.set({ deletedAt: null })
			.where(and(eq(maintenanceRecords.id, pid(req.params.recordId)), isNotNull(maintenanceRecords.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Maintenance record not found or not deleted.');
		res.json({ message: 'Maintenance record restored.', record: row });
	})
);
