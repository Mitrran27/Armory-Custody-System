import { Router } from 'express';
import { z } from 'zod';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { guards, guardOtpCodes } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { signGuardSession } from '../utils/jwt.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { requireGuardAuth } from '../middleware/auth.js';
import { otpRequestLimiter, otpVerifyLimiter } from '../middleware/rateLimiters.js';

export const guardAuthRouter = Router();

const DEV_OTP_CODE = process.env.DEV_OTP_CODE ?? '123456';
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES ?? 10);

const requestOtpSchema = z.object({ email: z.string().email() });
const verifyOtpSchema = z.object({ email: z.string().email(), code: z.string().min(4).max(12) });

/**
 * Same shape and same DEV_OTP_CODE placeholder as the system-user login in
 * auth.routes.ts (see that file's notes on what swapping in real email
 * delivery looks like) — but against the guards table and guard_otp_codes,
 * entirely separate from system users.
 */
guardAuthRouter.post(
	'/request-otp',
	otpRequestLimiter,
	asyncHandler(async (req, res) => {
		const { email } = requestOtpSchema.parse(req.body);

		const [guard] = await db
			.select()
			.from(guards)
			.where(and(eq(guards.email, email.toLowerCase()), isNull(guards.deletedAt)));

		if (!guard) {
			throw new ApiError(404, 'No guard account found for that email.');
		}
		if (guard.status === 'suspended') {
			throw new ApiError(403, 'This account has been suspended. Contact your duty officer.');
		}

		const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
		await db.insert(guardOtpCodes).values({
			id: genId('GOTP'),
			guardId: guard.id,
			code: DEV_OTP_CODE,
			expiresAt
		});

		console.log(`[guard-auth] OTP for ${guard.email}: ${DEV_OTP_CODE} (expires ${expiresAt.toISOString()})`);

		res.json({ message: 'OTP sent.', expiresInMinutes: OTP_TTL_MINUTES });
	})
);

guardAuthRouter.post(
	'/verify-otp',
	otpVerifyLimiter,
	asyncHandler(async (req, res) => {
		const { email, code } = verifyOtpSchema.parse(req.body);

		const [guard] = await db
			.select()
			.from(guards)
			.where(and(eq(guards.email, email.toLowerCase()), isNull(guards.deletedAt)));
		if (!guard) throw new ApiError(404, 'No guard account found for that email.');

		const [latestOtp] = await db
			.select()
			.from(guardOtpCodes)
			.where(eq(guardOtpCodes.guardId, guard.id))
			.orderBy(desc(guardOtpCodes.createdAt))
			.limit(1);

		if (!latestOtp || latestOtp.consumedAt) {
			throw new ApiError(400, 'No pending OTP for this account. Request a new one.');
		}
		if (latestOtp.expiresAt < new Date()) {
			throw new ApiError(400, 'OTP has expired. Request a new one.');
		}
		if (latestOtp.code !== code) {
			throw new ApiError(400, 'Incorrect code.');
		}

		await db.update(guardOtpCodes).set({ consumedAt: new Date() }).where(eq(guardOtpCodes.id, latestOtp.id));

		const token = signGuardSession({ sub: guard.id, email: guard.email ?? email, name: guard.name });

		res.json({
			token,
			guard: { id: guard.id, name: guard.name, rank: guard.rank, unit: guard.unit, email: guard.email }
		});
	})
);

guardAuthRouter.get(
	'/me',
	requireGuardAuth,
	asyncHandler(async (req, res) => {
		const [guard] = await db
			.select()
			.from(guards)
			.where(and(eq(guards.id, req.guard!.sub), isNull(guards.deletedAt)));
		if (!guard) throw new ApiError(404, 'Guard not found.');
		res.json({ id: guard.id, name: guard.name, rank: guard.rank, unit: guard.unit, email: guard.email, status: guard.status });
	})
);
