import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accessRequests, firearms } from '../db/schema.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { createActivityLog } from '../services/activityLog.js';
import { createAuditEvent } from '../services/audit.js';
import { saveCapturedImage } from '../utils/imageStorage.js';

/**
 * Endpoints for the armorer's tablet (see app's /tablet route) — the fixed
 * device an armorer stationed in the armory uses. Deliberately thin: this
 * reuses the same system-user (staff) login every other back-office page
 * uses, and the actual firearm checkout/checkin/service actions are the
 * same /api/firearms/... endpoints the main dashboard uses — an armorer
 * already has that role. What's here is just what's specific to the
 * tablet: clocking in/out, and a queue of who's expected.
 */
export const tabletRouter = Router();
tabletRouter.use(requireAuth, requireRole('admin', 'armorer'));

const clockSchema = z.object({ imageDataUrl: z.string().optional() });

tabletRouter.post(
	'/clock-in',
	asyncHandler(async (req, res) => {
		const { imageDataUrl } = clockSchema.parse(req.body ?? {});
		const imageUrl = imageDataUrl ? await saveCapturedImage(imageDataUrl) : null;
		const log = await createActivityLog(db, {
			eventType: 'clock_in',
			personName: req.user!.name,
			systemUserId: req.user!.sub,
			detail: `${req.user!.name} clocked in`,
			imageUrl
		});
		await createAuditEvent(db, {
			type: 'clock_in',
			actorName: req.user!.name,
			actorUserId: req.user!.sub,
			detail: `${req.user!.name} clocked in`
		});
		res.status(201).json(log);
	})
);

tabletRouter.post(
	'/clock-out',
	asyncHandler(async (req, res) => {
		const { imageDataUrl } = clockSchema.parse(req.body ?? {});
		const imageUrl = imageDataUrl ? await saveCapturedImage(imageDataUrl) : null;
		const log = await createActivityLog(db, {
			eventType: 'clock_out',
			personName: req.user!.name,
			systemUserId: req.user!.sub,
			detail: `${req.user!.name} clocked out`,
			imageUrl
		});
		await createAuditEvent(db, {
			type: 'clock_out',
			actorName: req.user!.name,
			actorUserId: req.user!.sub,
			detail: `${req.user!.name} clocked out`
		});
		res.status(201).json(log);
	})
);

/**
 * "All details of the person who wants to access the firearms" — every
 * guard with an approved-but-not-yet-actioned request: either approved for
 * armory entry but not currently inside, or approved for a specific
 * firearm that hasn't been handed to them yet.
 */
tabletRouter.get(
	'/queue',
	asyncHandler(async (_req, res) => {
		const zoneAccess = await db.query.accessRequests.findMany({
			where: and(eq(accessRequests.type, 'zone_access'), eq(accessRequests.status, 'approved'), isNull(accessRequests.deletedAt)),
			with: { guard: true }
		});
		const firearmAssignments = await db.query.accessRequests.findMany({
			where: and(eq(accessRequests.type, 'firearm_assignment'), eq(accessRequests.status, 'approved'), isNull(accessRequests.deletedAt)),
			with: { guard: true, firearm: true }
		});

		const pendingZoneEntry = zoneAccess.filter((r) => r.guard && r.guard.currentZoneId !== r.zoneId);
		const pendingHandover = firearmAssignments.filter((r) => r.firearm && r.firearm.status === 'in_armory');

		res.json({ pendingZoneEntry, pendingHandover });
	})
);

/** Firearms currently checked out, with who's holding them — the "receive a return" side of the queue. */
tabletRouter.get(
	'/checked-out',
	asyncHandler(async (_req, res) => {
		const rows = await db.query.firearms.findMany({
			where: and(eq(firearms.status, 'checked_out'), isNull(firearms.deletedAt)),
			with: { holder: true }
		});
		res.json(rows);
	})
);
