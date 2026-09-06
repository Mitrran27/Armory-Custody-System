<script lang="ts">
	import { resolveImageUrl } from '$lib/api/client';
	import { ImageOff } from 'lucide-svelte';
	import type { ActivityLog } from '$lib/types';

	let {
		logs,
		emptyMessage = 'No activity recorded yet.',
		showPerson = true
	}: {
		logs: ActivityLog[];
		emptyMessage?: string;
		showPerson?: boolean;
	} = $props();

	let previewImage = $state<string | null>(null);

	const EVENT_LABEL: Record<string, string> = {
		clock_in: 'Clocked in',
		clock_out: 'Clocked out',
		zone_entry: 'Zone entry',
		zone_exit: 'Zone exit',
		firearm_taken: 'Firearm taken',
		firearm_returned: 'Firearm returned',
		chamber_clearance: 'Chamber clearance',
		cleaning: 'Cleaning'
	};

	function fmt(iso: string) {
		return new Date(iso).toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="overflow-x-auto">
	<table class="w-full text-left text-[13px]">
		<thead>
			<tr class="eyebrow border-b border-line text-[10px]">
				<th class="px-4 py-2.5 font-normal">Photo</th>
				<th class="px-4 py-2.5 font-normal">Timestamp</th>
				<th class="px-4 py-2.5 font-normal">Event</th>
				{#if showPerson}<th class="px-4 py-2.5 font-normal">Person</th>{/if}
				<th class="px-4 py-2.5 font-normal">Details</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-line-soft">
			{#each logs as log (log.id)}
				<tr class="transition-colors hover:bg-panel-raised">
					<td class="px-4 py-2.5">
						{#if log.imageUrl}
							<button onclick={() => (previewImage = resolveImageUrl(log.imageUrl))}>
								<img src={resolveImageUrl(log.imageUrl)} alt="" class="h-9 w-9 rounded-sm object-cover transition-opacity hover:opacity-80" />
							</button>
						{:else}
							<div class="flex h-9 w-9 items-center justify-center rounded-sm bg-panel-raised text-ink-faint"><ImageOff size={13} /></div>
						{/if}
					</td>
					<td class="data-value px-4 py-2.5 text-ink-dim whitespace-nowrap">{fmt(log.timestamp)}</td>
					<td class="px-4 py-2.5 text-ink-dim whitespace-nowrap">{EVENT_LABEL[log.eventType] ?? log.eventType}</td>
					{#if showPerson}
						<td class="px-4 py-2.5 whitespace-nowrap">
							<span class="text-ink">{log.personName}</span>
							<span class="ml-1 text-[10px] text-ink-faint">({log.guardId ? 'guard' : 'staff'})</span>
						</td>
					{/if}
					<td class="px-4 py-2.5 text-ink">{log.detail}</td>
				</tr>
			{:else}
				<tr><td colspan={showPerson ? 5 : 4} class="px-4 py-8 text-center text-ink-dim">{emptyMessage}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

{#if previewImage}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="fixed inset-0 cursor-default bg-black/80" onclick={() => (previewImage = null)} aria-label="Close image preview"></button>
		<img src={previewImage} alt="" class="relative max-h-[85vh] max-w-[85vw] rounded-sm border border-line object-contain" />
	</div>
{/if}
