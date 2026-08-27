<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '$lib/components/Panel.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { live } from '$lib/stores/live.svelte';
	import { guardsApi, firearmsApi, camerasApi } from '$lib/api/resources';
	import type { Guard, Firearm, CameraConfig } from '$lib/types';
	import { QrCode, ScanFace, Radio, ArrowRight, Loader2 } from 'lucide-svelte';

	let guards = $state<Guard[]>([]);
	let firearms = $state<Firearm[]>([]);
	let cameras = $state<CameraConfig[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			[guards, firearms, cameras] = await Promise.all([guardsApi.list(), firearmsApi.list(), camerasApi.list()]);
		} finally {
			loading = false;
		}
	});

	const onDuty = $derived(guards.filter((g) => g.status === 'active' && g.shift !== 'Unassigned'));
	const checkedOut = $derived(firearms.filter((f) => f.status === 'checked_out'));
	const maintenanceDue = $derived(firearms.filter((f) => f.status === 'maintenance' || f.tagHealth !== 'ok'));
	const camerasOnline = $derived(cameras.filter((c) => c.status === 'online').length);

	function timeAgo(iso: string) {
		const diff = Math.max(0, Date.now() - new Date(iso).getTime());
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}

	function severityTone(sev: string) {
		return sev === 'critical' ? 'alert' : sev === 'warning' ? 'caution' : 'neutral';
	}
</script>

<svelte:head><title>Dashboard — AAWCS</title></svelte:head>

<div class="mx-auto max-w-[1400px] space-y-6">
	<div>
		<p class="eyebrow">Operations Overview</p>
		<h1 class="font-display text-2xl font-semibold text-ink">Armory Command Dashboard</h1>
	</div>

	{#if loading}
		<div class="flex items-center gap-2 text-[13px] text-ink-dim"><Loader2 size={14} class="animate-spin" /> Loading live data…</div>
	{:else}
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			<StatCard label="Guards on duty" value={String(onDuty.length)} sub="of {guards.length} total roster" />
			<StatCard
				label="Firearms checked out"
				value={String(checkedOut.length)}
				sub="of {firearms.length} inventoried"
				tone={checkedOut.length > 0 ? 'caution' : 'clear'}
			/>
			<StatCard
				label="Maintenance / tag flags"
				value={String(maintenanceDue.length)}
				sub="needs armorer attention"
				tone={maintenanceDue.length > 0 ? 'alert' : 'clear'}
			/>
			<StatCard label="Cameras online" value={`${camerasOnline}/${cameras.length}`} tone={camerasOnline === cameras.length ? 'clear' : 'alert'} />
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
		<div class="space-y-6 xl:col-span-2">
			<Panel eyebrow="Access Sequence" title="How a guard reaches the vault">
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<div class="rounded-sm border border-line bg-panel-raised p-4">
						<div class="flex items-center gap-2 text-accent"><QrCode size={16} /><span class="eyebrow text-accent">Step 01</span></div>
						<p class="mt-2 text-sm text-ink">QR scan at outer door</p>
						<p class="mt-1 text-xs text-ink-dim">90s one-time token unlocks Zone A → B.</p>
					</div>
					<div class="rounded-sm border border-line bg-panel-raised p-4">
						<div class="flex items-center gap-2 text-accent"><ScanFace size={16} /><span class="eyebrow text-accent">Step 02</span></div>
						<p class="mt-2 text-sm text-ink">Facial match in Zone B</p>
						<p class="mt-1 text-xs text-ink-dim">Liveness-checked match unlocks Zone B → C.</p>
					</div>
					<div class="rounded-sm border border-line bg-panel-raised p-4">
						<div class="flex items-center gap-2 text-accent"><Radio size={16} /><span class="eyebrow text-accent">Step 03</span></div>
						<p class="mt-2 text-sm text-ink">RFID threshold read</p>
						<p class="mt-1 text-xs text-ink-dim">Firearm crossing Zone C door logged automatically.</p>
					</div>
				</div>
			</Panel>

			<Panel eyebrow="Live Feed" title="Recent events">
				{#snippet actions()}
					<a href="/audit" class="flex items-center gap-1 font-mono text-[11px] text-accent hover:underline">
						Full audit trail <ArrowRight size={12} />
					</a>
				{/snippet}
				<ul class="divide-y divide-line-soft">
					{#each live.events.slice(0, 6) as event (event.id)}
						<li class="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
							<StatusPill tone={severityTone(event.severity)}>{event.type.replace(/_/g, ' ')}</StatusPill>
							<div class="min-w-0 flex-1">
								<p class="truncate text-[13px] text-ink">{event.detail}</p>
								<p class="text-[11px] text-ink-dim">{event.actor} · {timeAgo(event.timestamp)}</p>
							</div>
						</li>
					{:else}
						<li class="py-4 text-[13px] text-ink-dim">No events yet.</li>
					{/each}
				</ul>
			</Panel>
		</div>

		<div class="space-y-6">
			<Panel eyebrow="Zone Status" title="Current occupancy">
				<div class="space-y-3">
					{#each Object.entries(live.zones) as [zoneId, state] (zoneId)}
						<div class="flex items-center justify-between rounded-sm border border-line bg-panel-raised px-3 py-2.5">
							<div>
								<p class="font-mono text-[11px] tracking-wide text-ink-dim uppercase">{zoneId.replace('zone-', 'Zone ')}</p>
								<p class="text-[12px] text-ink-faint">{state.occupants.length} occupant(s)</p>
							</div>
							<StatusPill
								tone={state.status === 'alert' ? 'alert' : state.status === 'occupied' ? 'caution' : 'clear'}
								pulse={state.status !== 'clear'}
							>
								{state.status}
							</StatusPill>
						</div>
					{/each}
				</div>
				<a
					href="/monitoring"
					class="mt-4 flex items-center justify-center gap-1.5 rounded-sm border border-line bg-panel py-2 text-[12px] text-ink-dim transition-colors hover:border-accent/50 hover:text-accent"
				>
					Open 3D room view <ArrowRight size={13} />
				</a>
			</Panel>

			<Panel eyebrow="Attention" title="Flags requiring review">
				<ul class="space-y-2">
					{#each maintenanceDue as f (f.id)}
						<li class="flex items-center justify-between rounded-sm border border-line bg-panel-raised px-3 py-2 text-[12px]">
							<span class="text-ink">{f.model} · {f.serial}</span>
							<StatusPill tone={f.tagHealth === 'tamper' ? 'alert' : 'caution'}>
								{f.status === 'maintenance' ? 'in service' : f.tagHealth}
							</StatusPill>
						</li>
					{:else}
						<li class="text-[12px] text-ink-dim">Nothing flagged.</li>
					{/each}
				</ul>
			</Panel>
		</div>
	</div>
</div>
