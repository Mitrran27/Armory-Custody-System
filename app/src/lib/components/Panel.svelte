<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		children,
		actions,
		padded = true,
		class: className = ''
	}: {
		eyebrow?: string;
		title?: string;
		children: Snippet;
		actions?: Snippet;
		padded?: boolean;
		class?: string;
	} = $props();
</script>

<section class="bracket-frame relative flex flex-col rounded-sm border border-line bg-panel {className}">
	{#if eyebrow || title || actions}
		<header class="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
			<div>
				{#if eyebrow}
					<p class="eyebrow">{eyebrow}</p>
				{/if}
				{#if title}
					<h2 class="font-display text-[15px] font-medium text-ink">{title}</h2>
				{/if}
			</div>
			{#if actions}
				<div class="flex items-center gap-2">{@render actions()}</div>
			{/if}
		</header>
	{/if}
	<div class={padded ? 'p-5' : 'min-h-0 flex-1'}>
		{@render children()}
	</div>
</section>
