<script lang="ts">
	import { goto } from '$app/navigation';
	import { notifications } from '$lib/stores/notifications.svelte';
	import { Bell, CheckCheck } from 'lucide-svelte';

	let open = $state(false);
	let containerEl: HTMLDivElement;

	function toggle() {
		open = !open;
	}

	function handleClickOutside(e: MouseEvent) {
		if (open && containerEl && !containerEl.contains(e.target as Node)) {
			open = false;
		}
	}

	async function openNotification(id: string, relatedAccessRequestId: string | null) {
		await notifications.markRead(id);
		open = false;
		if (relatedAccessRequestId) goto('/access-requests');
	}

	function timeAgo(iso: string) {
		const diff = Math.max(0, Date.now() - new Date(iso).getTime());
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative" bind:this={containerEl}>
	<button
		onclick={toggle}
		class="relative flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-panel-raised text-ink-dim transition-colors hover:border-accent/50 hover:text-accent"
		title="Notifications"
	>
		<Bell size={15} />
		{#if notifications.unreadCount > 0}
			<span class="pulse-dot absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alert px-1 font-mono text-[9px] font-bold text-white">
				{notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}
			</span>
		{/if}
	</button>

	{#if open}
		<div class="absolute right-0 z-30 mt-2 w-80 rounded-sm border border-line bg-panel shadow-2xl">
			<div class="flex items-center justify-between border-b border-line px-3 py-2.5">
				<p class="eyebrow">Notifications</p>
				{#if notifications.unreadCount > 0}
					<button onclick={() => notifications.markAllRead()} class="flex items-center gap-1 text-[11px] text-accent hover:underline">
						<CheckCheck size={12} /> Mark all read
					</button>
				{/if}
			</div>
			<div class="max-h-80 overflow-y-auto">
				{#each notifications.items as n (n.id)}
					<button
						onclick={() => openNotification(n.id, n.relatedAccessRequestId)}
						class="flex w-full flex-col gap-0.5 border-b border-line-soft px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-panel-raised {n.read ? 'opacity-60' : ''}"
					>
						<div class="flex items-center gap-1.5">
							{#if !n.read}<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>{/if}
							<p class="text-[12px] text-ink">{n.title}</p>
						</div>
						<p class="pl-3 text-[11px] text-ink-dim">{n.body}</p>
						<p class="pl-3 text-[10px] text-ink-faint">{timeAgo(n.createdAt)}</p>
					</button>
				{:else}
					<p class="px-3 py-6 text-center text-[12px] text-ink-dim">No notifications yet.</p>
				{/each}
			</div>
		</div>
	{/if}
</div>
