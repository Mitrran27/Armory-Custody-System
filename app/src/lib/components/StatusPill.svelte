<script lang="ts">
	let {
		tone = 'neutral',
		pulse = false,
		children
	}: {
		tone?: 'neutral' | 'accent' | 'caution' | 'clear' | 'alert';
		pulse?: boolean;
		children: import('svelte').Snippet;
	} = $props();

	const toneMap: Record<string, { bg: string; text: string; dot: string }> = {
		neutral: { bg: 'bg-panel-raised', text: 'text-ink-dim', dot: 'bg-ink-faint' },
		accent: { bg: 'bg-accent-dim', text: 'text-accent', dot: 'bg-accent' },
		caution: { bg: 'bg-caution-dim', text: 'text-caution', dot: 'bg-caution' },
		clear: { bg: 'bg-clear-dim', text: 'text-clear', dot: 'bg-clear' },
		alert: { bg: 'bg-alert-dim', text: 'text-alert', dot: 'bg-alert' }
	};
	const t = $derived(toneMap[tone]);
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px] tracking-wide uppercase {t.bg} {t.text}"
>
	<span class="relative inline-flex h-1.5 w-1.5 rounded-full {t.dot}">
		{#if pulse}
			<span class="pulse-dot absolute inset-0 rounded-full {t.text}"></span>
		{/if}
	</span>
	{@render children()}
</span>
