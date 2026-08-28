import { browser } from '$app/environment';
import { guardApiFetch } from '$lib/api/guardClient';

export interface GuardProfile {
	id: string;
	name: string;
	rank: string;
	unit: string;
	email: string | null;
	status?: string;
}

const STORAGE_KEY = 'aawcs.guardSession';

function loadStored(): { token: string; guard: GuardProfile } | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

const stored = loadStored();

class GuardAuthStore {
	token = $state<string | null>(stored?.token ?? null);
	guard = $state<GuardProfile | null>(stored?.guard ?? null);

	get isAuthenticated() {
		return !!this.token && !!this.guard;
	}

	async requestOtp(email: string) {
		return guardApiFetch<{ message: string; expiresInMinutes: number }>('/api/guard-auth/request-otp', {
			method: 'POST',
			body: { email },
			skipAuth: true
		});
	}

	async verifyOtp(email: string, code: string) {
		const result = await guardApiFetch<{ token: string; guard: GuardProfile }>('/api/guard-auth/verify-otp', {
			method: 'POST',
			body: { email, code },
			skipAuth: true
		});
		this.token = result.token;
		this.guard = result.guard;
		this.persist();
		return result;
	}

	async refreshMe() {
		if (!this.token) return;
		try {
			this.guard = await guardApiFetch<GuardProfile>('/api/guard-auth/me');
			this.persist();
		} catch {
			this.signOut();
		}
	}

	signOut() {
		this.token = null;
		this.guard = null;
		if (browser) localStorage.removeItem(STORAGE_KEY);
	}

	private persist() {
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: this.token, guard: this.guard }));
	}
}

export const guardAuth = new GuardAuthStore();
