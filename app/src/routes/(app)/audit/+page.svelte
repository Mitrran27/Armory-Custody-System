<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import ActivityLogTable from '$lib/components/ActivityLogTable.svelte';
	import { auditApi, activityLogsApi } from '$lib/api/resources';
	import { ApiError } from '$lib/api/client';
	import { Search, Download, ShieldCheck, Loader2 } from 'lucide-svelte';
	import type { AuditEvent, AuditEventType, AuditSeverity, ActivityLog } from '$lib/types';

	// Which scope to show is picked from the sidebar (System / Firearm sub-links
	// under Audit Trail), not an in-page control — so it's a real URL
	// (/audit?scope=system|firearm), not local component state.
	const scope = $derived((page.url.searchParams.get('scope') === 'firearm' ? 'firearm' : 'system') as 'system' | 'firearm');

	let events = $state<AuditEvent[]>([]);
	let firearmLogs = $state<ActivityLog[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let exporting = $state(false);

	let query = $state('');
	let typeFilter = $state<AuditEventType | 'all'>('all');
	let severityFilter = $state<AuditSeverity | 'all'>('all');

	// "System" is who's on site and what they're doing — clock in/out, zone
	// entry/exit, QR/facial access, overrides. "Firearm" is everything about
	// a specific weapon — taken, returned, maintained, serviced — so these
	// two lists are partitioned by whether an event has a firearmId, not by
	// a hardcoded type list, since that stays correct even if new event
	// types are added later.
	const typeOptions: Array<[AuditEventType | 'all', string]> = [
		['all', 'All events'],
		['qr_scan', 'QR scan'],
		['facial_match', 'Facial match'],
		['facial_fail', 'Facial fail'],
		['clock_in', 'Clocked in'],
		['clock_out', 'Clocked out'],
		['override', 'Override'],
		['admin_action', 'Admin action'],
		['alert', 'Alert']
	];

	async function load() {
		loading = true;
		errorMsg = null;
		try {
			if (scope === 'system') {
				const all = await auditApi.list({
					type: typeFilter === 'all' ? undefined : typeFilter,
					severity: severityFilter === 'all' ? undefined : severityFilter,
					limit: 300
				});
				events = all.filter((e) => !e.firearmId);
			} else {
				firearmLogs = await activityLogsApi.list({ limit: 300 });
			}
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load the audit trail.';
		} finally {
			loading = false;
		}
	}
	onMount(load);
	$effect(() => {
		scope;
		typeFilter;
		severityFilter;
		load();
	});

	const filteredEvents = $derived(
		events.filter((e) => !query || [e.actor, e.detail, e.id].some((v) => v.toLowerCase().includes(query.toLowerCase())))
	);
	const filteredFirearmLogs = $derived(
		firearmLogs.filter(
			(l) => !!l.firearmId && (!query || [l.personName, l.detail, l.id].some((v) => v.toLowerCase().includes(query.toLowerCase())))
		)
	);

	function severityTone(sev: AuditSeverity) {
		return sev === 'critical' ? 'alert' : sev === 'warning' ? 'caution' : 'neutral';
	}

	async function exportRange() {
		exporting = true;
		try {
			const data = scope === 'system' ? events : filteredFirearmLogs;
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `aawcs-${scope}-audit-export-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Export failed.';
		} finally {
			exporting = false;
		}
	}
</script>

<svelte:head><title>Audit Trail — EVI-Armory Guard Vision</title></svelte:head>

<div class="mx-auto max-w-[1400px] space-y-6">
	<div class="flex items-end justify-between">
		<div>
			<p class="eyebrow">Compliance</p>
			<h1 class="font-display text-2xl font-semibold text-ink">Audit Trail</h1>
			<p class="mt-1 flex items-center gap-1.5 text-[13px] text-ink-dim">
				{#if scope === 'system'}
					<ShieldCheck size={14} class="text-clear" /> Hash-chained, append-only — records cannot be edited after the fact.
				{:else}
					<ShieldCheck size={14} class="text-clear" /> Per-firearm history — who took it, who used it, who serviced it.
				{/if}
			</p>
		</div>
		<button
			onclick={exportRange}
			disabled={exporting}
			class="flex items-center gap-1.5 rounded-sm border border-line bg-panel-raised px-3 py-2 text-[12px] text-ink transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
		>
			{#if exporting}<Loader2 size={14} class="animate-spin" />{:else}<Download size={14} />{/if} Export range
		</button>
	</div>

	{#if errorMsg}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-2.5 text-[13px] text-alert">{errorMsg}</div>
	{/if}

	<Panel padded={false}>
		<div class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
			<div class="relative flex-1 min-w-[220px]">
				<Search size={14} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
				<input
					bind:value={query}
					placeholder="Search person, detail, event ID…"
					class="w-full rounded-sm border border-line bg-panel-raised py-1.5 pr-3 pl-8 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
				/>
			</div>
			{#if scope === 'system'}
				<select
					bind:value={typeFilter}
					class="rounded-sm border border-line bg-panel-raised px-2.5 py-1.5 text-[12px] text-ink-dim focus:border-accent/60 focus:outline-none"
				>
					{#each typeOptions as [val, label] (val)}
						<option value={val}>{label}</option>
					{/each}
				</select>
				<div class="flex gap-1.5">
					{#each [['all', 'All'], ['info', 'Info'], ['warning', 'Warning'], ['critical', 'Critical']] as [val, label] (val)}
						<button
							class="rounded-sm border px-2.5 py-1 text-[11px] transition-colors
								{severityFilter === val ? 'border-accent/50 bg-accent-dim text-accent' : 'border-line bg-panel-raised text-ink-dim hover:text-ink'}"
							onclick={() => (severityFilter = val as typeof severityFilter)}
						>
							{label}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if loading}
			<div class="flex items-center gap-2 p-6 text-[13px] text-ink-dim"><Loader2 size={14} class="animate-spin" /> Loading…</div>
		{:else if scope === 'system'}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-[13px]">
					<thead>
						<tr class="eyebrow border-b border-line text-[10px]">
							<th class="px-4 py-2.5 font-normal">Timestamp</th>
							<th class="px-4 py-2.5 font-normal">Event</th>
							<th class="px-4 py-2.5 font-normal">Zone</th>
							<th class="px-4 py-2.5 font-normal">Person</th>
							<th class="px-4 py-2.5 font-normal">Detail</th>
							<th class="px-4 py-2.5 font-normal">Record hash</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line-soft">
						{#each filteredEvents as e (e.id)}
							<tr class="transition-colors hover:bg-panel-raised">
								<td class="data-value px-4 py-2.5 whitespace-nowrap text-ink-dim">{new Date(e.timestamp).toLocaleString('en-MY')}</td>
								<td class="px-4 py-2.5"><StatusPill tone={severityTone(e.severity)}>{e.type.replace(/_/g, ' ')}</StatusPill></td>
								<td class="px-4 py-2.5 text-ink-dim">{e.zone ? e.zone.replace('zone-', 'Zone ').toUpperCase() : '—'}</td>
								<td class="px-4 py-2.5 text-ink">{e.actor}</td>
								<td class="px-4 py-2.5 text-ink-dim">{e.detail}</td>
								<td class="data-value px-4 py-2.5 text-ink-faint">{e.hash.slice(0, 6)}…{e.hash.slice(-6)}</td>
							</tr>
						{:else}
							<tr><td colspan="6" class="px-4 py-8 text-center text-ink-dim">No events match this filter.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<ActivityLogTable logs={filteredFirearmLogs} emptyMessage="No firearm activity matches this filter." />
		{/if}
	</Panel>
</div>
