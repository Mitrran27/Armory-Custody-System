<script lang="ts">
	import { goto } from '$app/navigation';
	import { guardAuth } from '$lib/stores/guardAuth.svelte';
	import { ApiError } from '$lib/api/client';
	import { ShieldHalf, ArrowRight, Loader2 } from 'lucide-svelte';

	let step = $state<'email' | 'otp'>('email');
	let email = $state('');
	let code = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let infoMessage = $state<string | null>(null);

	async function submitEmail(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		loading = true;
		try {
			const res = await guardAuth.requestOtp(email.trim().toLowerCase());
			infoMessage = `Code sent — valid for ${res.expiresInMinutes} minutes. (Dev default: 123456)`;
			step = 'otp';
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Could not request a code. Try again.';
		} finally {
			loading = false;
		}
	}

	async function submitCode(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		loading = true;
		try {
			await guardAuth.verifyOtp(email.trim().toLowerCase(), code.trim());
			goto('/portal');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Could not verify that code. Try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Sign in — AAWCS Guard Portal</title></svelte:head>

<div class="flex min-h-screen w-full items-center justify-center bg-base p-6">
	<div class="bracket-frame w-full max-w-sm rounded-sm border border-line bg-panel p-6">
		<div class="mb-6 flex items-center gap-2.5">
			<div class="flex h-9 w-9 items-center justify-center rounded-sm border border-accent/40 bg-accent-dim text-accent">
				<ShieldHalf size={18} strokeWidth={2} />
			</div>
			<div class="leading-tight">
				<p class="font-display text-sm font-semibold text-ink">AAWCS Guard Portal</p>
				<p class="text-[10px] text-ink-dim">Armory access & entry QR</p>
			</div>
		</div>

		{#if step === 'email'}
			<p class="eyebrow mb-1">Sign in</p>
			<h1 class="mb-4 font-display text-lg font-medium text-ink">Enter your registered email</h1>
			<form onsubmit={submitEmail} class="space-y-3">
				<input
					type="email"
					required
					bind:value={email}
					placeholder="you@guard.mda.gov.my"
					autocomplete="email"
					class="w-full rounded-sm border border-line bg-panel-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
				/>
				{#if error}<p class="text-[13px] text-alert">{error}</p>{/if}
				<button
					type="submit"
					disabled={loading}
					class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent-dim/70 disabled:opacity-50"
				>
					{#if loading}<Loader2 size={14} class="animate-spin" />{:else}Send code<ArrowRight size={14} />{/if}
				</button>
			</form>
		{:else}
			<p class="eyebrow mb-1">Verify</p>
			<h1 class="mb-1 font-display text-lg font-medium text-ink">Enter the code</h1>
			<p class="mb-4 text-[13px] text-ink-dim">Sent to {email}</p>
			<form onsubmit={submitCode} class="space-y-3">
				<input
					type="text"
					inputmode="numeric"
					required
					bind:value={code}
					placeholder="123456"
					maxlength="12"
					autocomplete="one-time-code"
					class="data-value w-full rounded-sm border border-line bg-panel-raised px-3 py-2.5 text-center text-lg tracking-[0.3em] text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
				/>
				{#if infoMessage}<p class="text-[12px] text-ink-dim">{infoMessage}</p>{/if}
				{#if error}<p class="text-[13px] text-alert">{error}</p>{/if}
				<button
					type="submit"
					disabled={loading}
					class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent/40 bg-accent-dim py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent-dim/70 disabled:opacity-50"
				>
					{#if loading}<Loader2 size={14} class="animate-spin" />{:else}Verify &amp; sign in<ArrowRight size={14} />{/if}
				</button>
				<button
					type="button"
					onclick={() => {
						step = 'email';
						code = '';
						error = null;
					}}
					class="w-full text-center text-[12px] text-ink-dim hover:text-ink"
				>
					Use a different email
				</button>
			</form>
		{/if}
	</div>
</div>
