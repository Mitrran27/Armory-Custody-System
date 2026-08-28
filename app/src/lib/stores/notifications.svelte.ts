import { browser } from '$app/environment';
import type { Notification } from '$lib/types';
import { auth } from './auth.svelte';
import { notificationsApi } from '$lib/api/resources';

const POLL_MS = 5000;

class NotificationsStore {
	items = $state<Notification[]>([]);
	private timer: ReturnType<typeof setInterval> | null = null;

	get unreadCount() {
		return this.items.filter((n) => !n.read).length;
	}

	start() {
		if (!browser || this.timer) return;
		this.refresh();
		this.timer = setInterval(() => this.refresh(), POLL_MS);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	async refresh() {
		if (!auth.isAuthenticated || !auth.hasRole('admin')) return;
		try {
			this.items = await notificationsApi.list();
		} catch {
			// Transient — next poll will retry. Don't spam the UI with errors for a background refresh.
		}
	}

	async markRead(id: string) {
		this.items = this.items.map((n) => (n.id === id ? { ...n, read: true } : n));
		try {
			await notificationsApi.markRead(id);
		} catch {
			this.refresh();
		}
	}

	async markAllRead() {
		this.items = this.items.map((n) => ({ ...n, read: true }));
		try {
			await notificationsApi.markAllRead();
		} catch {
			this.refresh();
		}
	}
}

export const notifications = new NotificationsStore();
