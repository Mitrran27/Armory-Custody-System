import type { SessionClaims, GuardSessionClaims } from '../utils/jwt.js';

declare global {
	namespace Express {
		interface Request {
			user?: SessionClaims;
			guard?: GuardSessionClaims;
		}
	}
}

export {};
