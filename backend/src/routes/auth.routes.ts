import { Router } from 'express';
import { z } from 'zod';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { systemUsers, otpCodes } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import { signSession } from '../utils/jwt.js';
import type { SessionClaims } from '../utils/jwt.js';
import { asyncHandler, ApiError, pid } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { otpRequestLimiter, otpVerifyLimiter } from '../middleware/rateLimiters.js';

export const authRouter = Router();

const DEV_OTP_CODE = process.env.DEV_OTP_CODE ?? '123456';
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES ?? 10);

const requestOtpSchema = z.object({ email: z.string().email() });
const verifyOtpSchema = z.object({ email: z.string().email(), code: z.string().min(4).max(12) });

/**
 * POST /api/auth/request-otp
 * Looks up the system user by email and issues a one-time code.
 *
 * DEV NOTE: no email provider is wired up yet, so the code is always
 * DEV_OTP_CODE ("123456" by default — see .env). It's still recorded in the
 * otp_codes table with a real expiry and single-use enforcement, so swapping
 * in a real email/SMS send later is a one-line change in this handler, not a
 * redesign of the flow.
 */
authRouter.post(
	'/request-otp',
	otpRequestLimiter,
	asyncHandler(async (req, res) => {
		const { email } = requestOtpSchema.parse(req.body);

		const [user] = await db
			.select()
			.from(systemUsers)
			.where(and(eq(systemUsers.email, email.toLowerCase()), isNull(systemUsers.deletedAt)));

		if (!user) {
			throw new ApiError(404, 'No system account found for that email.');
		}
		if (user.status === 'disabled') {
			throw new ApiError(403, 'This account has been disabled. Contact an administrator.');
		}

		const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
		await db.insert(otpCodes).values({
			id: genId('OTP'),
			userId: user.id,
			code: DEV_OTP_CODE,
			expiresAt
		});

		// Stand-in for an email/SMS send — visible in server logs for local dev.
		console.log(`[auth] OTP for ${user.email}: ${DEV_OTP_CODE} (expires ${expiresAt.toISOString()})`);

		res.json({ message: 'OTP sent.', expiresInMinutes: OTP_TTL_MINUTES });
	})
);

/**
 * POST /api/auth/verify-otp
 * Verifies the code, marks it consumed, and issues a session JWT.
 */
authRouter.post(
	'/verify-otp',
	otpVerifyLimiter,
	asyncHandler(async (req, res) => {
		const { email, code } = verifyOtpSchema.parse(req.body);

		const [user] = await db
			.select()
			.from(systemUsers)
			.where(and(eq(systemUsers.email, email.toLowerCase()), isNull(systemUsers.deletedAt)));

		if (!user) {
			throw new ApiError(404, 'No system account found for that email.');
		}

		const [latestOtp] = await db
			.select()
			.from(otpCodes)
			.where(eq(otpCodes.userId, user.id))
			.orderBy(desc(otpCodes.createdAt))
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

		await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, latestOtp.id));
		await db.update(systemUsers).set({ lastLogin: new Date() }).where(eq(systemUsers.id, user.id));

		const token = signSession({ sub: user.id, email: user.email, role: user.role as SessionClaims['role'], name: user.name });

		res.json({
			token,
			user: { id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled }
		});
	})
);

/** GET /api/auth/me — returns the current session's user profile. */
authRouter.get(
	'/me',
	requireAuth,
	asyncHandler(async (req, res) => {
		const [user] = await db
			.select()
			.from(systemUsers)
			.where(and(eq(systemUsers.id, req.user!.sub), isNull(systemUsers.deletedAt)));
		if (!user) throw new ApiError(404, 'User not found.');
		res.json({ id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled });
	})
);
