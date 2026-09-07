<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import PhotoCaptureModal from '$lib/components/PhotoCaptureModal.svelte';
	import { firearmsApi, guardsApi, usersApi } from '$lib/api/resources';
	import { auth } from '$lib/stores/auth.svelte';
	import { ApiError } from '$lib/api/client';
	import { Search, X, Wrench, Plus, Loader2, LogOut, LogIn, CheckCircle2, Crosshair, Sparkles } from 'lucide-svelte';
	import type { Firearm, FirearmStatus, Guard, SystemUser } from '$lib/types';

	let firearms = $state<Firearm[]>([]);
	let guards = $state<Guard[]>([]);
	let armorers = $state<SystemUser[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let busy = $state(false);

	let query = $state('');
	let statusFilter = $state<FirearmStatus | 'all'>('all');
	let selectedId = $state<string | null>(null);

	let showCreate = $state(false);
	let form = $state({ serial: '', rfidTag: '', model: '', caliber: '', rack: '', slot: '' });

	let checkoutGuardId = $state('');
	let assignArmorerId = $state('');
	let assignWork = $state('');
	let assignNextDue = $state('');
	let showAssign = $state(false);

	// Pending action awaiting a captured photo — set right before opening PhotoCaptureModal, consumed once a photo (or skip) comes back.
	let pendingAction = $state<'checkout' | 'checkin' | null>(null);
	let pendingServiceTypes = $state<('chamber_clearance' | 'cleaning')[]>([]);

	const canManageFirearms = $derived(auth.hasRole('admin', 'armorer'));
	const canCheckout = $derived(auth.hasRole('admin', 'armorer', 'duty_officer'));
	const canAssignMaintenance = $derived(auth.hasRole('admin', 'duty_officer'));
	const canCompleteMaintenance = $derived(auth.hasRole('admin', 'armorer'));

	async function loadAll() {
		loading = true;
		errorMsg = null;
		try {
			const tasks: Promise<any>[] = [firearmsApi.list(), guardsApi.list()];
			if (auth.hasRole('admin')) tasks.push(usersApi.list());
			const [f, g, u] = await Promise.all(tasks);
			firearms = f;
			guards = g;
			if (u) armorers = u.filter((x: SystemUser) => x.role === 'armorer' || x.role === 'admin');
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load firearms.';
		} finally {
			loading = false;
		}
	}
	onMount(loadAll);

	const filtered = $derived(
		firearms.filter((f) => {
			const matchesQuery = !query || [f.serial, f.model, f.rfidTag, f.rack].some((v) => v.toLowerCase().includes(query.toLowerCase()));
			const matchesStatus = statusFilter === 'all' || f.status === statusFilter;
			return matchesQuery && matchesStatus;
		})
	);
	const selected = $derived(firearms.find((f) => f.id === selectedId) ?? null);

	function guardName(id: string | null) {
		if (!id) return '—';
		return guards.find((g) => g.id === id)?.name ?? id;
	}

	function statusTone(s: FirearmStatus) {
		if (s === 'checked_out') return 'caution';
		if (s === 'maintenance') return 'accent';
		if (s === 'decommissioned') return 'neutral';
		return 'clear';
	}

	function fmtDate(iso: string) {
		return new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	async function refreshOne(id: string) {
		const updated = await firearmsApi.get(id);
		firearms = firearms.map((f) => (f.id === id ? updated : f));
	}

	async function submitCreate(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		errorMsg = null;
		try {
			const created = await firearmsApi.create(form);
			firearms = [...firearms, created];
			showCreate = false;
			form = { serial: '', rfidTag: '', model: '', caliber: '', rack: '', slot: '' };
			selectedId = created.id;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to register firearm.';
		} finally {
			busy = false;
		}
	}

	function startCheckout() {
		if (!checkoutGuardId) return;
		pendingAction = 'checkout';
	}
	function startCheckin() {
		pendingAction = 'checkin';
	}

	async function finishCheckoutOrCheckin(imageDataUrl?: string) {
		if (!selected || !pendingAction) return;
		busy = true;
		errorMsg = null;
		try {
			if (pendingAction === 'checkout') {
				const { firearm } = await firearmsApi.checkout(selected.id, checkoutGuardId, imageDataUrl);
				firearms = firearms.map((f) => (f.id === firearm.id ? firearm : f));
				checkoutGuardId = '';
			} else {
				const { firearm } = await firearmsApi.checkin(selected.id, imageDataUrl);
				firearms = firearms.map((f) => (f.id === firearm.id ? firearm : f));
			}
			await refreshOne(selected.id);
			pendingAction = null;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Action failed.';
		} finally {
			busy = false;
		}
	}

	let showServiceModal = $state(false);
	function openServiceModal(type: 'chamber_clearance' | 'cleaning') {
		pendingServiceTypes = [type];
		showServiceModal = true;
	}

	async function finishService(imageDataUrl?: string) {
		if (!selected || pendingServiceTypes.length === 0) return;
		busy = true;
		errorMsg = null;
		try {
			const updated = await firearmsApi.service(selected.id, { serviceTypes: pendingServiceTypes, imageDataUrl });
			firearms = firearms.map((f) => (f.id === updated.id ? updated : f));
			await refreshOne(selected.id);
			showServiceModal = false;
			pendingServiceTypes = [];
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to record service.';
		} finally {
			busy = false;
		}
	}



	async function submitAssign(e: SubmitEvent) {
		e.preventDefault();
		if (!selected || !assignArmorerId || !assignWork || !assignNextDue) return;
		busy = true;
		errorMsg = null;
		try {
			await firearmsApi.assignMaintenance(selected.id, { armorerId: assignArmorerId, work: assignWork, nextDue: new Date(assignNextDue).toISOString() });
			await refreshOne(selected.id);
			showAssign = false;
			assignArmorerId = '';
			assignWork = '';
			assignNextDue = '';
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to assign maintenance.';
		} finally {
			busy = false;
		}
	}

	async function completeRecord(recordId: string) {
		if (!selected) return;
		busy = true;
		errorMsg = null;
		try {
			await firearmsApi.completeMaintenance(recordId, {});
			await refreshOne(selected.id);
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to complete maintenance.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Firearms — EVI-Armory Guard Vision</title></svelte:head>

<div class="mx-auto max-w-[1400px] space-y-6">
	<div class="flex items-end justify-between">
		<div>
			<p class="eyebrow">Inventory</p>
			<h1 class="font-display text-2xl font-semibold text-ink">Firearm Management</h1>
			<p class="mt-1 text-[13px] text-ink-dim">{firearms.length} firearms tracked · RFID-tagged</p>
		</div>
		{#if canManageFirearms}
			<button onclick={() => (showCreate = !showCreate)} class="flex items-center gap-1.5 rounded-sm border border-line bg-panel-raised px-3 py-2 text-[12px] text-ink transition-colors hover:border-accent/50 hover:text-accent">
				<Plus size={14} /> Register firearm
			</button>
		{/if}
	</div>

	{#if errorMsg}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-2.5 text-[13px] text-alert">{errorMsg}</div>
	{/if}

	{#if showCreate}
		<Panel eyebrow="New" title="Register a firearm">
			<form onsubmit={submitCreate} class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<input required bind:value={form.serial} placeholder="Serial number" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<input required bind:value={form.rfidTag} placeholder="RFID tag" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<input required bind:value={form.model} placeholder="Model" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<input required bind:value={form.caliber} placeholder="Caliber" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<input required bind:value={form.rack} placeholder="Rack (e.g. Rack A)" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<input required bind:value={form.slot} placeholder="Slot (e.g. A-01)" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<div class="flex gap-2 sm:col-span-3">
					<button type="submit" disabled={busy} class="flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim px-3 py-2 text-[12px] font-medium text-accent disabled:opacity-50">
						{#if busy}<Loader2 size={13} class="animate-spin" />{/if} Create
					</button>
					<button type="button" onclick={() => (showCreate = false)} class="rounded-sm border border-line px-3 py-2 text-[12px] text-ink-dim hover:text-ink">Cancel</button>
				</div>
			</form>
		</Panel>
	{/if}

	<div class="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
		<div class="space-y-4">
			<Panel padded={false}>
				<div class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
					<div class="relative flex-1 min-w-[220px]">
						<Search size={14} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
						<input bind:value={query} placeholder="Search serial, RFID tag, model, rack…" class="w-full rounded-sm border border-line bg-panel-raised py-1.5 pr-3 pl-8 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each [['all', 'All'], ['in_armory', 'In armory'], ['checked_out', 'Checked out'], ['maintenance', 'Maintenance'], ['decommissioned', 'Decommissioned']] as [val, label] (val)}
							<button
								class="rounded-sm border px-2.5 py-1 text-[11px] transition-colors
									{statusFilter === val ? 'border-accent/50 bg-accent-dim text-accent' : 'border-line bg-panel-raised text-ink-dim hover:text-ink'}"
								onclick={() => (statusFilter = val as typeof statusFilter)}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>

				{#if loading}
					<div class="flex items-center gap-2 p-6 text-[13px] text-ink-dim"><Loader2 size={14} class="animate-spin" /> Loading…</div>
				{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-left text-[13px]">
						<thead>
							<tr class="eyebrow border-b border-line text-[10px]">
								<th class="px-4 py-2.5 font-normal">Firearm</th>
								<th class="px-4 py-2.5 font-normal">RFID Tag</th>
								<th class="px-4 py-2.5 font-normal">Location</th>
								<th class="px-4 py-2.5 font-normal">Status</th>
								<th class="px-4 py-2.5 font-normal">Holder</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-line-soft">
							{#each filtered as f (f.id)}
								<tr class="cursor-pointer transition-colors hover:bg-panel-raised {selectedId === f.id ? 'bg-panel-raised' : ''}" onclick={() => (selectedId = f.id)}>
									<td class="px-4 py-2.5">
										<p class="text-ink">{f.model}</p>
										<p class="data-value text-[11px] text-ink-dim">{f.serial}</p>
									</td>
									<td class="data-value px-4 py-2.5 text-ink-dim">
										{f.rfidTag}
										{#if f.tagHealth !== 'ok'}<span class="ml-1 text-alert">●</span>{/if}
									</td>
									<td class="px-4 py-2.5 text-ink-dim">{f.rack} / {f.slot}</td>
									<td class="px-4 py-2.5"><StatusPill tone={statusTone(f.status)}>{f.status.replace(/_/g, ' ')}</StatusPill></td>
									<td class="px-4 py-2.5 text-ink-dim">{guardName(f.holder)}</td>
								</tr>
							{:else}
								<tr><td colspan="5" class="px-4 py-8 text-center text-ink-dim">No firearms match this filter.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
				{/if}
			</Panel>
		</div>

		<div>
			{#if selected}
				<Panel eyebrow={selected.id} title={selected.model}>
					{#snippet actions()}
						<button class="text-ink-faint hover:text-ink" onclick={() => (selectedId = null)}><X size={14} /></button>
					{/snippet}
					<dl class="space-y-2 text-[12px]">
						<div class="flex justify-between"><dt class="text-ink-dim">Serial</dt><dd class="data-value text-ink">{selected.serial}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">RFID tag</dt><dd class="data-value text-ink">{selected.rfidTag}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Caliber</dt><dd class="text-ink">{selected.caliber}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Rack / Slot</dt><dd class="text-ink">{selected.rack} / {selected.slot}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Status</dt><dd><StatusPill tone={statusTone(selected.status)}>{selected.status.replace(/_/g, ' ')}</StatusPill></dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Holder</dt><dd class="text-ink">{guardName(selected.holder)}</dd></div>
						<div class="flex justify-between">
							<dt class="text-ink-dim">Tag health</dt>
							<dd><StatusPill tone={selected.tagHealth === 'ok' ? 'clear' : selected.tagHealth === 'weak' ? 'caution' : 'alert'}>{selected.tagHealth}</StatusPill></dd>
						</div>
					</dl>

					{#if canCheckout}
						<div class="mt-4 border-t border-line pt-4">
							{#if selected.status === 'in_armory'}
								<div class="flex gap-2">
									<select bind:value={checkoutGuardId} class="flex-1 rounded-sm border border-line bg-panel-raised px-2 py-1.5 text-[12px] text-ink-dim focus:border-accent/60 focus:outline-none">
										<option value="">Select guard…</option>
										{#each guards.filter((g) => g.status === 'active') as g (g.id)}
											<option value={g.id}>{g.rank} {g.name}</option>
										{/each}
									</select>
									<button onclick={startCheckout} disabled={busy || !checkoutGuardId} class="flex items-center gap-1 rounded-sm border border-accent/40 bg-accent-dim px-3 py-1.5 text-[12px] text-accent disabled:opacity-40">
										<LogOut size={13} /> Check out
									</button>
								</div>
							{:else if selected.status === 'checked_out'}
								<button onclick={startCheckin} disabled={busy} class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-clear/40 bg-clear-dim/40 py-1.5 text-[12px] text-clear disabled:opacity-50">
									<LogIn size={13} /> Check in
								</button>
							{/if}
						</div>
					{/if}

					{#if canManageFirearms}
						<div class="mt-4 border-t border-line pt-4">
							<p class="eyebrow mb-2">Regular service routine</p>
							<div class="flex gap-2">
								<button onclick={() => openServiceModal('chamber_clearance')} disabled={busy} class="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-line bg-panel-raised py-1.5 text-[12px] text-ink-dim hover:text-ink disabled:opacity-50">
									<Crosshair size={13} /> Chamber clearance
								</button>
								<button onclick={() => openServiceModal('cleaning')} disabled={busy} class="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-line bg-panel-raised py-1.5 text-[12px] text-ink-dim hover:text-ink disabled:opacity-50">
									<Sparkles size={13} /> Cleaning
								</button>
							</div>
						</div>
					{/if}

					<div class="mt-5 border-t border-line pt-4">
						<div class="mb-2 flex items-center justify-between">
							<p class="eyebrow flex items-center gap-1.5"><Wrench size={12} /> Maintenance log</p>
							{#if canAssignMaintenance}
								<button onclick={() => (showAssign = !showAssign)} class="text-[11px] text-accent hover:underline">Assign</button>
							{/if}
						</div>

						{#if showAssign}
							<form onsubmit={submitAssign} class="mb-3 space-y-2 rounded-sm border border-line bg-panel-raised p-2.5">
								<select required bind:value={assignArmorerId} class="w-full rounded-sm border border-line bg-panel px-2 py-1.5 text-[12px] text-ink-dim focus:border-accent/60 focus:outline-none">
									<option value="">Assign to…</option>
									{#each armorers as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
								</select>
								<input required bind:value={assignWork} placeholder="Work description" class="w-full rounded-sm border border-line bg-panel px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
								<input required type="date" bind:value={assignNextDue} class="w-full rounded-sm border border-line bg-panel px-2 py-1.5 text-[12px] text-ink focus:border-accent/60 focus:outline-none" />
								<div class="flex gap-2">
									<button type="submit" disabled={busy} class="flex-1 rounded-sm border border-accent/40 bg-accent-dim py-1.5 text-[12px] text-accent disabled:opacity-50">Assign</button>
									<button type="button" onclick={() => (showAssign = false)} class="rounded-sm border border-line px-3 py-1.5 text-[12px] text-ink-dim">Cancel</button>
								</div>
							</form>
						{/if}

						<ul class="space-y-2.5">
							{#each selected.maintenance as m (m.id)}
								<li class="rounded-sm border border-line bg-panel-raised p-2.5 text-[12px]">
									<div class="flex items-center justify-between text-ink-dim">
										<span>{fmtDate(m.date)}</span>
										<StatusPill tone={m.status === 'completed' ? 'clear' : 'caution'}>{m.status.replace('_', ' ')}</StatusPill>
									</div>
									<p class="mt-1 text-ink">{m.work}</p>
									<p class="mt-0.5 text-[11px] text-ink-dim">
										{m.armorer ?? 'unassigned'}{#if m.assignedBy} · assigned by {m.assignedBy}{/if}
									</p>
									{#if m.status !== 'completed' && canCompleteMaintenance}
										<button onclick={() => completeRecord(m.id)} disabled={busy} class="mt-2 flex items-center gap-1 text-[11px] text-clear hover:underline disabled:opacity-50">
											<CheckCircle2 size={12} /> Mark complete
										</button>
									{/if}
								</li>
							{:else}
								<li class="text-[12px] text-ink-dim">No maintenance history yet.</li>
							{/each}
						</ul>
					</div>
				</Panel>
			{:else}
				<Panel><p class="text-[13px] text-ink-dim">Select a firearm to view its record.</p></Panel>
			{/if}
		</div>
	</div>

</div>

{#if pendingAction}
	<PhotoCaptureModal
		title={pendingAction === 'checkout' ? 'Confirm handover' : 'Confirm return'}
		subtitle={pendingAction === 'checkout' ? `Photo of ${guardName(checkoutGuardId)} receiving ${selected?.model}.` : `Photo of ${selected?.model} being returned.`}
		onCapture={finishCheckoutOrCheckin}
		onSkip={() => finishCheckoutOrCheckin(undefined)}
		onClose={() => (pendingAction = null)}
	/>
{/if}

{#if showServiceModal}
	<PhotoCaptureModal
		title={pendingServiceTypes[0] === 'chamber_clearance' ? 'Chamber clearance' : 'Cleaning'}
		subtitle="Photo evidence for {selected?.model}."
		onCapture={finishService}
		onSkip={() => finishService(undefined)}
		onClose={() => (showServiceModal = false)}
	/>
{/if}