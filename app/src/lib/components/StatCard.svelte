<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		value,
		sub,
		tone = 'neutral',
		icon
	}: {
		label: string;
		value: string;
		sub?: string;
		tone?: 'neutral' | 'accent' | 'caution' | 'clear' | 'alert';
		icon?: Snippet;
	} = $props();

	const toneText: Record<string, string> = {
		neutral: 'text-ink',
		accent: 'text-accent',
		caution: 'text-caution',
		clear: 'text-clear',
		alert: 'text-alert'
	};
</script>

<div class="bracket-frame relative rounded-sm border border-line bg-panel p-4">
	<div class="flex items-start justify-between">
		<p class="eyebrow">{label}</p>
		{#if icon}
			<div class="text-ink-faint">{@render icon()}</div>
		{/if}
	</div>
	<p class="data-value mt-2 text-2xl font-semibold {toneText[tone]}">{value}</p>
	{#if sub}
		<p class="mt-1 text-xs text-ink-dim">{sub}</p>
	{/if}
</div>
