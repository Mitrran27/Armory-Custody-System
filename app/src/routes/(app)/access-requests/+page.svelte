<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { accessRequestsApi, guardsApi, firearmsApi } from '$lib/api/resources';
	import { auth } from '$lib/stores/auth.svelte';
	import { ApiError } from '$lib/api/client';
	import { Plus, Check, X as XIcon, Undo2, Loader2 } from 'lucide-svelte';
	import type { AccessRequest, AccessRequestStatus, AccessRequestType, Guard, Firearm } from '$lib/types';

	let requests = $state<AccessRequest[]>([]);
	let guards = $state<Guard[]>([]);
	let firearms = $state<Firearm[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let busyId = $state<string | null>(null);

	let statusFilter = $state<AccessRequestStatus | 'all'>('pending');

	let showCreate = $state(false);
	let creating = $state(false);
	let form = $state({ type: 'zone_access' as AccessRequestType, guardId: '', zoneId: 'zone-c', firearmId: '', notes: '' });

	const canFile = $derived(auth.hasRole('admin', 'duty_officer', 'armorer'));
	const canDecide = $derived(auth.hasRole('admin'));

	async function load() {
		loading = true;
		errorMsg = null;
		try {
			const [r, g, f] = await Promise.all([
				accessRequestsApi.list(statusFilter === 'all' ? {} : { status: statusFilter }),
				guardsApi.list(),
				firearmsApi.list()
			]);
			requests = r;
			guards = g;
			firearms = f;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load access requests.';
		} finally {
			loading = false;
		}
	}
	onMount(load);
	$effect(() => {
		statusFilter;
		load();
	});

	function statusTone(s: AccessRequestStatus) {
		if (s === 'approved') return 'clear';
		if (s === 'pending') return 'caution';
		if (s === 'rejected' || s === 'revoked') return 'alert';
		return 'neutral';
	}

	async function submitCreate(e: SubmitEvent) {
		e.preventDefault();
		creating = true;
		errorMsg = null;
		try {
			await accessRequestsApi.create({
				type: form.type,
				guardId: form.guardId,
				zoneId: form.type === 'zone_access' ? form.zoneId : undefined,
				firearmId: form.type === 'firearm_assignment' ? form.firearmId : undefined,
				notes: form.notes || undefined
			});
			showCreate = false;
			form = { type: 'zone_access', guardId: '', zoneId: 'zone-c', firearmId: '', notes: '' };
			await load();
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to file the request.';
		} finally {
			creating = false;
		}
	}

	async function decide(id: string, action: 'approve' | 'reject' | 'revoke') {
		busyId = id;
		errorMsg = null;
		try {
			if (action === 'approve') await accessRequestsApi.approve(id);
			else if (action === 'reject') await accessRequestsApi.reject(id);
			else await accessRequestsApi.revoke(id);
			await load();
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Action failed.';
		} finally {
			busyId = null;
		}
	}
</script>

<svelte:head><title>Access Requests — AAWCS</title></svelte:head>

<div class="mx-auto max-w-[1400px] space-y-6">
	<div class="flex items-end justify-between">
		<div>
			<p class="eyebrow">Armory RBAC</p>
			<h1 class="font-display text-2xl font-semibold text-ink">Access Requests</h1>
			<p class="mt-1 max-w-xl text-[13px] text-ink-dim">
				Entering the armory and being issued a specific firearm both require an approved application — only an admin can approve, reject, or revoke one.
			</p>
		</div>
		{#if canFile}
			<button onclick={() => (showCreate = !showCreate)} class="flex items-center gap-1.5 rounded-sm border border-line bg-panel-raised px-3 py-2 text-[12px] text-ink transition-colors hover:border-accent/50 hover:text-accent">
				<Plus size={14} /> File application
			</button>
		{/if}
	</div>

	{#if errorMsg}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-2.5 text-[13px] text-alert">{errorMsg}</div>
	{/if}

	{#if showCreate}
		<Panel eyebrow="New" title="File an application">
			<form onsubmit={submitCreate} class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<select bind:value={form.type} class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink-dim focus:border-accent/60 focus:outline-none">
					<option value="zone_access">Zone access (armory entry)</option>
					<option value="firearm_assignment">Firearm assignment</option>
				</select>
				<select required bind:value={form.guardId} class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink-dim focus:border-accent/60 focus:outline-none">
					<option value="">Select guard…</option>
					{#each guards as g (g.id)}<option value={g.id}>{g.rank} {g.name}</option>{/each}
				</select>
				{#if form.type === 'zone_access'}
					<select bind:value={form.zoneId} class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink-dim focus:border-accent/60 focus:outline-none">
						<option value="zone-c">Zone C — Armory</option>
					</select>
				{:else}
					<select required bind:value={form.firearmId} class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink-dim focus:border-accent/60 focus:outline-none">
						<option value="">Select firearm…</option>
						{#each firearms as f (f.id)}<option value={f.id}>{f.model} ({f.serial})</option>{/each}
					</select>
				{/if}
				<input bind:value={form.notes} placeholder="Notes (optional)" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none sm:col-span-2" />
				<div class="flex gap-2 sm:col-span-2">
					<button type="submit" disabled={creating} class="flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim px-3 py-2 text-[12px] font-medium text-accent disabled:opacity-50">
						{#if creating}<Loader2 size={13} class="animate-spin" />{/if} Submit
					</button>
					<button type="button" onclick={() => (showCreate = false)} class="rounded-sm border border-line px-3 py-2 text-[12px] text-ink-dim hover:text-ink">Cancel</button>
				</div>
			</form>
		</Panel>
	{/if}

	<Panel padded={false}>
		<div class="flex flex-wrap gap-1.5 border-b border-line px-4 py-3">
			{#each [['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['revoked', 'Revoked']] as [val, label] (val)}
				<button
					class="rounded-sm border px-2.5 py-1 text-[11px] transition-colors
						{statusFilter === val ? 'border-accent/50 bg-accent-dim text-accent' : 'border-line bg-panel-raised text-ink-dim hover:text-ink'}"
					onclick={() => (statusFilter = val as typeof statusFilter)}
				>
					{label}
				</button>
			{/each}
		</div>

		{#if loading}
			<div class="flex items-center gap-2 p-6 text-[13px] text-ink-dim"><Loader2 size={14} class="animate-spin" /> Loading…</div>
		{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-left text-[13px]">
				<thead>
					<tr class="eyebrow border-b border-line text-[10px]">
						<th class="px-4 py-2.5 font-normal">Type</th>
						<th class="px-4 py-2.5 font-normal">Guard</th>
						<th class="px-4 py-2.5 font-normal">Target</th>
						<th class="px-4 py-2.5 font-normal">Requested</th>
						<th class="px-4 py-2.5 font-normal">Status</th>
						<th class="px-4 py-2.5 font-normal"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-line-soft">
					{#each requests as r (r.id)}
						<tr class="transition-colors hover:bg-panel-raised">
							<td class="px-4 py-2.5 text-ink-dim">{r.type === 'zone_access' ? 'Armory entry' : 'Firearm assignment'}</td>
							<td class="px-4 py-2.5 text-ink">{r.guardName}</td>
							<td class="px-4 py-2.5 text-ink-dim">{r.type === 'zone_access' ? (r.zoneId ?? '—') : (r.firearmLabel ?? '—')}</td>
							<td class="data-value px-4 py-2.5 text-ink-dim">{new Date(r.requestedAt).toLocaleDateString('en-MY')}</td>
							<td class="px-4 py-2.5"><StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill></td>
							<td class="px-4 py-2.5 text-right">
								{#if canDecide && r.status === 'pending'}
									<div class="flex justify-end gap-2">
										<button onclick={() => decide(r.id, 'approve')} disabled={busyId === r.id} class="flex items-center gap-1 text-[12px] text-clear hover:underline disabled:opacity-40">
											<Check size={13} /> Approve
										</button>
										<button onclick={() => decide(r.id, 'reject')} disabled={busyId === r.id} class="flex items-center gap-1 text-[12px] text-alert hover:underline disabled:opacity-40">
											<XIcon size={13} /> Reject
										</button>
									</div>
								{:else if canDecide && r.status === 'approved'}
									<button onclick={() => decide(r.id, 'revoke')} disabled={busyId === r.id} class="flex items-center gap-1 text-[12px] text-ink-dim hover:text-alert disabled:opacity-40">
										<Undo2 size={13} /> Revoke
									</button>
								{/if}
							</td>
						</tr>
					{:else}
						<tr><td colspan="6" class="px-4 py-8 text-center text-ink-dim">No requests match this filter.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		{/if}
	</Panel>
</div>
