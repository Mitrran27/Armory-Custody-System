<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { tabletApi, activityLogsApi, firearmsApi } from '$lib/api/resources';
	import { ApiError, resolveImageUrl } from '$lib/api/client';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import PhotoCaptureModal from '$lib/components/PhotoCaptureModal.svelte';
	import type { ActivityLog, Firearm } from '$lib/types';
	import { LogIn, LogOut, ShieldUser, Crosshair, Sparkles, Loader2, PackageCheck, PackageOpen, ImageOff } from 'lucide-svelte';

	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let myLogs = $state<ActivityLog[]>([]);
	let pendingZoneEntry = $state<any[]>([]);
	let pendingHandover = $state<any[]>([]);
	let checkedOutFirearms = $state<Firearm[]>([]);
	let allFirearms = $state<Firearm[]>([]);
	let recentLogs = $state<ActivityLog[]>([]);

	const lastClockEvent = $derived(myLogs.find((l) => l.eventType === 'clock_in' || l.eventType === 'clock_out') ?? null);
	const onDuty = $derived(lastClockEvent?.eventType === 'clock_in');

	let clockAction = $state<'clock_in' | 'clock_out' | null>(null);
	let handoverTarget = $state<{ guardId: string; firearmId: string; guardName: string; firearmModel: string } | null>(null);
	let receiveTarget = $state<Firearm | null>(null);
	let serviceTarget = $state<{ firearmId: string; type: 'chamber_clearance' | 'cleaning' } | null>(null);
	let serviceFirearmId = $state('');
	let busy = $state(false);

	async function load() {
		loading = true;
		errorMsg = null;
		try {
			const [logs, queue, checkedOut, firearms, recent] = await Promise.all([
				activityLogsApi.list({ systemUserId: auth.user?.id, limit: 20 }),
				tabletApi.queue(),
				tabletApi.checkedOut(),
				firearmsApi.list(),
				activityLogsApi.list({ limit: 15 })
			]);
			myLogs = logs;
			pendingZoneEntry = queue.pendingZoneEntry;
			pendingHandover = queue.pendingHandover;
			checkedOutFirearms = checkedOut;
			allFirearms = firearms;
			recentLogs = recent;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load tablet data.';
		} finally {
			loading = false;
		}
	}
	onMount(load);

	async function submitClock(imageDataUrl?: string) {
		if (!clockAction) return;
		busy = true;
		try {
			const log = clockAction === 'clock_in' ? await tabletApi.clockIn(imageDataUrl) : await tabletApi.clockOut(imageDataUrl);
			myLogs = [log, ...myLogs];
			clockAction = null;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Could not record that.';
		} finally {
			busy = false;
		}
	}

	async function submitHandover(imageDataUrl?: string) {
		if (!handoverTarget) return;
		busy = true;
		try {
			await firearmsApi.checkout(handoverTarget.firearmId, handoverTarget.guardId, imageDataUrl);
			handoverTarget = null;
			await load();
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Handover failed.';
		} finally {
			busy = false;
		}
	}

	async function submitReceive(imageDataUrl?: string) {
		if (!receiveTarget) return;
		busy = true;
		try {
			await firearmsApi.checkin(receiveTarget.id, imageDataUrl);
			receiveTarget = null;
			await load();
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Receiving the return failed.';
		} finally {
			busy = false;
		}
	}

	async function submitService(imageDataUrl?: string) {
		if (!serviceTarget) return;
		busy = true;
		try {
			await firearmsApi.service(serviceTarget.firearmId, { serviceTypes: [serviceTarget.type], imageDataUrl });
			serviceTarget = null;
			serviceFirearmId = '';
			await load();
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to record service.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Armorer Tablet</title></svelte:head>

<div class="space-y-5">
	<div>
		<p class="eyebrow">Zone C — Armory</p>
		<h1 class="font-display text-xl font-semibold text-ink">Armorer Tablet</h1>
	</div>

	{#if errorMsg}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-2.5 text-[13px] text-alert">{errorMsg}</div>
	{/if}

	{#if loading}
		<div class="flex items-center gap-2 text-[13px] text-ink-dim"><Loader2 size={14} class="animate-spin" /> Loading…</div>
	{:else}
		<Panel eyebrow="Duty status" title={onDuty ? 'On duty' : 'Off duty'}>
			{#snippet actions()}
				<StatusPill tone={onDuty ? 'clear' : 'neutral'} pulse={onDuty}>{onDuty ? 'clocked in' : 'clocked out'}</StatusPill>
			{/snippet}
			<button
				onclick={() => (clockAction = onDuty ? 'clock_out' : 'clock_in')}
				class="flex w-full items-center justify-center gap-1.5 rounded-sm border py-2.5 text-[13px] font-medium
					{onDuty ? 'border-alert/40 bg-alert-dim/40 text-alert' : 'border-accent/40 bg-accent-dim text-accent'}"
			>
				{#if onDuty}<LogOut size={14} /> Clock out{:else}<LogIn size={14} /> Clock in{/if}
			</button>
		</Panel>

		<Panel eyebrow="Expected" title="Guards approved for armory entry ({pendingZoneEntry.length})">
			<ul class="space-y-2">
				{#each pendingZoneEntry as r (r.id)}
					<li class="flex items-center justify-between rounded-sm border border-line bg-panel-raised px-3 py-2.5 text-[12px]">
						<div class="flex items-center gap-2">
							<ShieldUser size={14} class="text-accent" />
							<div>
								<p class="text-ink">{r.guard.rank} {r.guard.name}</p>
								<p class="text-[10px] text-ink-dim">{r.guard.id} · clearance {r.guard.clearance.replace('level_', 'L')}</p>
							</div>
						</div>
						<StatusPill tone="clear">approved</StatusPill>
					</li>
				{:else}
					<li class="text-[12px] text-ink-dim">No one expected right now.</li>
				{/each}
			</ul>
		</Panel>

		<Panel eyebrow="Handover queue" title="Firearms approved to issue ({pendingHandover.length})">
			<ul class="space-y-2">
				{#each pendingHandover as r (r.id)}
					<li class="flex items-center justify-between rounded-sm border border-line bg-panel-raised px-3 py-2.5 text-[12px]">
						<div>
							<p class="text-ink">{r.guard.rank} {r.guard.name}</p>
							<p class="text-[10px] text-ink-dim">wants {r.firearm.model} · {r.firearm.serial}</p>
						</div>
						<button
							onclick={() =>
								(handoverTarget = { guardId: r.guard.id, firearmId: r.firearm.id, guardName: r.guard.name, firearmModel: r.firearm.model })}
							class="flex items-center gap-1 rounded-sm border border-accent/40 bg-accent-dim px-2.5 py-1.5 text-[11px] text-accent"
						>
							<PackageOpen size={12} /> Hand over
						</button>
					</li>
				{:else}
					<li class="text-[12px] text-ink-dim">Nothing waiting to be issued.</li>
				{/each}
			</ul>
		</Panel>

		<Panel eyebrow="Currently out" title="Checked-out firearms ({checkedOutFirearms.length})">
			<ul class="space-y-2">
				{#each checkedOutFirearms as f (f.id)}
					<li class="flex items-center justify-between rounded-sm border border-line bg-panel-raised px-3 py-2.5 text-[12px]">
						<div>
							<p class="text-ink">{f.model} · {f.serial}</p>
							<p class="text-[10px] text-ink-dim">held by {f.holder ?? 'unknown'}</p>
						</div>
						<button
							onclick={() => (receiveTarget = f)}
							class="flex items-center gap-1 rounded-sm border border-clear/40 bg-clear-dim/40 px-2.5 py-1.5 text-[11px] text-clear"
						>
							<PackageCheck size={12} /> Receive
						</button>
					</li>
				{:else}
					<li class="text-[12px] text-ink-dim">Nothing checked out right now.</li>
				{/each}
			</ul>
		</Panel>

		<Panel eyebrow="Regular service routine" title="Record chamber clearance / cleaning">
			<div class="flex gap-2">
				<select bind:value={serviceFirearmId} class="flex-1 rounded-sm border border-line bg-panel-raised px-2 py-2 text-[12px] text-ink-dim focus:border-accent/60 focus:outline-none">
					<option value="">Select firearm…</option>
					{#each allFirearms as f (f.id)}<option value={f.id}>{f.model} · {f.serial}</option>{/each}
				</select>
			</div>
			<div class="mt-2 flex gap-2">
				<button
					disabled={!serviceFirearmId}
					onclick={() => (serviceTarget = { firearmId: serviceFirearmId, type: 'chamber_clearance' })}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-line bg-panel-raised py-2 text-[12px] text-ink-dim hover:text-ink disabled:opacity-40"
				>
					<Crosshair size={13} /> Chamber clearance
				</button>
				<button
					disabled={!serviceFirearmId}
					onclick={() => (serviceTarget = { firearmId: serviceFirearmId, type: 'cleaning' })}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-line bg-panel-raised py-2 text-[12px] text-ink-dim hover:text-ink disabled:opacity-40"
				>
					<Sparkles size={13} /> Cleaning
				</button>
			</div>
		</Panel>

		<Panel eyebrow="History" title="Recent activity (everyone)">
			<ul class="space-y-2">
				{#each recentLogs.slice(0, 8) as log (log.id)}
					<li class="flex items-center gap-3 rounded-sm border border-line bg-panel-raised p-2.5">
						{#if log.imageUrl}
							<img src={resolveImageUrl(log.imageUrl)} alt="" class="h-9 w-9 shrink-0 rounded-sm object-cover" />
						{:else}
							<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-panel text-ink-faint"><ImageOff size={13} /></div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate text-[12px] text-ink">{log.detail}</p>
							<p class="text-[10px] text-ink-dim">{new Date(log.timestamp).toLocaleString('en-MY')}</p>
						</div>
					</li>
				{:else}
					<li class="text-[12px] text-ink-dim">No activity yet.</li>
				{/each}
			</ul>
		</Panel>
	{/if}
</div>

{#if clockAction}
	<PhotoCaptureModal
		title={clockAction === 'clock_in' ? 'Clock in' : 'Clock out'}
		subtitle="Take a quick photo to confirm it's you."
		onCapture={submitClock}
		onSkip={() => submitClock(undefined)}
		onClose={() => (clockAction = null)}
	/>
{/if}

{#if handoverTarget}
	<PhotoCaptureModal
		title="Confirm handover"
		subtitle="Photo of {handoverTarget.guardName} receiving {handoverTarget.firearmModel}."
		onCapture={submitHandover}
		onSkip={() => submitHandover(undefined)}
		onClose={() => (handoverTarget = null)}
	/>
{/if}

{#if receiveTarget}
	<PhotoCaptureModal
		title="Confirm return"
		subtitle="Photo of {receiveTarget.model} being returned."
		onCapture={submitReceive}
		onSkip={() => submitReceive(undefined)}
		onClose={() => (receiveTarget = null)}
	/>
{/if}

{#if serviceTarget}
	<PhotoCaptureModal
		title={serviceTarget.type === 'chamber_clearance' ? 'Chamber clearance' : 'Cleaning'}
		subtitle="Photo evidence for this service action."
		onCapture={submitService}
		onSkip={() => submitService(undefined)}
		onClose={() => (serviceTarget = null)}
	/>
{/if}
