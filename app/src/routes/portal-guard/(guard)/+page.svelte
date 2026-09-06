<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { guardAuth } from '$lib/stores/guardAuth.svelte';
	import { guardSelfApi } from '$lib/api/guardResources';
	import { ApiError, resolveImageUrl } from '$lib/api/client';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import PhotoCaptureModal from '$lib/components/PhotoCaptureModal.svelte';
	import { QrCode, Loader2, RefreshCw, LogIn, LogOut, ImageOff } from 'lucide-svelte';
	import type { ActivityLog } from '$lib/types';

	let myLogs = $state<ActivityLog[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	let showQr = $state(false);
	let qrDataUrl = $state<string | null>(null);
	let qrExpiresAt = $state<number | null>(null);
	let qrLoading = $state(false);
	let secondsLeft = $state(0);

	// Duty status is derived from this guard's own most recent clock event —
	// there's no separate "on duty" flag on the guard record, the log is the
	// source of truth.
	const lastClockEvent = $derived(myLogs.find((l) => l.eventType === 'clock_in' || l.eventType === 'clock_out') ?? null);
	const onDuty = $derived(lastClockEvent?.eventType === 'clock_in');

	let clockAction = $state<'clock_in' | 'clock_out' | null>(null);
	let clockBusy = $state(false);

	async function load() {
		loading = true;
		errorMsg = null;
		try {
			myLogs = await guardSelfApi.myActivityLogs();
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load your activity.';
		} finally {
			loading = false;
		}
	}
	onMount(load);

	async function submitClock(imageDataUrl?: string) {
		if (!clockAction) return;
		clockBusy = true;
		errorMsg = null;
		try {
			const log = clockAction === 'clock_in' ? await guardSelfApi.clockIn(imageDataUrl) : await guardSelfApi.clockOut(imageDataUrl);
			myLogs = [log, ...myLogs];
			clockAction = null;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Could not record that.';
		} finally {
			clockBusy = false;
		}
	}

	let countdownTimer: ReturnType<typeof setInterval> | null = null;
	function stopCountdown() {
		if (countdownTimer) clearInterval(countdownTimer);
		countdownTimer = null;
	}

	async function showQrCode() {
		showQr = true;
		qrLoading = true;
		errorMsg = null;
		try {
			const res = await guardSelfApi.issueMyQrToken();
			qrDataUrl = await QRCode.toDataURL(res.code, { width: 260, margin: 1, color: { dark: '#0b0f14', light: '#ffffff' } });
			qrExpiresAt = new Date(res.expiresAt).getTime();
			stopCountdown();
			countdownTimer = setInterval(() => {
				secondsLeft = Math.max(0, Math.round(((qrExpiresAt ?? 0) - Date.now()) / 1000));
				if (secondsLeft <= 0) stopCountdown();
			}, 250);
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Could not generate a QR code.';
			showQr = false;
		} finally {
			qrLoading = false;
		}
	}

	function closeQr() {
		showQr = false;
		qrDataUrl = null;
		stopCountdown();
	}
</script>

<svelte:head><title>Clock In/Out — Guard Portal</title></svelte:head>

<div class="space-y-5">
	<div>
		<p class="eyebrow">{guardAuth.guard?.rank} {guardAuth.guard?.name}</p>
		<h1 class="font-display text-xl font-semibold text-ink">Clock In / Entry</h1>
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

		<Panel eyebrow="Building access" title="Door 1 — Entry / Exit">
			<p class="mb-4 text-[13px] text-ink-dim">Show this QR code at the outer door to come in or go out.</p>
			<button
				onclick={showQrCode}
				class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2.5 text-[13px] font-medium text-accent"
			>
				<QrCode size={15} /> Show Entry QR Code
			</button>
		</Panel>

		<Panel eyebrow="History" title="My activity log">
			<ul class="space-y-2">
				{#each myLogs.slice(0, 10) as log (log.id)}
					<li class="flex items-center gap-3 rounded-sm border border-line bg-panel-raised p-2.5">
						{#if log.imageUrl}
							<img src={resolveImageUrl(log.imageUrl)} alt="" class="h-10 w-10 shrink-0 rounded-sm object-cover" />
						{:else}
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-panel text-ink-faint"><ImageOff size={14} /></div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate text-[12px] text-ink">{log.detail}</p>
							<p class="text-[10px] text-ink-dim">{new Date(log.timestamp).toLocaleString('en-MY')}</p>
						</div>
					</li>
				{:else}
					<li class="text-[12px] text-ink-dim">No activity recorded yet.</li>
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

<svelte:window onkeydown={(e) => showQr && e.key === 'Escape' && closeQr()} />

{#if showQr}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="fixed inset-0 cursor-default bg-black/70 backdrop-blur-sm" onclick={closeQr} aria-label="Close QR code"></button>
		<div class="relative w-full max-w-xs rounded-sm border border-line bg-panel p-5 text-center shadow-2xl">
			<p class="eyebrow mb-3">Door 1 — QR Gate</p>
			{#if qrLoading}
				<div class="flex h-64 items-center justify-center"><Loader2 size={24} class="animate-spin text-ink-faint" /></div>
			{:else if qrDataUrl}
				<div class="mx-auto w-fit rounded-sm bg-white p-3">
					<img src={qrDataUrl} alt="Entry QR code" width="240" height="240" />
				</div>
				<div class="mt-4">
					{#if secondsLeft > 0}
						<p class="data-value text-2xl font-semibold {secondsLeft <= 15 ? 'text-alert' : 'text-ink'}">{secondsLeft}s</p>
						<p class="text-[11px] text-ink-dim">Valid until it expires — one scan only</p>
					{:else}
						<p class="text-[13px] text-alert">Code expired</p>
						<button onclick={showQrCode} class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2 text-[12px] text-accent">
							<RefreshCw size={13} /> Get a new code
						</button>
					{/if}
				</div>
			{/if}
			<button onclick={closeQr} class="mt-4 w-full text-[12px] text-ink-dim hover:text-ink">Close</button>
		</div>
	</div>
{/if}
