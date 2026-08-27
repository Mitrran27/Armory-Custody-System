<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { usersApi } from '$lib/api/resources';
	import { auth } from '$lib/stores/auth.svelte';
	import { ApiError } from '$lib/api/client';
	import { Plus, ShieldCheck, ShieldAlert, Loader2, Ban } from 'lucide-svelte';
	import type { SystemUser, SystemRole } from '$lib/types';

	let users = $state<SystemUser[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let showCreate = $state(false);
	let busy = $state(false);
	let form = $state({ name: '', email: '', role: 'duty_officer' as SystemRole });

	const roleLabel: Record<SystemRole, string> = {
		admin: 'Administrator',
		duty_officer: 'Duty Officer',
		armorer: 'Armorer',
		auditor: 'Auditor'
	};
	const roleDescription: Record<SystemRole, string> = {
		admin: 'Full system access — configuration, RBAC, all modules.',
		duty_officer: 'Monitors live view, acknowledges alerts, approves overrides.',
		armorer: 'Manages firearm inventory and maintenance records.',
		auditor: 'Read-only access to audit trail and reporting exports.'
	};

	async function load() {
		loading = true;
		errorMsg = null;
		try {
			users = await usersApi.list();
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load system users.';
		} finally {
			loading = false;
		}
	}
	onMount(load);

	async function submitCreate(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		errorMsg = null;
		try {
			const created = await usersApi.create(form);
			users = [...users, created];
			showCreate = false;
			form = { name: '', email: '', role: 'duty_officer' };
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to create user.';
		} finally {
			busy = false;
		}
	}

	async function toggleStatus(u: SystemUser) {
		errorMsg = null;
		try {
			const updated = await usersApi.update(u.id, { status: u.status === 'active' ? 'disabled' : 'active' });
			users = users.map((x) => (x.id === updated.id ? updated : x));
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to update user.';
		}
	}
</script>

<svelte:head><title>System Users — AAWCS</title></svelte:head>

<div class="mx-auto max-w-[1400px] space-y-6">
	<div class="flex items-end justify-between">
		<div>
			<p class="eyebrow">Back office</p>
			<h1 class="font-display text-2xl font-semibold text-ink">System User Management</h1>
			<p class="mt-1 text-[13px] text-ink-dim">
				Accounts for staff who operate the system — separate from the guard roster, which controls physical access.
			</p>
		</div>
		<button onclick={() => (showCreate = !showCreate)} class="flex items-center gap-1.5 rounded-sm border border-line bg-panel-raised px-3 py-2 text-[12px] text-ink transition-colors hover:border-accent/50 hover:text-accent">
			<Plus size={14} /> Add user
		</button>
	</div>

	{#if !auth.hasRole('admin')}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-3 text-[13px] text-alert">
			System user management is restricted to administrators.
		</div>
	{:else}
		{#if errorMsg}
			<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-2.5 text-[13px] text-alert">{errorMsg}</div>
		{/if}

		{#if showCreate}
			<Panel eyebrow="New" title="Add a system user">
				<form onsubmit={submitCreate} class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<input required bind:value={form.name} placeholder="Full name" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
					<input required type="email" bind:value={form.email} placeholder="Work email" class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none" />
					<select bind:value={form.role} class="rounded-sm border border-line bg-panel-raised px-3 py-2 text-[13px] text-ink-dim focus:border-accent/60 focus:outline-none">
						{#each Object.entries(roleLabel) as [val, label] (val)}<option value={val}>{label}</option>{/each}
					</select>
					<div class="flex gap-2 sm:col-span-3">
						<button type="submit" disabled={busy} class="flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim px-3 py-2 text-[12px] font-medium text-accent disabled:opacity-50">
							{#if busy}<Loader2 size={13} class="animate-spin" />{/if} Create
						</button>
						<button type="button" onclick={() => (showCreate = false)} class="rounded-sm border border-line px-3 py-2 text-[12px] text-ink-dim hover:text-ink">Cancel</button>
					</div>
				</form>
			</Panel>
		{/if}

		<div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
			{#each Object.entries(roleLabel) as [role, label] (role)}
				<div class="rounded-sm border border-line bg-panel p-4">
					<p class="eyebrow">{label}</p>
					<p class="mt-1 text-[12px] text-ink-dim">{roleDescription[role as SystemRole]}</p>
				</div>
			{/each}
		</div>

		<Panel padded={false}>
			{#if loading}
				<div class="flex items-center gap-2 p-6 text-[13px] text-ink-dim"><Loader2 size={14} class="animate-spin" /> Loading…</div>
			{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-[13px]">
					<thead>
						<tr class="eyebrow border-b border-line text-[10px]">
							<th class="px-4 py-2.5 font-normal">User</th>
							<th class="px-4 py-2.5 font-normal">Role</th>
							<th class="px-4 py-2.5 font-normal">MFA</th>
							<th class="px-4 py-2.5 font-normal">Last login</th>
							<th class="px-4 py-2.5 font-normal">Status</th>
							<th class="px-4 py-2.5 font-normal"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line-soft">
						{#each users as u (u.id)}
							<tr class="transition-colors hover:bg-panel-raised">
								<td class="px-4 py-2.5">
									<p class="text-ink">{u.name}</p>
									<p class="text-[11px] text-ink-dim">{u.email}</p>
								</td>
								<td class="px-4 py-2.5"><StatusPill tone="accent">{roleLabel[u.role]}</StatusPill></td>
								<td class="px-4 py-2.5">
									{#if u.mfaEnabled}
										<span class="flex items-center gap-1.5 text-clear"><ShieldCheck size={14} /> enabled</span>
									{:else}
										<span class="flex items-center gap-1.5 text-alert"><ShieldAlert size={14} /> disabled</span>
									{/if}
								</td>
								<td class="data-value px-4 py-2.5 text-ink-dim">{u.lastLogin ? new Date(u.lastLogin).toLocaleString('en-MY') : '—'}</td>
								<td class="px-4 py-2.5"><StatusPill tone={u.status === 'active' ? 'clear' : 'neutral'}>{u.status}</StatusPill></td>
								<td class="px-4 py-2.5 text-right">
									<button onclick={() => toggleStatus(u)} class="flex items-center gap-1 text-[12px] text-ink-dim hover:text-alert">
										<Ban size={12} /> {u.status === 'active' ? 'Disable' : 'Enable'}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{/if}
		</Panel>
	{/if}
</div>
