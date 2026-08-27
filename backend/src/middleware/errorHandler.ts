import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/asyncHandler.js';
import { ZodError } from 'zod';

export function notFoundHandler(req: Request, res: Response) {
	res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
	if (err instanceof ZodError) {
		return res.status(400).json({ error: 'Validation failed.', details: err.flatten() });
	}
	if (err instanceof ApiError) {
		return res.status(err.status).json({ error: err.message });
	}
	// Postgres unique-violation
	if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505') {
		return res.status(409).json({ error: 'A record with that value already exists.' });
	}
	console.error(err);
	res.status(500).json({ error: 'Internal server error.' });
}
