import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { guards, qrTokens, doors } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { randomBytes } from 'node:crypto';

export const guardsRouter = Router();
guardsRouter.use(requireAuth);

const clearanceEnum = z.enum(['level_1', 'level_2', 'level_3']);
const statusEnum = z.enum(['active', 'suspended', 'off_duty']);

const createSchema = z.object({
	name: z.string().min(1),
	rank: z.string().min(1),
	companyId: z.string().min(1),
	clearance: clearanceEnum,
	status: statusEnum.optional(),
	photoInitials: z.string().min(1).max(4),
	biometricEnrolled: z.boolean().optional(),
	tokenIssued: z.boolean().optional(),
	shift: z.string().min(1),
	currentZoneId: z.string().nullable().optional()
});
const updateSchema = createSchema.partial();

guardsRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const includeDeleted = req.query.includeDeleted === 'true';
		const rows = await db.query.guards.findMany({
			where: includeDeleted ? undefined : isNull(guards.deletedAt),
			with: { company: true }
		});
		res.json(rows);
	})
);

guardsRouter.get(
	'/:id',
	asyncHandler(async (req, res) => {
		const row = await db.query.guards.findFirst({ where: eq(guards.id, pid(req.params.id)), with: { company: true } });
		if (!row) throw new ApiError(404, 'Guard not found.');
		res.json(row);
	})
);

guardsRouter.post(
	'/',
	requireRole('admin', 'duty_officer'),
	asyncHandler(async (req, res) => {
		const body = createSchema.parse(req.body);
		const [row] = await db
			.insert(guards)
			.values({
				id: genId('G'),
				...body,
				status: body.status ?? 'active',
				biometricEnrolled: body.biometricEnrolled ?? false,
				tokenIssued: body.tokenIssued ?? false
			})
			.returning();
		res.status(201).json(row);
	})
);

guardsRouter.patch(
	'/:id',
	requireRole('admin', 'duty_officer'),
	asyncHandler(async (req, res) => {
		const body = updateSchema.parse(req.body);
		const [row] = await db
			.update(guards)
			.set({ ...body, updatedAt: new Date() })
			.where(and(eq(guards.id, pid(req.params.id)), isNull(guards.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Guard not found.');
		res.json(row);
	})
);

guardsRouter.delete(
	'/:id',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(guards)
			.set({ deletedAt: new Date() })
			.where(and(eq(guards.id, pid(req.params.id)), isNull(guards.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Guard not found or already deleted.');
		res.json({ message: 'Guard soft-deleted.', guard: row });
	})
);

guardsRouter.post(
	'/:id/restore',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(guards)
			.set({ deletedAt: null })
			.where(and(eq(guards.id, pid(req.params.id)), isNotNull(guards.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Guard not found or not deleted.');
		res.json({ message: 'Guard restored.', guard: row });
	})
);

// --- QR gate token issuance ---------------------------------------------

const QR_TOKEN_TTL_SECONDS = Number(process.env.QR_TOKEN_TTL_SECONDS ?? 90);

/**
 * Issues a short-lived, single-use QR code for a guard at a specific door
 * (Door 1 / the QR gate, in the seeded layout). This is "the guard's app
 * shows a QR code that's active for ~90 seconds" from the original brief.
 *
 * DEV NOTE: in a real deployment, the guard's own device would call this
 * (after its own device-level auth, which is a separate concern from the
 * back-office OTP login this backend implements). For now it's reachable by
 * staff roles as a stand-in, the same way OTP is hardcoded to 123456 for
 * now — see README.
 */
guardsRouter.post(
	'/:id/qr-token',
	requireRole('admin', 'duty_officer', 'armorer'),
	asyncHandler(async (req, res) => {
		const doorId = String((req.body ?? {}).doorId ?? 'DOOR-01');

		const [guard] = await db.select().from(guards).where(and(eq(guards.id, pid(req.params.id)), isNull(guards.deletedAt)));
		if (!guard) throw new ApiError(404, 'Guard not found.');
		const [door] = await db.select().from(doors).where(and(eq(doors.id, doorId), isNull(doors.deletedAt)));
		if (!door) throw new ApiError(404, 'Door not found.');
		if (door.gate !== 'qr') throw new ApiError(400, `${door.label} does not use QR access.`);

		// Invalidate any still-live token for this guard at this door before issuing a new one.
		await db
			.update(qrTokens)
			.set({ consumedAt: new Date() })
			.where(and(eq(qrTokens.guardId, guard.id), eq(qrTokens.doorId, door.id), isNull(qrTokens.consumedAt)));

		const expiresAt = new Date(Date.now() + QR_TOKEN_TTL_SECONDS * 1000);
		const [token] = await db
			.insert(qrTokens)
			.values({
				id: genId('QRT'),
				guardId: guard.id,
				doorId: door.id,
				code: randomBytes(16).toString('hex'),
				expiresAt
			})
			.returning();

		res.status(201).json({ code: token.code, doorId: door.id, expiresAt: token.expiresAt, ttlSeconds: QR_TOKEN_TTL_SECONDS });
	})
);
