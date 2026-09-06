<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { guardsApi, firearmsApi, companiesApi } from '$lib/api/resources';
	import { auth } from '$lib/stores/auth.svelte';
	import { ApiError } from '$lib/api/client';
	import { Search, X, Fingerprint, KeyRound, Plus, Ban, Loader2, QrCode } from 'lucide-svelte';
	import type { Guard, GuardStatus, Firearm, ClearanceLevel, Company } from '$lib/types';

	let guards = $state<Guard[]>([]);
	let firearms = $state<Firearm[]>([]);
	let companies = $state<Company[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	let query = $state('');
	let statusFilter = $state<GuardStatus | 'all'>('all');
	let selectedId = $state<string | null>(null);

	let showCreate = $state(false);
	let creating = $state(false);
	let form = $state({ name: '', rank: '', companyId: '', clearance: 'level_1' as ClearanceLevel, photoInitials: '', shift: '' });

	let qrIssued = $state<{ code: string; expiresAt: string } | null>(null);
	let qrDataUrl = $state<string | null>(null);
	let qrLoading = $state(false);

	const canManage = $derived(auth.hasRole('admin', 'duty_officer'));

	async function loadAll() {
		loading = true;
		errorMsg = null;
		try {
			[guards, firearms, companies] = await Promise.all([guardsApi.list(), firearmsApi.list(), companiesApi.list()]);
			if (!form.companyId && companies[0]) form.companyId = companies[0].id;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load guards.';
		} finally {
			loading = false;
		}
	}
	onMount(loadAll);

	const filtered = $derived(
		guards.filter((g) => {
			const matchesQuery = !query || [g.name, g.id, g.unit].some((v) => v.toLowerCase().includes(query.toLowerCase()));
			const matchesStatus = statusFilter === 'all' || g.status === statusFilter;
			return matchesQuery && matchesStatus;
		})
	);
	const selected = $derived(guards.find((g) => g.id === selectedId) ?? null);
	const selectedFirearm = $derived(firearms.find((f) => f.holder === selectedId) ?? null);

	$effect(() => {
		qrIssued = null;
		qrDataUrl = null;
	});

	function statusTone(s: GuardStatus) {
		if (s === 'active') return 'clear';
		if (s === 'suspended') return 'alert';
		return 'neutral';
	}

	async function submitCreate(e: SubmitEvent) {
		e.preventDefault();
		creating = true;
		errorMsg = null;
		try {
			const created = await guardsApi.create({ ...form, photoInitials: form.photoInitials.toUpperCase() });
			guards = [...guards, created];
			showCreate = false;
			form = { name: '', rank: '', companyId: companies[0]?.id ?? '', clearance: 'level_1', photoInitials: '', shift: '' };
			selectedId = created.id;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to create guard.';
		} finally {
			creating = false;
		}
	}

	async function toggleSuspend(g: Guard) {
		errorMsg = null;
		try {
			const next = g.status === 'suspended' ? 'active' : 'suspended';
			const updated = await guardsApi.update(g.id, { status: next });
			guards = guards.map((x) => (x.id === updated.id ? updated : x));
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to update guard status.';
		}
	}

	async function issueQr(g: Guard) {
		qrLoading = true;
		errorMsg = null;
		try {
			qrIssued = await guardsApi.issueQrToken(g.id, 'DOOR-01');
			qrDataUrl = await QRCode.toDataURL(qrIssued.code, { width: 200, margin: 1, color: { dark: '#0b0f14', light: '#ffffff' } });
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to issue QR token.';
		} finally {
			qrLoading = false;
		}
	}
</script>

<svelte:head><title>Guards — AAWCS</title></svelte:head>

<div class="mx-auto max-w-[1400px] space-y-6">
	<div class="flex items-end justify-between">
		<div>
			<p class="eyebrow">Personnel</p>
			<h1 class="font-display text-2xl font-semibold text-ink">Guards Management</h1>
			<p class="mt-1 text-[13px] text-ink-dim">{guards.length} guards on roster</p>
		</div>
		{#if canManage}
			<button
				onclick={() => (showCreate = !showCreate)}
				class="flex items-center gap-1.5 rounded-sm border border-line bg-panel-raised px-3 py-2 text-[12px] text-ink transition-colors hover:border-accent/50 hover:text-accent"
			>
				<Plus size={14} /> Enroll guard
			</button>
		{/if}
	</div>

	{#if errorMsg}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-2.5 text-[13px] text-alert">{errorMsg}</div>
	{/if}

	{#if showCreate}
		<Panel eyebrow="New" title="Enroll a guard">
			<form onsubmit={submitCreate} class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<input required bind:value={form.name} placeholder="Full name" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<input required bind:value={form.rank} placeholder="Rank (e.g. Cpl)" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<select required bind:value={form.companyId} class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink-dim focus:border-accent/60 focus:outline-none">
					<option value="" disabled>Company…</option>
					{#each companies as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				</select>
				<select bind:value={form.clearance} class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink-dim focus:border-accent/60 focus:outline-none">
					<option value="level_1">Level 1</option>
					<option value="level_2">Level 2</option>
					<option value="level_3">Level 3</option>
				</select>
				<input required maxlength="4" bind:value={form.photoInitials} placeholder="Initials" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<input required bind:value={form.shift} placeholder="Shift (e.g. 0600–1400)" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
				<div class="flex gap-2 sm:col-span-3">
					<button type="submit" disabled={creating} class="flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim px-3 py-2 text-[12px] font-medium text-accent disabled:opacity-50">
						{#if creating}<Loader2 size={13} class="animate-spin" />{/if} Create
					</button>
					<button type="button" onclick={() => (showCreate = false)} class="rounded-sm border border-line px-3 py-2 text-[12px] text-ink-dim hover:text-ink">Cancel</button>
				</div>
			</form>
		</Panel>
	{/if}

	<div class="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
		<div class="space-y-4">
			<Panel padded={false}>
				<div class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
					<div class="relative flex-1 min-w-[220px]">
						<Search size={14} class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
						<input
							bind:value={query}
							placeholder="Search name, ID, company…"
							class="w-full rounded-sm border border-line bg-panel-raised py-1.5 pr-3 pl-8 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
						/>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each [['all', 'All'], ['active', 'Active'], ['off_duty', 'Off duty'], ['suspended', 'Suspended']] as [val, label] (val)}
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
								<th class="px-4 py-2.5 font-normal">Guard</th>
								<th class="px-4 py-2.5 font-normal">Company</th>
								<th class="px-4 py-2.5 font-normal">Clearance</th>
								<th class="px-4 py-2.5 font-normal">Shift</th>
								<th class="px-4 py-2.5 font-normal">Credentials</th>
								<th class="px-4 py-2.5 font-normal">Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-line-soft">
							{#each filtered as g (g.id)}
								<tr
									class="cursor-pointer transition-colors hover:bg-panel-raised {selectedId === g.id ? 'bg-panel-raised' : ''}"
									onclick={() => (selectedId = g.id)}
								>
									<td class="px-4 py-2.5">
										<div class="flex items-center gap-2.5">
											<span class="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-panel font-mono text-[10px] text-ink-dim">{g.photoInitials}</span>
											<div>
												<p class="text-ink">{g.rank} {g.name}</p>
												<p class="data-value text-[11px] text-ink-dim">{g.id}</p>
											</div>
										</div>
									</td>
									<td class="px-4 py-2.5 text-ink-dim">{g.unit}</td>
									<td class="px-4 py-2.5 text-ink-dim uppercase">{g.clearance.replace('level_', 'L')}</td>
									<td class="data-value px-4 py-2.5 text-ink-dim">{g.shift}</td>
									<td class="px-4 py-2.5">
										<div class="flex items-center gap-1.5 text-ink-faint">
											<Fingerprint size={13} class={g.biometricEnrolled ? 'text-clear' : 'text-alert'} />
											<KeyRound size={13} class={g.tokenIssued ? 'text-clear' : 'text-alert'} />
										</div>
									</td>
									<td class="px-4 py-2.5"><StatusPill tone={statusTone(g.status)}>{g.status.replace('_', ' ')}</StatusPill></td>
								</tr>
							{:else}
								<tr><td colspan="6" class="px-4 py-8 text-center text-ink-dim">No guards match this filter.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
				{/if}
			</Panel>
		</div>

		<div>
			{#if selected}
				<Panel eyebrow={selected.id} title="{selected.rank} {selected.name}">
					{#snippet actions()}
						<button class="text-ink-faint hover:text-ink" onclick={() => (selectedId = null)}><X size={14} /></button>
					{/snippet}
					<dl class="space-y-2 text-[12px]">
						<div class="flex justify-between"><dt class="text-ink-dim">Company</dt><dd class="text-ink">{selected.unit}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Clearance</dt><dd class="text-ink uppercase">{selected.clearance.replace('level_', 'Level ')}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Shift</dt><dd class="data-value text-ink">{selected.shift}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Biometric enrolled</dt><dd><StatusPill tone={selected.biometricEnrolled ? 'clear' : 'alert'}>{selected.biometricEnrolled ? 'yes' : 'no'}</StatusPill></dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">QR token issued</dt><dd><StatusPill tone={selected.tokenIssued ? 'clear' : 'alert'}>{selected.tokenIssued ? 'yes' : 'no'}</StatusPill></dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Current zone</dt><dd class="text-ink">{selected.currentZone ? selected.currentZone.replace('zone-', 'Zone ').toUpperCase() : '—'}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Carrying</dt><dd class="text-ink">{selectedFirearm ? `${selectedFirearm.model} (${selectedFirearm.serial})` : '—'}</dd></div>
					</dl>

					{#if canManage}
						<div class="mt-4 space-y-2">
							<button
								onclick={() => issueQr(selected)}
								disabled={qrLoading}
								class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim/40 py-1.5 text-[12px] text-accent transition-colors hover:bg-accent-dim disabled:opacity-50"
							>
								{#if qrLoading}<Loader2 size={13} class="animate-spin" />{:else}<QrCode size={13} />{/if} Issue QR token (Door 1)
							</button>
							{#if qrIssued}
								<div class="rounded-sm border border-line bg-panel-raised p-3 text-center">
									{#if qrDataUrl}
										<div class="mx-auto w-fit rounded-sm bg-white p-2.5">
											<img src={qrDataUrl} alt="Entry QR code for {selected.name}" width="180" height="180" />
										</div>
									{/if}
									<p class="mt-2 text-[11px] text-ink-dim">Expires {new Date(qrIssued.expiresAt).toLocaleTimeString('en-MY')}</p>
									<p class="data-value mt-1 text-[10px] break-all text-ink-faint">{qrIssued.code}</p>
								</div>
							{/if}
							<button
								onclick={() => toggleSuspend(selected)}
								class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-alert/40 bg-alert-dim/40 py-1.5 text-[12px] text-alert transition-colors hover:bg-alert-dim"
							>
								<Ban size={13} /> {selected.status === 'suspended' ? 'Reinstate credentials' : 'Suspend credentials'}
							</button>
						</div>
					{/if}
				</Panel>
			{:else}
				<Panel><p class="text-[13px] text-ink-dim">Select a guard to view their record.</p></Panel>
			{/if}
		</div>
	</div>
</div>
