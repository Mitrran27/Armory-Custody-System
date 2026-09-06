<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Camera, RefreshCw, X } from 'lucide-svelte';

	let {
		onCapture,
		onSkip,
		label = 'Take a photo'
	}: {
		/** Called with a base64 data URL once the person confirms a shot. */
		onCapture: (dataUrl: string) => void;
		/** Called if the person opts to proceed without a photo. Omit to make a photo mandatory. */
		onSkip?: () => void;
		label?: string;
	} = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let stream: MediaStream | null = null;
	let error = $state<string | null>(null);
	let starting = $state(true);
	let capturedDataUrl = $state<string | null>(null);

	async function startCamera() {
		starting = true;
		error = null;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
			if (videoEl) {
				videoEl.srcObject = stream;
				await videoEl.play();
			}
		} catch {
			error = "Couldn't access the camera. Check your browser's camera permission for this site.";
		} finally {
			starting = false;
		}
	}

	function stopCamera() {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
	}

	function takeShot() {
		if (!videoEl) return;
		const canvas = document.createElement('canvas');
		canvas.width = videoEl.videoWidth;
		canvas.height = videoEl.videoHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(videoEl, 0, 0);
		capturedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
		stopCamera();
	}

	function retake() {
		capturedDataUrl = null;
		startCamera();
	}

	function confirm() {
		if (capturedDataUrl) onCapture(capturedDataUrl);
	}

	$effect(() => {
		if (videoEl && !stream && !capturedDataUrl) startCamera();
	});

	onDestroy(stopCamera);
</script>

<div class="space-y-3">
	{#if capturedDataUrl}
		<div class="overflow-hidden rounded-sm border border-line bg-panel-raised">
			<img src={capturedDataUrl} alt="Captured" class="w-full" />
		</div>
		<div class="flex gap-2">
			<button
				onclick={retake}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-line bg-panel-raised py-2 text-[12px] text-ink-dim hover:text-ink"
			>
				<RefreshCw size={13} /> Retake
			</button>
			<button
				onclick={confirm}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2 text-[12px] font-medium text-accent"
			>
				<Camera size={13} /> Use this photo
			</button>
		</div>
	{:else if error}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 p-3 text-[12px] text-alert">{error}</div>
		<div class="flex gap-2">
			<button onclick={startCamera} class="flex-1 rounded-sm border border-line bg-panel-raised py-2 text-[12px] text-ink-dim hover:text-ink">Try again</button>
			{#if onSkip}
				<button onclick={onSkip} class="flex-1 rounded-sm border border-line bg-panel-raised py-2 text-[12px] text-ink-dim hover:text-ink">Continue without photo</button>
			{/if}
		</div>
	{:else}
		<div class="overflow-hidden rounded-sm border border-line bg-black">
			<!-- eslint-disable-next-line svelte/require-each-key -->
			<video bind:this={videoEl} muted playsinline class="w-full {starting ? 'opacity-0' : ''}"></video>
		</div>
		{#if starting}
			<p class="text-center text-[12px] text-ink-dim">Starting camera…</p>
		{:else}
			<p class="text-center text-[11px] text-ink-dim">{label}</p>
			<div class="flex gap-2">
				<button
					onclick={takeShot}
					class="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2.5 text-[12px] font-medium text-accent"
				>
					<Camera size={14} /> Capture
				</button>
				{#if onSkip}
					<button onclick={onSkip} class="flex items-center justify-center gap-1.5 rounded-sm border border-line bg-panel-raised px-3 py-2.5 text-[12px] text-ink-dim hover:text-ink">
						<X size={13} /> Skip
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>
