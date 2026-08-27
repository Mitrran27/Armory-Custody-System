import type { SessionClaims } from '../utils/jwt.js';

declare global {
	namespace Express {
		interface Request {
			user?: SessionClaims;
		}
	}
}

export {};
