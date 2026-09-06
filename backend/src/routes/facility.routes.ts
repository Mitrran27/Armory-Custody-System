import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rooms, doors, qrScanners, qrTokens } from '../db/schema.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { admitGuardToZone } from '../services/zoneEntry.js';
import { createAuditEvent } from '../services/audit.js';
import { saveCapturedImage } from '../utils/imageStorage.js';

export const facilityRouter = Router();
facilityRouter.use(requireAuth);

facilityRouter.get(
	'/rooms',
	asyncHandler(async (_req, res) => {
		const rows = await db.query.rooms.findMany({
			where: isNull(rooms.deletedAt),
			with: { racks: true, doors: { where: isNull(doors.deletedAt), with: { qrScanner: true } } }
		});
		res.json(rows);
	})
);

facilityRouter.get(
	'/doors',
	asyncHandler(async (_req, res) => {
		const rows = await db.query.doors.findMany({ where: isNull(doors.deletedAt), with: { qrScanner: true } });
		res.json(rows);
	})
);

facilityRouter.get(
	'/qr-scanners',
	asyncHandler(async (_req, res) => {
		const rows = await db.select().from(qrScanners).where(isNull(qrScanners.deletedAt));
		res.json(rows);
	})
);

// --- QR gate: redeem a code issued by POST /api/guards/:id/qr-token ----

const scanSchema = z.object({ code: z.string().min(1), guardId: z.string().min(1), imageDataUrl: z.string().optional() });

/**
 * "Door 1 cut into the west wall, with the QR scanner mounted just outside
 * it" — this is what actually sits behind that scanner. Redeems a code
 * issued by POST /api/guards/:id/qr-token: checks it's for this door, not
 * expired, not already used, then admits the guard into whichever zone this
 * door's room belongs to (via the shared admitGuardToZone service — same
 * authorization + occupancy logic as a manual /api/zones/:id/entry call).
 *
 * DEV NOTE: same placeholder-auth caveat as qr-token issuance — a real
 * physical reader would authenticate as its own device, not a staff JWT.
 */
facilityRouter.post(
	'/doors/:doorId/scan',
	requireRole('admin', 'duty_officer', 'armorer'),
	asyncHandler(async (req, res) => {
		const { code, guardId, imageDataUrl } = scanSchema.parse(req.body);
		const doorId = pid(req.params.doorId);

		const [door] = await db.select().from(doors).where(and(eq(doors.id, doorId), isNull(doors.deletedAt)));
		if (!door) throw new ApiError(404, 'Door not found.');
		if (door.gate !== 'qr') throw new ApiError(400, `${door.label} does not use QR access.`);

		const [room] = await db.select().from(rooms).where(eq(rooms.id, door.roomId));
		if (!room) throw new ApiError(500, 'Door is not attached to a room.');

		const [token] = await db
			.select()
			.from(qrTokens)
			.where(and(eq(qrTokens.code, code), eq(qrTokens.doorId, door.id), eq(qrTokens.guardId, guardId)));

		if (!token) {
			await createAuditEvent(db, {
				type: 'alert',
				severity: 'warning',
				actorName: 'Unidentified',
				zoneId: room.id,
				detail: `QR scan rejected at ${door.label}: code does not match guard ${guardId}`
			});
			throw new ApiError(401, 'Invalid code for this guard/door.');
		}
		if (token.consumedAt) {
			await createAuditEvent(db, {
				type: 'alert',
				severity: 'critical',
				actorName: 'Unidentified',
				actorGuardId: guardId,
				zoneId: room.id,
				detail: `QR replay attempt at ${door.label}: code already used at ${token.consumedAt.toISOString()}`
			});
			throw new ApiError(409, 'This code has already been used.');
		}
		if (token.expiresAt < new Date()) {
			await createAuditEvent(db, {
				type: 'alert',
				severity: 'warning',
				actorName: 'Unidentified',
				actorGuardId: guardId,
				zoneId: room.id,
				detail: `Expired QR code presented at ${door.label}`
			});
			throw new ApiError(410, 'This code has expired. Request a new one.');
		}

		await db.update(qrTokens).set({ consumedAt: new Date() }).where(eq(qrTokens.id, token.id));

		const imageUrl = imageDataUrl ? await saveCapturedImage(imageDataUrl) : null;
		const result = await admitGuardToZone({ guardId, zoneId: room.id, method: 'qr', imageUrl });
		res.status(201).json(result);
	})
);
