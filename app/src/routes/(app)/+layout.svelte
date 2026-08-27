<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import { live } from '$lib/stores/live.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { Loader2 } from 'lucide-svelte';

	let { children } = $props();
	let checked = $state(false);

	onMount(async () => {
		// A token in localStorage might be stale (expired/revoked) — confirm
		// it's still good before treating the person as signed in.
		if (auth.token) {
			await auth.refreshMe();
		}
		checked = true;
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		live.start();
	});
	onDestroy(() => live.stop());

	$effect(() => {
		if (checked && !auth.isAuthenticated) {
			goto('/login');
		}
	});
</script>

{#if !checked}
	<div class="flex h-screen w-full items-center justify-center bg-base">
		<Loader2 size={22} class="animate-spin text-ink-faint" />
	</div>
{:else if auth.isAuthenticated}
	<div class="flex h-screen w-full overflow-hidden font-body">
		<Sidebar />
		<div class="flex min-w-0 flex-1 flex-col">
			<TopBar />
			<main class="min-h-0 flex-1 overflow-y-auto p-6">
				{@render children()}
			</main>
		</div>
	</div>
{/if}
