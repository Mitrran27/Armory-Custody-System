<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { ShieldHalf, LogOut, Sun, Moon, Loader2 } from 'lucide-svelte';

	let { children } = $props();
	let checked = $state(false);

	onMount(async () => {
		if (auth.token) {
			await auth.refreshMe();
		}
		checked = true;
		if (!auth.isAuthenticated || !auth.hasRole('armorer', 'admin')) {
			goto('/tablet/login');
		}
	});

	$effect(() => {
		if (checked && (!auth.isAuthenticated || !auth.hasRole('armorer', 'admin'))) {
			goto('/tablet/login');
		}
	});

	function signOut() {
		auth.signOut();
		goto('/tablet/login');
	}
</script>

{#if !checked}
	<div class="flex h-screen w-full items-center justify-center bg-base">
		<Loader2 size={22} class="animate-spin text-ink-faint" />
	</div>
{:else if auth.isAuthenticated}
	<div class="flex min-h-screen w-full flex-col bg-base font-body">
		<header class="flex h-14 shrink-0 items-center justify-between border-b border-line bg-panel/60 px-4 backdrop-blur">
			<div class="flex items-center gap-2">
				<div class="flex h-7 w-7 items-center justify-center rounded-sm border border-accent/40 bg-accent-dim text-accent">
					<ShieldHalf size={14} strokeWidth={2} />
				</div>
				<div class="leading-tight">
					<p class="font-display text-[13px] font-semibold text-ink">Armorer Tablet</p>
					<p class="text-[10px] text-ink-dim">{auth.user?.name}</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button
					onclick={() => theme.toggle()}
					class="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-panel-raised text-ink-dim transition-colors hover:border-accent/50 hover:text-accent"
					title={theme.current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
				>
					{#if theme.current === 'dark'}<Sun size={14} />{:else}<Moon size={14} />{/if}
				</button>
				<button onclick={signOut} class="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-panel-raised text-ink-faint transition-colors hover:border-alert/40 hover:text-alert" title="Sign out">
					<LogOut size={14} />
				</button>
			</div>
		</header>
		<main class="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
			{@render children()}
		</main>
	</div>
{/if}
