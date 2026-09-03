import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { companies } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

const createSchema = z.object({ name: z.string().min(1), description: z.string().nullable().optional() });
const updateSchema = createSchema.partial();

companiesRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const includeDeleted = req.query.includeDeleted === 'true';
		const rows = await db
			.select()
			.from(companies)
			.where(includeDeleted ? undefined : isNull(companies.deletedAt));
		res.json(rows);
	})
);

companiesRouter.post(
	'/',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const body = createSchema.parse(req.body);
		const [row] = await db
			.insert(companies)
			.values({ id: genId('CO'), name: body.name, description: body.description ?? null })
			.returning();
		res.status(201).json(row);
	})
);

companiesRouter.patch(
	'/:id',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const body = updateSchema.parse(req.body);
		const [row] = await db
			.update(companies)
			.set({ ...body, updatedAt: new Date() })
			.where(and(eq(companies.id, pid(req.params.id)), isNull(companies.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Company not found.');
		res.json(row);
	})
);

companiesRouter.delete(
	'/:id',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(companies)
			.set({ deletedAt: new Date() })
			.where(and(eq(companies.id, pid(req.params.id)), isNull(companies.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Company not found or already deleted.');
		res.json({ message: 'Company soft-deleted.', company: row });
	})
);

companiesRouter.post(
	'/:id/restore',
	requireRole('admin'),
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(companies)
			.set({ deletedAt: null })
			.where(and(eq(companies.id, pid(req.params.id)), isNotNull(companies.deletedAt)))
			.returning();
		if (!row) throw new ApiError(404, 'Company not found or not deleted.');
		res.json({ message: 'Company restored.', company: row });
	})
);
