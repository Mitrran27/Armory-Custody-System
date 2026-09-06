import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { activityLogs } from '../db/schema.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

export const activityLogsRouter = Router();
activityLogsRouter.use(requireAuth);

const listQuerySchema = z.object({
	guardId: z.string().optional(),
	systemUserId: z.string().optional(),
	firearmId: z.string().optional(),
	zoneId: z.string().optional(),
	eventType: z
		.enum(['clock_in', 'clock_out', 'zone_entry', 'zone_exit', 'firearm_taken', 'firearm_returned', 'chamber_clearance', 'cleaning'])
		.optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
	limit: z.coerce.number().int().min(1).max(500).optional()
});

/**
 * The operational log — NOT the audit trail. This is what backs the
 * "Activity Log" sections on the Guards and Firearms detail pages: who did
 * what, when, with a photo if one was captured. See services/activityLog.ts
 * for why this is a separate table from audit_events.
 */
activityLogsRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const q = listQuerySchema.parse(req.query);
		const conditions: SQL[] = [];
		if (q.guardId) conditions.push(eq(activityLogs.guardId, q.guardId));
		if (q.systemUserId) conditions.push(eq(activityLogs.systemUserId, q.systemUserId));
		if (q.firearmId) conditions.push(eq(activityLogs.firearmId, q.firearmId));
		if (q.zoneId) conditions.push(eq(activityLogs.zoneId, q.zoneId));
		if (q.eventType) conditions.push(eq(activityLogs.eventType, q.eventType));
		if (q.from) conditions.push(gte(activityLogs.timestamp, q.from));
		if (q.to) conditions.push(lte(activityLogs.timestamp, q.to));

		const rows = await db
			.select()
			.from(activityLogs)
			.where(conditions.length ? and(...conditions) : undefined)
			.orderBy(desc(activityLogs.timestamp))
			.limit(q.limit ?? 100);

		res.json(rows);
	})
);
