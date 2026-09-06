import { PUBLIC_API_URL } from '$env/static/public';
import { auth } from '$lib/stores/auth.svelte';

export class ApiError extends Error {
	status: number;
	details?: unknown;
	constructor(status: number, message: string, details?: unknown) {
		super(message);
		this.status = status;
		this.details = details;
	}
}

interface RequestOptions {
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined | null>;
	/** Skip attaching the bearer token — only auth/request-otp & verify-otp need this. */
	skipAuth?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
	const url = new URL(path, PUBLIC_API_URL);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== null && value !== '') {
				url.searchParams.set(key, String(value));
			}
		}
	}
	return url.toString();
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (!opts.skipAuth && auth.token) {
		headers.Authorization = `Bearer ${auth.token}`;
	}

	let res: Response;
	try {
		res = await fetch(buildUrl(path, opts.query), {
			method: opts.method ?? 'GET',
			headers,
			body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
		});
	} catch {
		throw new ApiError(0, `Could not reach the API at ${PUBLIC_API_URL}. Is the backend running?`);
	}

	const text = await res.text();
	const data = text ? JSON.parse(text) : null;

	if (!res.ok) {
		if (res.status === 401 && !opts.skipAuth) {
			auth.signOut();
		}
		throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
	}

	return data as T;
}

/** Activity log photos are served from the backend (relative paths like "/uploads/xxx.jpg"), not the frontend origin. */
export function resolveImageUrl(path: string | null | undefined): string | null {
	if (!path) return null;
	return new URL(path, PUBLIC_API_URL).toString();
}
