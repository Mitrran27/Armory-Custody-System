import jwt from 'jsonwebtoken';

export interface SessionClaims {
	sub: string; // system user id
	email: string;
	role: 'admin' | 'duty_officer' | 'armorer' | 'auditor';
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
