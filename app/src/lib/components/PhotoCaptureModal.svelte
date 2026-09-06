<script lang="ts">
	import CameraCapture from './CameraCapture.svelte';

	let {
		title,
		subtitle,
		onCapture,
		onSkip,
		onClose
	}: {
		title: string;
		subtitle?: string;
		onCapture: (dataUrl: string) => void;
		onSkip?: () => void;
		onClose: () => void;
	} = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
	<button class="fixed inset-0 cursor-default bg-black/70 backdrop-blur-sm" onclick={onClose} aria-label="Close"></button>
	<div class="relative w-full max-w-sm rounded-sm border border-line bg-panel p-5 shadow-2xl">
		<div class="mb-3">
			<p class="eyebrow">{title}</p>
			{#if subtitle}<p class="mt-0.5 text-[12px] text-ink-dim">{subtitle}</p>{/if}
		</div>
		<CameraCapture
			{onCapture}
			onSkip={onSkip
				? () => {
						onSkip?.();
					}
				: undefined}
		/>
		<button onclick={onClose} class="mt-3 w-full text-center text-[12px] text-ink-dim hover:text-ink">Cancel</button>
	</div>
</div>
