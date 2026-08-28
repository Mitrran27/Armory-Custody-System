import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, requireRole('admin'));

notificationsRouter.get(
	'/',
	asyncHandler(async (req, res) => {
		const rows = await db
			.select()
			.from(notifications)
			.where(eq(notifications.recipientRole, req.user!.role))
			.orderBy(desc(notifications.createdAt))
			.limit(50);
		res.json(rows);
	})
);

notificationsRouter.post(
	'/:id/read',
	asyncHandler(async (req, res) => {
		const [row] = await db
			.update(notifications)
			.set({ read: true })
			.where(and(eq(notifications.id, pid(req.params.id)), eq(notifications.recipientRole, req.user!.role)))
			.returning();
		if (!row) throw new ApiError(404, 'Notification not found.');
		res.json(row);
	})
);

notificationsRouter.post(
	'/read-all',
	asyncHandler(async (req, res) => {
		await db.update(notifications).set({ read: true }).where(eq(notifications.recipientRole, req.user!.role));
		res.json({ message: 'All notifications marked read.' });
	})
);
