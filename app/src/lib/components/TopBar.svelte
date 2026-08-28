<script lang="ts">
	import { goto } from '$app/navigation';
	import { live } from '$lib/stores/live.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import StatusPill from './StatusPill.svelte';
	import NotificationBell from './NotificationBell.svelte';
	import { Wifi, WifiOff, LogOut, Sun, Moon } from 'lucide-svelte';
	import type { ZoneId } from '$lib/types';

	const zoneOrder: { id: ZoneId; short: string }[] = [
		{ id: 'zone-a', short: 'ZONE A' },
		{ id: 'zone-b', short: 'ZONE B' },
		{ id: 'zone-c', short: 'ZONE C' }
	];

	const clock = $derived(
		new Date(live.nowMs).toLocaleTimeString('en-MY', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		})
	);
	const dateStr = $derived(
		new Date(live.nowMs).toLocaleDateString('en-MY', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
	);

	const initials = $derived(
		(auth.user?.name ?? '')
			.split(' ')
			.filter((w) => w.length && /[A-Za-z]/.test(w[0]))
			.slice(-2)
			.map((w) => w[0]?.toUpperCase())
			.join('') || '—'
	);

	function signOut() {
		auth.signOut();
		goto('/login');
	}
</script>

<header class="flex h-14 shrink-0 items-center justify-between border-b border-line bg-panel/60 px-5 backdrop-blur">
	<div class="flex items-center gap-2">
		{#each zoneOrder as z (z.id)}
			{@const state = live.zones[z.id]}
			<StatusPill
				tone={state.status === 'alert' ? 'alert' : state.status === 'occupied' ? 'caution' : 'clear'}
				pulse={state.status !== 'clear'}
			>
				{z.short} · {state.status}
			</StatusPill>
		{/each}
	</div>

	<div class="flex items-center gap-5">
		<div class="flex items-center gap-1.5 font-mono text-[11px] {live.connected ? 'text-clear' : 'text-alert'}">
			{#if live.connected}
				<Wifi size={13} />
				<span>LINK OK</span>
			{:else}
				<WifiOff size={13} />
				<span>LINK DOWN</span>
			{/if}
		</div>
		<div class="text-right leading-tight">
			<p class="data-value text-[13px] text-ink">{clock}</p>
			<p class="text-[10px] text-ink-dim">{dateStr}</p>
		</div>
		<button
			onclick={() => theme.toggle()}
			class="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-panel-raised text-ink-dim transition-colors hover:border-accent/50 hover:text-accent"
			title={theme.current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
		>
			{#if theme.current === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
		</button>
		{#if auth.hasRole('admin')}
			<NotificationBell />
		{/if}
		<div class="flex items-center gap-2">
			<div class="text-right leading-tight">
				<p class="text-[12px] text-ink">{auth.user?.name ?? ''}</p>
				<p class="font-mono text-[10px] text-ink-dim uppercase">{auth.user?.role.replace('_', ' ') ?? ''}</p>
			</div>
			<div class="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-panel-raised font-mono text-[11px] text-ink-dim">
				{initials}
			</div>
			<button onclick={signOut} class="text-ink-faint transition-colors hover:text-alert" title="Sign out">
				<LogOut size={15} />
			</button>
		</div>
	</div>
</header>
