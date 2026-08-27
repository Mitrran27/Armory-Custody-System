import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/asyncHandler.js';
import type { SessionClaims } from '../utils/jwt.js';

/**
 * Restricts a route to the given roles. Must run after requireAuth.
 * See README.md "Roles & permissions" for the full matrix this backs.
 */
export function requireRole(...roles: SessionClaims['role'][]) {
	return (req: Request, _res: Response, next: NextFunction) => {
		if (!req.user) {
			return next(new ApiError(401, 'Not authenticated.'));
		}
		if (!roles.includes(req.user.role)) {
			return next(new ApiError(403, `This action requires one of these roles: ${roles.join(', ')}.`));
		}
		next();
	};
}
