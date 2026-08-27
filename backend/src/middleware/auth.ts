import type { NextFunction, Request, Response } from 'express';
import { verifySession } from '../utils/jwt.js';
import { ApiError } from '../utils/asyncHandler.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
	const header = req.headers.authorization;
	if (!header?.startsWith('Bearer ')) {
		return next(new ApiError(401, 'Missing or malformed Authorization header.'));
	}
	const token = header.slice('Bearer '.length);
	try {
		req.user = verifySession(token);
		next();
	} catch {
		next(new ApiError(401, 'Invalid or expired session. Please sign in again.'));
	}
}
