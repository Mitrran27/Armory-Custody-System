import rateLimit from 'express-rate-limit';

export const otpRequestLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many OTP requests. Try again in a few minutes.' }
});

export const otpVerifyLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many OTP verification attempts. Try again in a few minutes.' }
});
