import { PUBLIC_API_URL } from '$env/static/public';
import { guardAuth } from '$lib/stores/guardAuth.svelte';
import { ApiError } from './client';

interface RequestOptions {
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined | null>;
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

export async function guardApiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (!opts.skipAuth && guardAuth.token) {
		headers.Authorization = `Bearer ${guardAuth.token}`;
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
			guardAuth.signOut();
		}
		throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
	}

	return data as T;
}
