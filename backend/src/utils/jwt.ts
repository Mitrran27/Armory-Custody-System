import jwt from 'jsonwebtoken';

export interface SessionClaims {
	sub: string; // system user id
	email: string;
	role: 'admin' | 'duty_officer' | 'armorer' | 'auditor';
	name: string;
}

/**
 * A guard's PWA session. Deliberately a distinct shape from SessionClaims
 * (system users) — a `type: 'guard'` discriminant, no `role` field — so
 * there's no risk of a guard session ever being mistaken for, or reused as,
 * a back-office staff session even though both use the same OTP login flow
 * and the same JWT secret.
 */
export interface GuardSessionClaims {
	type: 'guard';
	sub: string; // guard id
	email: string;
	name: string;
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '12h';

if (!JWT_SECRET) {
	throw new Error('JWT_SECRET is not set — copy .env.example to .env and fill it in.');
}

export function signSession(claims: SessionClaims): string {
	return jwt.sign(claims, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function verifySession(token: string): SessionClaims {
	return jwt.verify(token, JWT_SECRET as string) as SessionClaims;
}

export function signGuardSession(claims: Omit<GuardSessionClaims, 'type'>): string {
	return jwt.sign({ ...claims, type: 'guard' }, JWT_SECRET as string, {
		expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
	});
}

export function verifyGuardSession(token: string): GuardSessionClaims {
	const claims = jwt.verify(token, JWT_SECRET as string) as GuardSessionClaims;
	if (claims.type !== 'guard') throw new Error('Not a guard session token.');
	return claims;
}
