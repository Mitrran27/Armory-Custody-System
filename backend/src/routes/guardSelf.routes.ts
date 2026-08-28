import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accessRequests, doors, guards, qrTokens } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { requireGuardAuth } from '../middleware/auth.js';
import { createNotification } from '../services/notifications.js';
import { randomBytes } from 'node:crypto';

export const guardSelfRouter = Router();
guardSelfRouter.use(requireGuardAuth);

const ARMORY_ZONE_ID = 'zone-c';

/** Every access request this guard has ever filed, newest first. */
guardSelfRouter.get(
	'/access-requests',
	asyncHandler(async (req, res) => {
		const rows = await db.query.accessRequests.findMany({
			where: and(eq(accessRequests.guardId, req.guard!.sub), isNull(accessRequests.deletedAt)),
			orderBy: desc(accessRequests.requestedAt),
			with: { zone: true, firearm: true, decidedBy: true }
		});
		res.json(rows);
	})
);

/**
 * "Apply for entering the armory" — idempotent by design: if this guard
 * already has a pending or approved zone_access request for the armory,
 * that existing one is returned rather than filing a duplicate. Filing a
 * genuinely new one notifies every admin.
 */
guardSelfRouter.post(
	'/apply-armory',
	asyncHandler(async (req, res) => {
		const [guard] = await db.select().from(guards).where(and(eq(guards.id, req.guard!.sub), isNull(guards.deletedAt)));
		if (!guard) throw new ApiError(404, 'Guard not found.');
		if (guard.status === 'suspended') throw new ApiError(403, 'Suspended guards cannot apply for armory access.');

		const [existing] = await db
			.select()
			.from(accessRequests)
			.where(
				and(
					eq(accessRequests.guardId, guard.id),
					eq(accessRequests.zoneId, ARMORY_ZONE_ID),
					eq(accessRequests.type, 'zone_access'),
					isNull(accessRequests.deletedAt),
					inArray(accessRequests.status, ['pending', 'approved'])
				)
			);
		if (existing) {
			return res.json(existing);
		}

		const result = await db.transaction(async (tx) => {
			const [request] = await tx
				.insert(accessRequests)
				.values({
					id: genId('AR'),
					type: 'zone_access',
					guardId: guard.id,
					zoneId: ARMORY_ZONE_ID,
					status: 'pending'
				})
				.returning();

			await createNotification(tx, {
				recipientRole: 'admin',
				type: 'access_request_submitted',
				title: 'New armory access request',
				body: `${guard.rank} ${guard.name} applied for armory access.`,
				relatedAccessRequestId: request.id
			});

			return request;
		});

		res.status(201).json(result);
	})
);

const QR_TOKEN_TTL_SECONDS = Number(process.env.QR_TOKEN_TTL_SECONDS ?? 90);

/** Same mechanism as the staff-issued QR token in guards.routes.ts, but scoped to the signed-in guard's own account. */
guardSelfRouter.post(
	'/qr-token',
	asyncHandler(async (req, res) => {
		const doorId = String((req.body ?? {}).doorId ?? 'DOOR-01');

		const [guard] = await db.select().from(guards).where(and(eq(guards.id, req.guard!.sub), isNull(guards.deletedAt)));
		if (!guard) throw new ApiError(404, 'Guard not found.');
		const [door] = await db.select().from(doors).where(and(eq(doors.id, doorId), isNull(doors.deletedAt)));
		if (!door) throw new ApiError(404, 'Door not found.');
		if (door.gate !== 'qr') throw new ApiError(400, `${door.label} does not use QR access.`);

		await db
			.update(qrTokens)
			.set({ consumedAt: new Date() })
			.where(and(eq(qrTokens.guardId, guard.id), eq(qrTokens.doorId, door.id), isNull(qrTokens.consumedAt)));

		const expiresAt = new Date(Date.now() + QR_TOKEN_TTL_SECONDS * 1000);
		const [token] = await db
			.insert(qrTokens)
			.values({ id: genId('QRT'), guardId: guard.id, doorId: door.id, code: randomBytes(16).toString('hex'), expiresAt })
			.returning();

		res.status(201).json({ code: token.code, doorId: door.id, expiresAt: token.expiresAt, ttlSeconds: QR_TOKEN_TTL_SECONDS });
	})
);
