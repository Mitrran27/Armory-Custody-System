<script lang="ts">
	import { X, Package, DoorOpen, QrCode, ScanFace, AlertTriangle } from 'lucide-svelte';
	import type { Firearm, DoorConfig, FirearmStatus } from '$lib/types';

	let {
		zoneLabel,
		facilitySubtitle,
		firearms,
		doors,
		onClose
	}: {
		zoneLabel: string;
		facilitySubtitle: string;
		firearms: Firearm[];
		doors: DoorConfig[];
		onClose: () => void;
	} = $props();

	const rackNames = $derived(
		[...new Set(firearms.map((f) => f.rack))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
	);
	const byRack = $derived(
		Object.fromEntries(rackNames.map((r) => [r, firearms.filter((f) => f.rack === r).sort((a, b) => a.slot.localeCompare(b.slot))]))
	);

	const checkedOutCount = $derived(firearms.filter((f) => f.status === 'checked_out').length);
	const needsAttentionCount = $derived(firearms.filter((f) => f.status === 'maintenance' || f.tagHealth !== 'ok').length);

	const statusDot: Record<FirearmStatus, string> = {
		in_armory: 'bg-clear',
		checked_out: 'bg-caution',
		maintenance: 'bg-accent',
		decommissioned: 'bg-ink-faint'
	};

	function gateIcon(gate: DoorConfig['gate']) {
		return gate === 'qr' ? QrCode : ScanFace;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
	<button
		class="fixed inset-0 cursor-default bg-black/60 backdrop-blur-sm"
		onclick={onClose}
		aria-label="Close layout view"
	></button>
	<div
		class="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-line bg-panel shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="Rack layout"
	>
		<header class="flex items-center gap-3 border-b border-line bg-accent-dim/60 px-5 py-4">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-accent/40 bg-accent-dim text-accent">
				<Package size={18} />
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="font-display text-base font-semibold text-ink">{zoneLabel}</h2>
				<p class="truncate text-[12px] text-ink-dim">{facilitySubtitle}</p>
			</div>
			<button onclick={onClose} class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-panel-raised hover:text-ink">
				<X size={16} />
			</button>
		</header>

		<div class="grid grid-cols-3 gap-px border-b border-line bg-line">
			<div class="bg-panel px-5 py-3">
				<p class="eyebrow">Total Firearms</p>
				<p class="data-value mt-1 text-xl font-semibold text-ink">{firearms.length}</p>
			</div>
			<div class="bg-panel px-5 py-3">
				<p class="eyebrow">Checked Out</p>
				<p class="data-value mt-1 text-xl font-semibold {checkedOutCount > 0 ? 'text-caution' : 'text-ink'}">{checkedOutCount}</p>
			</div>
			<div class="bg-panel px-5 py-3">
				<p class="eyebrow">Needs Attention</p>
				<p class="data-value mt-1 text-xl font-semibold {needsAttentionCount > 0 ? 'text-alert' : 'text-ink'}">{needsAttentionCount}</p>
			</div>
		</div>

		{#if doors.length}
			<div class="flex items-center gap-4 border-b border-line px-5 py-2.5 text-[12px] text-ink-dim">
				<DoorOpen size={13} class="text-ink-faint" />
				{#each doors as d, i (d.id)}
					{@const Icon = gateIcon(d.gate)}
					{#if i > 0}<span class="text-ink-faint">·</span>{/if}
					<span class="flex items-center gap-1.5">
						<Icon size={12} class="text-accent" />
						{d.label}
					</span>
				{/each}
			</div>
		{/if}

		<div class="flex-1 overflow-y-auto px-5 py-4">
			{#if rackNames.length === 0}
				<p class="py-8 text-center text-[13px] text-ink-dim">No firearms recorded in this room yet.</p>
			{:else}
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each rackNames as rackName (rackName)}
						{@const items = byRack[rackName]}
						<div class="rounded-sm border border-line bg-panel-raised p-3">
							<div class="mb-2 flex items-center justify-between">
								<p class="text-[13px] font-medium text-ink">{rackName}</p>
								<span class="font-mono text-[11px] text-ink-dim">{items.length} item{items.length === 1 ? '' : 's'}</span>
							</div>
							{#if items.length === 0}
								<p class="py-4 text-center text-[12px] text-ink-faint italic">Empty rack</p>
							{:else}
								<ul class="space-y-1.5">
									{#each items as f (f.id)}
										<li class="flex items-center justify-between rounded-sm border border-line bg-panel px-2.5 py-1.5">
											<div class="flex min-w-0 items-center gap-2">
												<span class="h-2 w-2 shrink-0 rounded-full {statusDot[f.status]}"></span>
												<div class="min-w-0">
													<p class="truncate text-[12px] text-ink">{f.model}</p>
													<p class="data-value truncate text-[10px] text-ink-dim">{f.slot} · {f.serial}</p>
												</div>
											</div>
											{#if f.tagHealth !== 'ok'}
												<AlertTriangle size={12} class="shrink-0 text-alert" />
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<footer class="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3 text-[11px] text-ink-dim">
			<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-clear"></span>In armory</span>
			<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-caution"></span>Checked out</span>
			<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-accent"></span>Maintenance</span>
			<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-ink-faint"></span>Decommissioned</span>
			<span class="ml-auto flex items-center gap-1.5"><AlertTriangle size={12} class="text-alert" /> Tag health issue</span>
		</footer>
	</div>
</div>
