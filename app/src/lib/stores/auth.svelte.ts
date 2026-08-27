import { browser } from '$app/environment';
import { apiFetch, ApiError } from '$lib/api/client';
import type { SystemRole } from '$lib/types';

export interface SessionUser {
	id: string;
	name: string;
	email: string;
	role: SystemRole;
	mfaEnabled: boolean;
}

const STORAGE_KEY = 'aawcs.session';

function loadStored(): { token: string; user: SessionUser } | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

const stored = loadStored();

class AuthStore {
	token = $state<string | null>(stored?.token ?? null);
	user = $state<SessionUser | null>(stored?.user ?? null);
	/** True once we've checked localStorage / attempted a session restore, so pages know whether to render a redirect or wait. */
	ready = $state(false);

	get isAuthenticated() {
		return !!this.token && !!this.user;
	}

	hasRole(...roles: SystemRole[]) {
		return !!this.user && roles.includes(this.user.role);
	}

	async requestOtp(email: string) {
		return apiFetch<{ message: string; expiresInMinutes: number }>('/api/auth/request-otp', {
			method: 'POST',
			body: { email },
			skipAuth: true
		});
	}

	async verifyOtp(email: string, code: string) {
		const result = await apiFetch<{ token: string; user: SessionUser }>('/api/auth/verify-otp', {
			method: 'POST',
			body: { email, code },
			skipAuth: true
		});
		this.token = result.token;
		this.user = result.user;
		this.persist();
		return result;
	}

	async refreshMe() {
		if (!this.token) return;
		try {
			this.user = await apiFetch<SessionUser>('/api/auth/me');
			this.persist();
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) this.signOut();
		}
	}

	signOut() {
		this.token = null;
		this.user = null;
		if (browser) localStorage.removeItem(STORAGE_KEY);
	}

	private persist() {
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: this.token, user: this.user }));
	}

	init() {
		this.ready = true;
	}
}

export const auth = new AuthStore();
