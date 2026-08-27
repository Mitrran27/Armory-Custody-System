<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '$lib/components/Panel.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import RoomScene3D from '$lib/components/RoomScene3D.svelte';
	import { live } from '$lib/stores/live.svelte';
	import { facilityApi, camerasApi, guardsApi } from '$lib/api/resources';
	import { ApiError } from '$lib/api/client';
	import { Video, VideoOff, RotateCw, Loader2 } from 'lucide-svelte';
	import type { RoomConfig, DoorConfig, QrScannerConfig, CameraConfig, Guard } from '$lib/types';

	let rooms = $state<RoomConfig[]>([]);
	let doors = $state<DoorConfig[]>([]);
	let qrScanners = $state<QrScannerConfig[]>([]);
	let cameras = $state<CameraConfig[]>([]);
	let guards = $state<Guard[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	let selectedCameraId = $state<string | null>(null);
	const selectedCamera = $derived(cameras.find((c) => c.id === selectedCameraId) ?? null);

	onMount(async () => {
		try {
			const [layout, cams, g] = await Promise.all([facilityApi.layout(), camerasApi.list(), guardsApi.list()]);
			rooms = layout.rooms;
			doors = layout.doors;
			qrScanners = layout.qrScanners;
			cameras = cams;
			guards = g;
			selectedCameraId = cams[0]?.id ?? null;
		} catch (err) {
			errorMsg = err instanceof ApiError ? err.message : 'Failed to load the facility layout.';
		} finally {
			loading = false;
		}
	});

	function guardName(id: string) {
		return guards.find((g) => g.id === id)?.name ?? id;
	}
</script>

<svelte:head><title>Live Monitoring — AAWCS</title></svelte:head>

<div class="mx-auto flex h-full max-w-[1400px] flex-col gap-6">
	<div class="flex items-end justify-between">
		<div>
			<p class="eyebrow">Live Monitoring</p>
			<h1 class="font-display text-2xl font-semibold text-ink">Room Layout — 3D View</h1>
			<p class="mt-1 max-w-xl text-[13px] text-ink-dim">
				Drag to rotate, scroll to zoom. Camera positions are read from a modular layout config — adding a physical
				camera means adding a row to the config, not editing this scene.
			</p>
		</div>
		<div class="flex items-center gap-2 text-[11px] text-ink-dim">
			<RotateCw size={13} /> Click a camera node for details
		</div>
	</div>

	{#if errorMsg}
		<div class="rounded-sm border border-alert/40 bg-alert-dim/30 px-4 py-2.5 text-[13px] text-alert">{errorMsg}</div>
	{/if}

	<div class="grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
		<Panel padded={false} class="h-[560px] overflow-hidden">
			<div class="relative h-full">
				<div class="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
					{#each Object.entries(live.zones) as [zoneId, state] (zoneId)}
						<StatusPill
							tone={state.status === 'alert' ? 'alert' : state.status === 'occupied' ? 'caution' : 'clear'}
							pulse={state.status !== 'clear'}
						>
							{zoneId.replace('zone-', 'Zone ')} · {state.status}
						</StatusPill>
					{/each}
				</div>
				<div class="absolute right-3 bottom-3 z-10 rounded-sm border border-line bg-panel/90 px-3 py-2 text-[11px] text-ink-dim backdrop-blur">
					<span class="mr-3 inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-clear"></span>Clear</span>
					<span class="mr-3 inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-caution"></span>Occupied</span>
					<span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-alert"></span>Alert</span>
				</div>
				{#if loading}
					<div class="flex h-full items-center justify-center gap-2 text-[13px] text-ink-dim"><Loader2 size={16} class="animate-spin" /> Loading layout…</div>
				{:else if rooms.length}
					<RoomScene3D {rooms} {doors} qrScanner={qrScanners[0]} cameraLayout={cameras} zoneStatus={live.zones} bind:selectedCameraId />
				{:else}
					<div class="flex h-full items-center justify-center text-[13px] text-ink-dim">No facility layout on record yet.</div>
				{/if}
			</div>
		</Panel>

		<div class="flex flex-col gap-6">
			<Panel eyebrow="Cameras" title="Layout ({cameras.length})">
				<ul class="space-y-1.5">
					{#each cameras as cam (cam.id)}
						<li>
							<button
								class="flex w-full items-center justify-between rounded-sm border px-3 py-2 text-left text-[12px] transition-colors
									{selectedCameraId === cam.id ? 'border-accent/50 bg-accent-dim/40' : 'border-line bg-panel-raised hover:border-line'}"
								onclick={() => (selectedCameraId = cam.id)}
							>
								<span class="flex items-center gap-2">
									{#if cam.status === 'online'}
										<Video size={14} class="text-accent" />
									{:else}
										<VideoOff size={14} class="text-ink-faint" />
									{/if}
									<span class="text-ink">{cam.id}</span>
								</span>
								<StatusPill tone={cam.status === 'online' ? 'accent' : 'neutral'}>{cam.status}</StatusPill>
							</button>
						</li>
					{:else}
						<li class="text-[12px] text-ink-dim">No cameras registered.</li>
					{/each}
				</ul>
			</Panel>

			{#if selectedCamera}
				<Panel eyebrow="Selected" title={selectedCamera.id}>
					<dl class="space-y-2 text-[12px]">
						<div class="flex justify-between"><dt class="text-ink-dim">Label</dt><dd class="text-ink">{selectedCamera.label}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Zone</dt><dd class="text-ink">{selectedCamera.zone.replace('zone-', 'Zone ').toUpperCase()}</dd></div>
						<div class="flex justify-between"><dt class="text-ink-dim">Field of view</dt><dd class="data-value text-ink">{selectedCamera.fovDeg}°</dd></div>
						<div class="flex justify-between">
							<dt class="text-ink-dim">Position (x,y,z)</dt>
							<dd class="data-value text-ink">{selectedCamera.position.map((n) => n.toFixed(1)).join(', ')}</dd>
						</div>
						<div class="flex justify-between"><dt class="text-ink-dim">Status</dt><dd><StatusPill tone={selectedCamera.status === 'online' ? 'clear' : 'alert'}>{selectedCamera.status}</StatusPill></dd></div>
					</dl>
				</Panel>
			{/if}

			<Panel eyebrow="Occupants" title="Currently inside">
				<ul class="space-y-2">
					{#each Object.entries(live.zones) as [zoneId, state] (zoneId)}
						{#each state.occupants as guardId (guardId + zoneId)}
							<li class="flex items-center justify-between rounded-sm border border-line bg-panel-raised px-3 py-2 text-[12px]">
								<span class="text-ink">{guardName(guardId)}</span>
								<span class="font-mono text-[11px] text-ink-dim">{zoneId.replace('zone-', 'ZONE ').toUpperCase()}</span>
							</li>
						{/each}
					{:else}
						<li class="text-[12px] text-ink-dim">No occupants.</li>
					{/each}
				</ul>
			</Panel>
		</div>
	</div>
</div>
