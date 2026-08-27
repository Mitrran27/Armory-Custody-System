import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { auditEvents } from '../db/schema.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { createAuditEvent } from '../services/audit.js';

export const auditRouter = Router();
auditRouter.use(requireAuth);

const listQuerySchema = z.object({
	type: z
		.enum([
			'qr_scan',
			'facial_match',
			'facial_fail',
			'firearm_taken',
			'firearm_returned',
			'maintenance',
			'override',
			'admin_action',
			'alert'
		])
		.optional(),
	severity: z.enum(['info', 'warning', 'critical']).optional(),
	zoneId: z.string().optional(),
	firearmId: z.string().optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
	limit: z.coerce.number().int().min(1).max(500).optional()
});

auditRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const q = listQuerySchema.parse(req.query);
		const conditions: SQL[] = [];
		if (q.type) conditions.push(eq(auditEvents.type, q.type));
		if (q.severity) conditions.push(eq(auditEvents.severity, q.severity));
		if (q.zoneId) conditions.push(eq(auditEvents.zoneId, q.zoneId));
		if (q.firearmId) conditions.push(eq(auditEvents.firearmId, q.firearmId));
		if (q.from) conditions.push(gte(auditEvents.timestamp, q.from));
		if (q.to) conditions.push(lte(auditEvents.timestamp, q.to));

		const rows = await db
			.select()
			.from(auditEvents)
			.where(conditions.length ? and(...conditions) : undefined)
			.orderBy(desc(auditEvents.timestamp))
			.limit(q.limit ?? 100);

		res.json(rows);
	})
);

auditRouter.get(
	'/:id',
	asyncHandler(async (req, res) => {
		const [row] = await db.select().from(auditEvents).where(eq(auditEvents.id, pid(req.params.id)));
		if (!row) throw new ApiError(404, 'Audit event not found.');
		res.json(row);
	})
);

const manualEventSchema = z.object({
	type: z.enum(['override', 'admin_action', 'alert']),
	severity: z.enum(['info', 'warning', 'critical']).optional(),
	zoneId: z.string().nullable().optional(),
	firearmId: z.string().nullable().optional(),
	detail: z.string().min(1)
});

/**
 * Manual entries for things the system can't infer on its own — a supervisor
 * override, a manually raised alert, etc. Deliberately restricted to
 * admin/duty_officer, and deliberately the *only* write route this file
 * exposes: no PATCH, no DELETE, anywhere in this file. See schema.ts and
 * services/audit.ts for why.
 */
auditRouter.post(
	'/',
	requireRole('admin', 'duty_officer'),
	asyncHandler(async (req, res) => {
		const body = manualEventSchema.parse(req.body);
		const event = await createAuditEvent(db, {
			...body,
			actorName: req.user!.name,
			actorUserId: req.user!.sub
		});
		res.status(201).json(event);
	})
);
