import { Router } from 'express';
import { db } from '../db/index.js';
import { roles } from '../db/schema.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

rolesRouter.get(
	'/',
	asyncHandler(async (_req, res) => {
		const rows = await db.select().from(roles);
		res.json(rows);
	})
);
