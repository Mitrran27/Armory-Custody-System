<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '$lib/stores/auth.svelte';
	import type { SystemRole } from '$lib/types';
	import {
		LayoutDashboard,
		Radar,
		Crosshair,
		ShieldUser,
		Users,
		ScrollText,
		ShieldHalf,
		ClipboardCheck
	} from 'lucide-svelte';

	const nav = [
		{ href: '/', label: 'Dashboard', icon: LayoutDashboard, roles: null },
		{ href: '/monitoring', label: 'Live Monitoring', icon: Radar, roles: null },
		{ href: '/firearms', label: 'Firearms', icon: Crosshair, roles: null },
		{ href: '/guards', label: 'Guards', icon: ShieldUser, roles: null },
		{ href: '/access-requests', label: 'Access Requests', icon: ClipboardCheck, roles: null },
		{ href: '/users', label: 'System Users', icon: Users, roles: ['admin'] as SystemRole[] }
	];

	// Audit Trail has two scopes (System / Firearm) — picked here in the
	// sidebar via two sub-links rather than a dropdown control living inside
	// the page itself, so the choice is a normal navigable URL
	// (/audit?scope=system|firearm) like every other nav item.
	const auditChildren = [
		{ href: '/audit?scope=system', label: 'System', scope: 'system' },
		{ href: '/audit?scope=firearm', label: 'Firearm', scope: 'firearm' }
	];

	const visibleNav = $derived(nav.filter((item) => !item.roles || (auth.user && item.roles.includes(auth.user.role))));

	function isActive(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	const auditActive = $derived(page.url.pathname.startsWith('/audit'));
	const activeAuditScope = $derived(page.url.searchParams.get('scope') ?? 'system');
</script>

<aside class="flex h-full w-60 shrink-0 flex-col border-r border-line bg-panel">
	<div class="flex items-center gap-2.5 border-b border-line px-5 py-4">
		<div class="flex h-8 w-8 items-center justify-center rounded-sm border border-accent/40 bg-accent-dim text-accent">
			<ShieldHalf size={17} strokeWidth={2} />
		</div>
		<div class="leading-tight">
			<p class="font-display text-[13px] font-semibold tracking-wide text-ink">EVI-Armory</p>
			<p class="text-[10px] text-ink-dim">Guard Vision</p>
		</div>
	</div>

	<nav class="flex-1 space-y-0.5 px-3 py-4">
		{#each visibleNav as item (item.href)}
			{@const active = isActive(item.href)}
			<a
				href={item.href}
				class="group flex items-center gap-2.5 rounded-sm px-3 py-2 text-[13px] transition-colors
					{active ? 'bg-panel-raised text-ink' : 'text-ink-dim hover:bg-panel-raised/60 hover:text-ink'}"
			>
				<item.icon size={16} strokeWidth={1.75} class={active ? 'text-accent' : 'text-ink-faint group-hover:text-ink-dim'} />
				<span>{item.label}</span>
				{#if active}
					<span class="ml-auto h-1 w-1 rounded-full bg-accent"></span>
				{/if}
			</a>
		{/each}

		<div>
			<div
				class="flex items-center gap-2.5 rounded-sm px-3 py-2 text-[13px]
					{auditActive ? 'text-ink' : 'text-ink-dim'}"
			>
				<ScrollText size={16} strokeWidth={1.75} class={auditActive ? 'text-accent' : 'text-ink-faint'} />
				<span>Audit Trail</span>
			</div>
			<div class="ml-[26px] space-y-0.5 border-l border-line pl-2.5">
				{#each auditChildren as child (child.scope)}
					{@const childActive = auditActive && activeAuditScope === child.scope}
					<a
						href={child.href}
						class="group flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12px] transition-colors
							{childActive ? 'bg-panel-raised text-ink' : 'text-ink-dim hover:bg-panel-raised/60 hover:text-ink'}"
					>
						<span>{child.label}</span>
						{#if childActive}
							<span class="ml-auto h-1 w-1 rounded-full bg-accent"></span>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	</nav>

	<div class="border-t border-line px-5 py-3.5">
		<p class="eyebrow">Facility</p>
		<p class="mt-1 text-[12px] text-ink-dim">Armory Block 3 — Sector 7</p>
	</div>
</aside>
