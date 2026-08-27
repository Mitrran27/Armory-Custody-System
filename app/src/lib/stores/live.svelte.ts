import { browser } from '$app/environment';
import type { AuditEvent, ZoneId, ZoneStatus } from '$lib/types';
import { auth } from './auth.svelte';
import { zonesApi, auditApi } from '$lib/api/resources';
import { ApiError } from '$lib/api/client';

interface ZoneLiveState {
	status: ZoneStatus;
	occupants: string[];
}

const emptyZones: Record<ZoneId, ZoneLiveState> = {
	'zone-a': { status: 'clear', occupants: [] },
	'zone-b': { status: 'clear', occupants: [] },
	'zone-c': { status: 'clear', occupants: [] }
};

const POLL_MS = 4000;

class LiveStore {
	zones = $state<Record<ZoneId, ZoneLiveState>>(structuredClone(emptyZones));
	events = $state<AuditEvent[]>([]);
	nowMs = $state(Date.now());
	connected = $state(true);
	loading = $state(true);
	private timers: ReturnType<typeof setInterval>[] = [];

	start() {
		if (!browser || this.timers.length) return;
		this.refresh();
		this.timers.push(setInterval(() => (this.nowMs = Date.now()), 1000));
		this.timers.push(setInterval(() => this.refresh(), POLL_MS));
	}

	stop() {
		this.timers.forEach(clearInterval);
		this.timers = [];
	}

	async refresh() {
		if (!auth.isAuthenticated) return;
		try {
			const [zones, events] = await Promise.all([zonesApi.list(), auditApi.list({ limit: 60 })]);
			const next = structuredClone(emptyZones);
			for (const z of zones) {
				next[z.id] = { status: z.status, occupants: z.occupants };
			}
			this.zones = next;
			this.events = events;
			this.connected = true;
			this.loading = false;
		} catch (err) {
			this.connected = !(err instanceof ApiError && err.status === 0);
			this.loading = false;
		}
	}
}

export const live = new LiveStore();
