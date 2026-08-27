import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cameras } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const camerasRouter = Router();
camerasRouter.use(requireAuth);

const createSchema = z.object({
	label: z.string().min(1),
	zoneId: z.string().min(1),
	posX: z.number(),
	posY: z.number(),
	posZ: z.number(),
	targetX: z.number(),
	targetY: z.number(),
	targetZ: z.number(),
	fovDeg: z.number().min(1).max(180),
	status: z.enum(['online', 'offline']).optional()
});
const updateSchema = createSchema.partial();

camerasRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const includeDeleted = req.query.includeDeleted === 'true';
		const rows = await db
			.select()
			.from(cameras)
			.where(includeDeleted ? undefined : isNull(cameras.deletedAt));
		res.json(rows);
	})
);

camerasRouter.post(
	'/',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const body = createSchema.parse(req.body);
		const [row] = await db
			.insert(cameras)
			.values({ id: genId('CAM'), ...body, status: body.status ?? 'online' })
			.returning();
		res.status(201).json(row);
	})
);

camerasRouter.patch(
	'/:id',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const body = updateSchema.parse(req.body);
		const [row] = await db
			.update(cameras)
			.set({ ...body, updatedAt: new Date() })
			.where(and(eq(cameras.id, pid(req.params.id)), isNull(cameras.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Camera not found.');
		res.json(row);
	})
);

camerasRouter.delete(
	'/:id',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(cameras)
			.set({ deletedAt: new Date() })
			.where(and(eq(cameras.id, pid(req.params.id)), isNull(cameras.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Camera not found or already deleted.');
		res.json({ message: 'Camera soft-deleted.', camera: row });
	})
);

camerasRouter.post(
	'/:id/restore',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(cameras)
			.set({ deletedAt: null })
			.where(and(eq(cameras.id, pid(req.params.id)), isNotNull(cameras.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Camera not found or not deleted.');
		res.json({ message: 'Camera restored.', camera: row });
	})
);
