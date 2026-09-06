<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import type { CameraConfig, DoorConfig, QrScannerConfig, RackWall, RoomConfig, ZoneId, ZoneStatus } from '$lib/types';

	let {
		rooms,
		doors,
		qrScanner,
		cameraLayout,
		zoneStatus,
		selectedCameraId = $bindable(null),
		focusedZoneId = $bindable(null),
		focusScreenPos = $bindable(null)
	}: {
		rooms: RoomConfig[];
		doors: DoorConfig[];
		qrScanner?: QrScannerConfig;
		cameraLayout: CameraConfig[];
		zoneStatus: Record<ZoneId, { status: ZoneStatus }>;
		selectedCameraId?: string | null;
		/** The zone the camera has flown in to focus on, or null when showing the full overview. */
		focusedZoneId?: ZoneId | null;
		/** Live screen-space anchor (px, relative to this component) for the focused room's "view layout" button, or null while not focused / off-screen. */
		focusScreenPos?: { x: number; y: number } | null;
	} = $props();

	let container: HTMLDivElement;
	let povCanvas: HTMLCanvasElement;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let povRenderer: THREE.WebGLRenderer | null = null;
	let povCamera: THREE.PerspectiveCamera | null = null;
	let controls: OrbitControls;
	let frameId: number;
	let resizeObserver: ResizeObserver;

	const floorMats = new Map<ZoneId, THREE.MeshStandardMaterial>();
	const camNodes = new Map<string, { cone: THREE.Mesh; ring: THREE.Mesh }>();
	const roomCenters = new Map<ZoneId, THREE.Vector3>();
	const roomsById = new Map<ZoneId, RoomConfig>();
	const allLabels: THREE.Sprite[] = [];

	const STATUS_COLOR: Record<ZoneStatus, number> = {
		clear: 0x2ee88f,
		occupied: 0xffb020,
		alert: 0xff4d5e
	};

	const WALL_COLOR = 0x4db2ff;
	const WALL_THICKNESS = 0.15;

	/**
	 * Room hit-testing uses 2D screen-space polygons instead of 3D raycasting
	 * against invisible geometry. That's deliberate: an invisible box tall
	 * enough to also cover a room's floating name label can, from an angled
	 * camera, visually cover screen space that actually belongs to a
	 * different (farther-back) room — which is exactly what was stealing
	 * clicks clearly aimed at a room behind another one. Projecting each
	 * room's actual corners to the screen and testing point-in-polygon
	 * matches what a person is visually judging when they click, and has no
	 * such occlusion failure mode.
	 */
	function projectToScreen(v: THREE.Vector3, rect: DOMRect): { x: number; y: number; behind: boolean } {
		const p = v.clone().project(camera);
		return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height, behind: p.z > 1 };
	}

	function roomScreenHull(cfg: RoomConfig, rect: DOMRect): [number, number][] {
		const [w, d] = cfg.size;
		const [ox, oz] = cfg.origin;
		// Floor corners plus corners just above the floating label, so the
		// label itself is a valid click target too.
		const ys = [0, cfg.height + 2.2];
		const pts: [number, number][] = [];
		for (const y of ys) {
			for (const x of [ox, ox + w]) {
				for (const z of [oz, oz + d]) {
					const p = projectToScreen(new THREE.Vector3(x, y, z), rect);
					if (!p.behind) pts.push([p.x, p.y]);
				}
			}
		}
		return convexHull2D(pts);
	}

	function convexHull2D(points: [number, number][]): [number, number][] {
		const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		if (pts.length < 3) return pts;
		const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
			(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
		const lower: [number, number][] = [];
		for (const p of pts) {
			while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
			lower.push(p);
		}
		const upper: [number, number][] = [];
		for (let i = pts.length - 1; i >= 0; i--) {
			const p = pts[i];
			while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
			upper.push(p);
		}
		lower.pop();
		upper.pop();
		return lower.concat(upper);
	}

	function pointInPolygon(pt: [number, number], poly: [number, number][]): boolean {
		let inside = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const [xi, yi] = poly[i];
			const [xj, yj] = poly[j];
			const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
			if (intersect) inside = !inside;
		}
		return inside;
	}

	/** Returns the wall's endpoints [start, end] as [x, z] pairs, going clockwise. */
	function wallLine(room: RoomConfig, wall: RackWall): [[number, number], [number, number]] {
		const [w, d] = room.size;
		const [ox, oz] = room.origin;
		switch (wall) {
			case 'north':
				return [[ox, oz], [ox + w, oz]];
			case 'south':
				return [[ox, oz + d], [ox + w, oz + d]];
			case 'west':
				return [[ox, oz], [ox, oz + d]];
			case 'east':
				return [[ox + w, oz], [ox + w, oz + d]];
		}
	}

	/** Builds a wall along a line, cutting a gap for any door assigned to it. */
	function buildWall(room: RoomConfig, wall: RackWall, height: number) {
		const [[x1, z1], [x2, z2]] = wallLine(room, wall);
		const length = Math.hypot(x2 - x1, z2 - z1);
		const angle = Math.atan2(z2 - z1, x2 - x1);

		const doorsOnWall = doors.filter((d) => d.room === room.id && d.wall === wall).sort((a, b) => a.t - b.t);

		const edgeMat = new THREE.LineBasicMaterial({ color: WALL_COLOR, transparent: true, opacity: 0.55 });
		const wallMat = new THREE.MeshBasicMaterial({ color: WALL_COLOR, transparent: true, opacity: 0.07, side: THREE.DoubleSide });

		function addSegment(fromT: number, toT: number) {
			const segLen = (toT - fromT) * length;
			if (segLen <= 0.02) return;
			const geo = new THREE.BoxGeometry(segLen, height, WALL_THICKNESS);
			const mesh = new THREE.Mesh(geo, wallMat);
			const midT = (fromT + toT) / 2;
			const mx = x1 + (x2 - x1) * midT;
			const mz = z1 + (z2 - z1) * midT;
			mesh.position.set(mx, height / 2, mz);
			mesh.rotation.y = -angle;
			scene.add(mesh);
			const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
			edges.position.copy(mesh.position);
			edges.rotation.copy(mesh.rotation);
			scene.add(edges);
		}

		let cursor = 0;
		for (const d of doorsOnWall) {
			const halfWidthT = d.width / 2 / length;
			addSegment(cursor, Math.max(cursor, d.t - halfWidthT));
			buildDoorMarker(d, x1 + (x2 - x1) * d.t, z1 + (z2 - z1) * d.t, angle);
			cursor = Math.min(1, d.t + halfWidthT);
		}
		addSegment(cursor, 1);
	}

	function buildDoorMarker(door: DoorConfig, x: number, z: number, wallAngle: number) {
		const gateColor = door.gate === 'qr' ? 0x3fa9f5 : door.gate === 'facial' ? 0xe8a33d : 0x8b98a9;
		const stripGeo = new THREE.BoxGeometry(door.width * 0.92, 0.03, WALL_THICKNESS + 0.05);
		const stripMat = new THREE.MeshStandardMaterial({ color: gateColor, emissive: gateColor, emissiveIntensity: 0.5 });
		const strip = new THREE.Mesh(stripGeo, stripMat);
		strip.position.set(x, 0.02, z);
		strip.rotation.y = -wallAngle;
		scene.add(strip);

		const inward = inwardNormal(door.wall);
		const label = makeLabelSprite(door.label, gateColor);
		label.position.set(x + inward[0] * 0.9, 2.7, z + inward[1] * 0.9);
		scene.add(label);
	}

	function buildRacks(room: RoomConfig) {
		if (!room.racks) return;
		const rackMat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.5, metalness: 0.3 });
		for (const rackDef of room.racks) {
			const [[x1, z1], [x2, z2]] = wallLine(room, rackDef.wall);
			const inward = inwardNormal(rackDef.wall);
			for (let i = 0; i < rackDef.count; i++) {
				const t = (i + 0.5) / rackDef.count;
				const x = x1 + (x2 - x1) * t + inward[0] * 0.35;
				const z = z1 + (z2 - z1) * t + inward[1] * 0.35;
				const geo = new THREE.BoxGeometry(0.12, 1.5, 0.35);
				const mesh = new THREE.Mesh(geo, rackMat);
				mesh.position.set(x, 0.85, z);
				mesh.rotation.y = rackDef.wall === 'north' || rackDef.wall === 'south' ? 0 : Math.PI / 2;
				scene.add(mesh);
			}
		}
		const [ox, oz] = room.origin;
		const [w] = room.size;
		const label = makeLabelSprite('FIREARMS RACKS', 0xe8a33d);
		label.position.set(ox + w / 2, 2.35, oz + 0.15);
		scene.add(label);
	}

	function inwardNormal(wall: RackWall): [number, number] {
		switch (wall) {
			case 'north':
				return [0, 1];
			case 'south':
				return [0, -1];
			case 'west':
				return [1, 0];
			case 'east':
				return [-1, 0];
		}
	}

	function buildQrScanner(cfg: QrScannerConfig) {
		const group = new THREE.Group();
		const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3fa9f5, emissive: 0x3fa9f5, emissiveIntensity: 0.5 });
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.06), bodyMat);
		body.position.set(...cfg.position);
		group.add(body);
		const label = makeLabelSprite(cfg.label, 0x3fa9f5);
		label.position.set(cfg.position[0] - 0.4, cfg.position[1] + 0.35, cfg.position[2]);
		group.add(label);
		scene.add(group);
	}

	function buildRoom(cfg: RoomConfig) {
		const [w, d] = cfg.size;
		const [ox, oz] = cfg.origin;
		roomsById.set(cfg.id, cfg);

		const floorMat = new THREE.MeshStandardMaterial({
			color: STATUS_COLOR[zoneStatus[cfg.id]?.status ?? 'clear'],
			transparent: true,
			opacity: 0.16,
			roughness: 1
		});
		floorMats.set(cfg.id, floorMat);
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(ox + w / 2, 0, oz + d / 2);
		floor.userData = { zoneId: cfg.id };
		scene.add(floor);
		roomCenters.set(cfg.id, new THREE.Vector3(ox + w / 2, 0.9, oz + d / 2));

		const grid = new THREE.GridHelper(Math.max(w, d) * 1.4, Math.round(Math.max(w, d) * 2), 0x2a3441, 0x1d2632);
		grid.position.set(ox + w / 2, 0.01, oz + d / 2);
		(Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((m) => {
			m.transparent = true;
			m.opacity = 0.3;
		});
		scene.add(grid);

		const wallsToBuild = cfg.wallsBuilt ?? (['north', 'south', 'east', 'west'] as RackWall[]);
		wallsToBuild.forEach((wall) => buildWall(cfg, wall, cfg.height));

		buildRacks(cfg);

		const label = makeLabelSprite(cfg.label, 0xe4e9ef);
		label.position.set(ox + w / 2, cfg.height + 0.6, oz + d / 2);
		scene.add(label);
	}

	function makeLabelSprite(text: string, colorHex = 0xe4e9ef) {
		const canvas = document.createElement('canvas');
		canvas.width = 640;
		canvas.height = 104;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = 'rgba(18,24,33,0.88)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const colorCss = `#${colorHex.toString(16).padStart(6, '0')}`;
		ctx.strokeStyle = colorCss;
		ctx.lineWidth = 3;
		ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
		ctx.fillStyle = '#e4e9ef';
		ctx.font = '600 34px "JetBrains Mono", monospace';
		ctx.textBaseline = 'middle';
		ctx.fillText(text.toUpperCase(), 22, canvas.height / 2);
		const tex = new THREE.CanvasTexture(canvas);
		const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
		const sprite = new THREE.Sprite(mat);
		const aspect = canvas.width / canvas.height;
		sprite.scale.set(1.7 * aspect * 0.32, 1.7 * 0.32, 1);
		allLabels.push(sprite);
		return sprite;
	}

	function buildCamera(cfg: CameraConfig) {
		const group = new THREE.Group();
		const online = cfg.status === 'online';
		const color = online ? 0x3fa9f5 : 0x8b98a9;

		const coneGeo = new THREE.ConeGeometry(0.12, 0.28, 12);
		const coneMat = new THREE.MeshStandardMaterial({
			color,
			emissive: color,
			emissiveIntensity: online ? 0.6 : 0.05,
			roughness: 0.4
		});
		const cone = new THREE.Mesh(coneGeo, coneMat);
		cone.position.set(...cfg.position);

		const dir = new THREE.Vector3(...cfg.target).sub(new THREE.Vector3(...cfg.position)).normalize();
		const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
		cone.quaternion.copy(quat);
		cone.userData = { cameraId: cfg.id };

		const dist = new THREE.Vector3(...cfg.target).distanceTo(new THREE.Vector3(...cfg.position));
		const radius = Math.min(2.2, Math.tan((cfg.fovDeg * Math.PI) / 360) * dist);
		const fovLength = Math.min(dist, radius / Math.tan((cfg.fovDeg * Math.PI) / 360));
		const fovGeo = new THREE.ConeGeometry(radius, fovLength, 24, 1, true);
		const fovMat = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: online ? 0.05 : 0.015,
			side: THREE.DoubleSide,
			depthWrite: false
		});
		const fovCone = new THREE.Mesh(fovGeo, fovMat);
		fovCone.position.set(...cfg.position);
		fovCone.quaternion.copy(quat);
		fovCone.translateY(-fovLength / 2);

		const ringGeo = new THREE.TorusGeometry(0.18, 0.012, 8, 24);
		const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: online ? 0.9 : 0.3 });
		const ring = new THREE.Mesh(ringGeo, ringMat);
		ring.position.set(...cfg.position);
		ring.lookAt(new THREE.Vector3(...cfg.target));

		const label = makeLabelSprite(cfg.id, color);
		label.position.set(cfg.position[0], cfg.position[1] + 0.4, cfg.position[2]);
		group.add(label);

		group.add(cone, fovCone, ring);
		scene.add(group);
		camNodes.set(cfg.id, { cone, ring });
	}

	onMount(() => {
		scene = new THREE.Scene();
		scene.background = null;

		const width = container.clientWidth || 640;
		const height = container.clientHeight || 480;
		camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
		camera.position.set(9, 11, 15);

		renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setSize(width, height);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		// Second renderer sharing the same scene, positioned at whichever
		// camera node is selected — a genuine picture-in-picture render of
		// this facility from that camera's own position/angle, not a fake
		// video feed. Only created once povCanvas actually has a selection
		// to show (see the $effect below).
		if (povCanvas) {
			povRenderer = new THREE.WebGLRenderer({ canvas: povCanvas, antialias: true, alpha: true });
			povRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			povCamera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);
		}

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.minDistance = 4;
		controls.maxDistance = 34;
		controls.maxPolarAngle = Math.PI / 2.05;
		controls.target.set(6, 0.5, 3);
		controls.update();

		scene.add(new THREE.AmbientLight(0x9fb4cc, 0.55));
		const dir1 = new THREE.DirectionalLight(0xffffff, 0.7);
		dir1.position.set(8, 14, 6);
		scene.add(dir1);
		const dir2 = new THREE.DirectionalLight(0x3fa9f5, 0.25);
		dir2.position.set(-6, 8, -4);
		scene.add(dir2);

		rooms.forEach(buildRoom);
		if (qrScanner) buildQrScanner(qrScanner);
		cameraLayout.forEach(buildCamera);

		const DEFAULT_CAM_POS = new THREE.Vector3(9, 11, 15);
		const DEFAULT_TARGET = new THREE.Vector3(6, 0.5, 3);

		// Camera fly-to animation state
		let flying = false;
		let flyFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
		let flyTo = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
		let flyStart = 0;
		const FLY_MS = 750;
		function easeInOutCubic(x: number) {
			return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
		}
		function flyCameraTo(pos: THREE.Vector3, target: THREE.Vector3) {
			flyFrom = { pos: camera.position.clone(), target: controls.target.clone() };
			flyTo = { pos: pos.clone(), target: target.clone() };
			flyStart = performance.now();
			flying = true;
			controls.enabled = false;
		}

		function focusRoom(zoneId: ZoneId) {
			const cfg = roomsById.get(zoneId);
			const center = roomCenters.get(zoneId);
			if (!cfg || !center) return;
			const [w, d] = cfg.size;
			const span = Math.max(w, d);
			const camPos = new THREE.Vector3(center.x + span * 0.55, span * 0.62 + 1.5, center.z + span * 0.75);
			flyCameraTo(camPos, center);
			focusedZoneId = zoneId;
		}

		function unfocus() {
			flyCameraTo(DEFAULT_CAM_POS, DEFAULT_TARGET);
			focusedZoneId = null;
			focusScreenPos = null;
		}

		const raycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();
		function onClick(e: MouseEvent) {
			const rect = renderer.domElement.getBoundingClientRect();
			pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
			raycaster.setFromCamera(pointer, camera);

			const camHits = raycaster.intersectObjects(
				[...camNodes.values()].map((n) => n.cone),
				false
			);
			if (camHits.length) {
				selectedCameraId = camHits[0].object.userData.cameraId;
				return;
			}

			const clickPt: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
			const matches = rooms.filter((cfg) => {
				const hull = roomScreenHull(cfg, rect);
				return hull.length >= 3 && pointInPolygon(clickPt, hull);
			});
			if (matches.length) {
				// Prefer the smaller room when hulls overlap on screen (e.g. the
				// armory's hull sits within the big room's) — the more specific,
				// visually "inner" room is what a click there means.
				matches.sort((a, b) => a.size[0] * a.size[1] - b.size[0] * b.size[1]);
				const zoneId = matches[0].id;
				if (focusedZoneId === zoneId) return; // already focused, no-op
				focusRoom(zoneId);
				return;
			}

			// Clicked empty space — return to the overview.
			if (focusedZoneId) unfocus();
		}
		renderer.domElement.addEventListener('click', onClick);

		const projected = new THREE.Vector3();
		function updateFocusAnchor() {
			if (!focusedZoneId || flying) return;
			const center = roomCenters.get(focusedZoneId);
			if (!center) return;
			projected.copy(center).project(camera);
			if (projected.z > 1) {
				focusScreenPos = null;
				return;
			}
			const rect = renderer.domElement.getBoundingClientRect();
			focusScreenPos = {
				x: ((projected.x + 1) / 2) * rect.width,
				y: ((1 - projected.y) / 2) * rect.height
			};
		}

		let t = 0;
		function animate() {
			frameId = requestAnimationFrame(animate);
			t += 0.02;
			camNodes.forEach(({ ring }) => {
				ring.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
			});

			if (flying) {
				const elapsed = performance.now() - flyStart;
				const progress = Math.min(1, elapsed / FLY_MS);
				const eased = easeInOutCubic(progress);
				camera.position.lerpVectors(flyFrom.pos, flyTo.pos, eased);
				controls.target.lerpVectors(flyFrom.target, flyTo.target, eased);
				if (progress >= 1) {
					flying = false;
					controls.enabled = true;
				}
			}

			controls.update();
			updateFocusAnchor();
			renderer.render(scene, camera);

			if (povRenderer && povCamera && selectedCameraId) {
				povRenderer.render(scene, povCamera);
			}
		}
		animate();

		resizeObserver = new ResizeObserver(() => {
			if (!container) return;
			const w = container.clientWidth;
			const h = container.clientHeight;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		});
		resizeObserver.observe(container);

		return () => {
			renderer.domElement.removeEventListener('click', onClick);
		};
	});

	// Keep floor colors in sync with live occupancy state (data-driven, no scene rebuild)
	$effect(() => {
		for (const [zoneId, mat] of floorMats.entries()) {
			const status = zoneStatus[zoneId]?.status ?? 'clear';
			mat.color.setHex(STATUS_COLOR[status]);
			mat.opacity = status === 'clear' ? 0.16 : 0.34;
		}
	});

	// Label sprites use a fixed world-space scale, so up close (when a room is
	// focused) they'd otherwise blow up to cover the screen. Hiding them while
	// focused keeps the zoomed-in view legible; the room/door context is
	// already shown in the side panel at that point anyway.
	$effect(() => {
		const hide = !!focusedZoneId;
		for (const label of allLabels) {
			label.visible = !hide;
		}
	});

	// Point the picture-in-picture camera at whichever camera node is
	// selected, matching that physical camera's own position/target/FOV
	// exactly — this is what makes the PiP a genuine "view from this
	// camera" rather than an arbitrary preview angle.
	$effect(() => {
		if (!povCamera || !povRenderer || !povCanvas) return;
		const cfg = cameraLayout.find((c) => c.id === selectedCameraId);
		if (!cfg) return;
		povCamera.position.set(...cfg.position);
		povCamera.up.set(0, 1, 0);
		povCamera.lookAt(new THREE.Vector3(...cfg.target));
		povCamera.fov = cfg.fovDeg;
		povCamera.updateProjectionMatrix();

		const w = povCanvas.clientWidth || 240;
		const h = povCanvas.clientHeight || 160;
		povRenderer.setSize(w, h, false);
		povCamera.aspect = w / h;
		povCamera.updateProjectionMatrix();
	});

	onDestroy(() => {
		if (frameId) cancelAnimationFrame(frameId);
		resizeObserver?.disconnect();
		controls?.dispose();
		renderer?.dispose();
		povRenderer?.dispose();
	});
</script>

<div bind:this={container} class="relative h-full w-full cursor-grab active:cursor-grabbing">
	<div
		class="pointer-events-none absolute bottom-3 left-3 z-10 overflow-hidden rounded-sm border border-accent/40 bg-black shadow-lg transition-opacity {selectedCameraId
			? 'opacity-100'
			: 'pointer-events-none opacity-0'}"
	>
		<canvas bind:this={povCanvas} class="block h-[140px] w-[220px]"></canvas>
		<div class="absolute top-1 left-1.5 flex items-center gap-1 rounded-sm bg-black/60 px-1.5 py-0.5">
			<span class="pulse-dot relative h-1.5 w-1.5 rounded-full bg-alert"></span>
			<span class="font-mono text-[9px] tracking-wide text-white uppercase">{selectedCameraId ?? ''} live</span>
		</div>
	</div>
</div>
