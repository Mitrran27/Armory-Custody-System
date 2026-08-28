<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import { guardAuth } from '$lib/stores/guardAuth.svelte';
	import { guardSelfApi } from '$lib/api/guardResources';
	import { ApiError } from '$lib/api/client';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { QrCode, ShieldCheck, Clock, Loader2, RefreshCw, XCircle } from 'lucide-svelte';
	import type { AccessRequest } from '$lib/types';

	let requests = $state<AccessRequest[]>([]);
	let loading = $state(true);
	let applying = $state(false);
	let errorMsg = $state<string | null>(null);

	let showQr = $state(false);
	let qrDataUrl = $state<string | null>(null);
	let qrExpiresAt = $state<number | null>(null);
	let qrLoading = $state(false);
	let secondsLeft = $state(0);

	const armoryRequest = $derived(requests.find((r) => r.type === 'zone_access') ?? null);
	const firearmRequests = $derived(requests.filter((r) => r.type === 'firearm_assignment'));

	async function load() {
		loading = true;
		errorMsg = null;
		try {
			requests = await guardSelfApi.listMyAccessRequests();
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load your applications.';
		} finally {
			loading = false;
		}
	}
	onMount(load);

	async function applyForArmory() {
		applying = true;
		errorMsg = null;
		try {
			const req = await guardSelfApi.applyForArmory();
			requests = [req, ...requests.filter((r) => r.id !== req.id)];
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Could not submit your application.';
		} finally {
			applying = false;
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

	function statusTone(status: string) {
		if (status === 'approved') return 'clear';
		if (status === 'pending') return 'caution';
		return 'alert';
	}
</script>

<svelte:head><title>Armory Access — Guard Portal</title></svelte:head>

<div class="space-y-5">
	<div>
		<p class="eyebrow">{guardAuth.guard?.rank} {guardAuth.guard?.name}</p>
		<h1 class="font-display text-xl font-semibold text-ink">Armory Access</h1>
	</div>

	{#if errorMsg}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-2.5 text-[13px] text-alert">{errorMsg}</div>
	{/if}

	{#if loading}
		<div class="flex items-center gap-2 text-[13px] text-ink-dim"><Loader2 size={14} class="animate-spin" /> Loading…</div>
	{:else}
		<Panel eyebrow="Application" title="Zone C — Armory">
			{#if !armoryRequest}
				<p class="mb-4 text-[13px] text-ink-dim">You haven't applied for armory access yet.</p>
				<button
					onclick={applyForArmory}
					disabled={applying}
					class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2.5 text-[13px] font-medium text-accent disabled:opacity-50"
				>
					{#if applying}<Loader2 size={14} class="animate-spin" />{:else}<ShieldCheck size={14} />{/if} Apply for Armory Access
				</button>
			{:else}
				<div class="mb-4 flex items-center justify-between">
					<span class="text-[13px] text-ink-dim">Status</span>
					<StatusPill tone={statusTone(armoryRequest.status)} pulse={armoryRequest.status === 'pending'}>
						{armoryRequest.status}
					</StatusPill>
				</div>

				{#if armoryRequest.status === 'pending'}
					<div class="flex items-start gap-2 rounded-sm border border-caution/30 bg-caution-dim/30 p-3">
						<Clock size={15} class="mt-0.5 shrink-0 text-caution" />
						<p class="text-[12px] text-ink-dim">Your application is awaiting admin review. Check back here for updates.</p>
					</div>
				{:else if armoryRequest.status === 'approved'}
					<div class="mb-3 flex items-start gap-2 rounded-sm border border-clear/30 bg-clear-dim/30 p-3">
						<ShieldCheck size={15} class="mt-0.5 shrink-0 text-clear" />
						<p class="text-[12px] text-ink-dim">You're approved for armory access. Show your QR code at Door 1 to enter.</p>
					</div>
					<button
						onclick={showQrCode}
						class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2.5 text-[13px] font-medium text-accent"
					>
						<QrCode size={15} /> Show Entry QR Code
					</button>
				{:else}
					<div class="mb-3 flex items-start gap-2 rounded-sm border border-alert/30 bg-alert-dim/30 p-3">
						<XCircle size={15} class="mt-0.5 shrink-0 text-alert" />
						<p class="text-[12px] text-ink-dim">
							Your application was {armoryRequest.status}{#if armoryRequest.notes}: {armoryRequest.notes}{/if}. You can apply again below.
						</p>
					</div>
					<button
						onclick={applyForArmory}
						disabled={applying}
						class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2.5 text-[13px] font-medium text-accent disabled:opacity-50"
					>
						{#if applying}<Loader2 size={14} class="animate-spin" />{:else}<ShieldCheck size={14} />{/if} Apply Again
					</button>
				{/if}
			{/if}
		</Panel>

		{#if firearmRequests.length}
			<Panel eyebrow="Also on file" title="Firearm assignment requests">
				<ul class="space-y-2">
					{#each firearmRequests as r (r.id)}
						<li class="flex items-center justify-between rounded-sm border border-line bg-panel-raised px-3 py-2 text-[12px]">
							<span class="text-ink">{r.firearmLabel ?? r.firearmId}</span>
							<StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill>
						</li>
					{/each}
				</ul>
			</Panel>
		{/if}
	{/if}
</div>

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
