import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { systemUsers } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('admin'));

const roleEnum = z.enum(['admin', 'duty_officer', 'armorer', 'auditor']);
const statusEnum = z.enum(['active', 'disabled']);

const createSchema = z.object({
	name: z.string().min(1),
	email: z.string().email(),
	role: roleEnum,
	mfaEnabled: z.boolean().optional(),
	status: statusEnum.optional()
});
const updateSchema = createSchema.partial();

usersRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const includeDeleted = req.query.includeDeleted === 'true';
		const rows = await db
			.select()
			.from(systemUsers)
			.where(includeDeleted ? undefined : isNull(systemUsers.deletedAt));
		res.json(rows);
	})
);

usersRouter.get(
	'/:id',
	asyncHandler(async (req, res) => {
		const [row] = await db.select().from(systemUsers).where(eq(systemUsers.id, pid(req.params.id)));
		if (!row) throw new ApiError(404, 'User not found.');
		res.json(row);
	})
);

usersRouter.post(
	'/',
	asyncHandler(async (req, res) => {
		const body = createSchema.parse(req.body);
		const [row] = await db
			.insert(systemUsers)
			.values({
				id: genId('U'),
				name: body.name,
				email: body.email.toLowerCase(),
				role: body.role,
				mfaEnabled: body.mfaEnabled ?? false,
				status: body.status ?? 'active'
			})
			.returning();
		res.status(201).json(row);
	})
);

usersRouter.patch(
	'/:id',
	asyncHandler(async (req, res) => {
		const body = updateSchema.parse(req.body);
		const [row] = await db
			.update(systemUsers)
			.set({ ...body, email: body.email?.toLowerCase(), updatedAt: new Date() })
			.where(and(eq(systemUsers.id, pid(req.params.id)), isNull(systemUsers.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'User not found.');
		res.json(row);
	})
);

/** Soft delete. */
usersRouter.delete(
	'/:id',
	asyncHandler(async (req, res) => {
		if (pid(req.params.id) === req.user!.sub) {
			throw new ApiError(400, "You can't delete your own account while signed in as it.");
		}
		const [row] = await db
			.update(systemUsers)
			.set({ deletedAt: new Date() })
			.where(and(eq(systemUsers.id, pid(req.params.id)), isNull(systemUsers.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'User not found or already deleted.');
		res.json({ message: 'User soft-deleted.', user: row });
	})
);

usersRouter.post(
	'/:id/restore',
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(systemUsers)
			.set({ deletedAt: null })
			.where(and(eq(systemUsers.id, pid(req.params.id)), isNotNull(systemUsers.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'User not found or not deleted.');
		res.json({ message: 'User restored.', user: row });
	})
);
