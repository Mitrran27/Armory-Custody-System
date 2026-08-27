import type {
	AccessRequest,
	AuditEvent,
	CameraConfig,
	DoorConfig,
	Firearm,
	Guard,
	MaintenanceRecord,
	QrScannerConfig,
	RoomConfig,
	SystemUser,
	Zone,
	ZoneId
} from '$lib/types';

// The backend is the source of truth for shapes; these mappers exist mainly
// to rename a handful of fields (holderId -> holder, actorName -> actor,
// etc.) and flatten nested relations (armorer object -> armorer name) so
// the rest of the UI can keep working against the original view-model
// shapes the pages were built around.

export function mapGuard(raw: any): Guard {
	return {
		id: raw.id,
		name: raw.name,
		rank: raw.rank,
		unit: raw.unit,
		clearance: raw.clearance,
		status: raw.status,
		photoInitials: raw.photoInitials,
		biometricEnrolled: raw.biometricEnrolled,
		tokenIssued: raw.tokenIssued,
		shift: raw.shift,
		lastSeen: raw.lastSeen,
		currentZone: raw.currentZoneId ?? null
	};
}

export function mapMaintenance(raw: any): MaintenanceRecord {
	return {
		id: raw.id,
		firearmId: raw.firearmId,
		date: raw.date,
		armorer: raw.armorer?.name ?? null,
		armorerId: raw.armorerId ?? null,
		assignedBy: raw.assignedBy?.name ?? null,
		status: raw.status,
		work: raw.work,
		nextDue: raw.nextDue,
		completedAt: raw.completedAt ?? null
	};
}

export function mapFirearm(raw: any): Firearm {
	return {
		id: raw.id,
		serial: raw.serial,
		rfidTag: raw.rfidTag,
		model: raw.model,
		caliber: raw.caliber,
		rack: raw.rack,
		slot: raw.slot,
		status: raw.status,
		holder: raw.holderId ?? null,
		checkedOutAt: raw.checkedOutAt,
		tagHealth: raw.tagHealth,
		maintenance: (raw.maintenance ?? []).map(mapMaintenance)
	};
}

export function mapSystemUser(raw: any): SystemUser {
	return {
		id: raw.id,
		name: raw.name,
		email: raw.email,
		role: raw.role,
		mfaEnabled: raw.mfaEnabled,
		status: raw.status,
		lastLogin: raw.lastLogin
	};
}

export function mapAuditEvent(raw: any): AuditEvent {
	return {
		id: raw.id,
		type: raw.type,
		severity: raw.severity,
		timestamp: raw.timestamp,
		actor: raw.actorName,
		actorGuardId: raw.actorGuardId ?? null,
		actorUserId: raw.actorUserId ?? null,
		zone: raw.zoneId ?? null,
		firearmId: raw.firearmId ?? null,
		detail: raw.detail,
		hash: raw.hash
	};
}

export function mapZone(raw: any): Zone {
	return {
		id: raw.id,
		label: raw.label,
		description: raw.description ?? null,
		status: raw.status,
		requiresAuthorization: raw.requiresAuthorization,
		occupants: (raw.zoneSessions ?? []).map((s: any) => s.guardId)
	};
}

export function mapCamera(raw: any): CameraConfig {
	return {
		id: raw.id,
		label: raw.label,
		zone: raw.zoneId,
		position: [raw.posX, raw.posY, raw.posZ],
		target: [raw.targetX, raw.targetY, raw.targetZ],
		fovDeg: raw.fovDeg,
		status: raw.status
	};
}

export function mapAccessRequest(raw: any): AccessRequest {
	return {
		id: raw.id,
		type: raw.type,
		guardId: raw.guardId,
		guardName: raw.guard?.name ?? raw.guardId,
		zoneId: raw.zoneId ?? null,
		firearmId: raw.firearmId ?? null,
		firearmLabel: raw.firearm ? `${raw.firearm.model} (${raw.firearm.id})` : null,
		status: raw.status,
		requestedByName: raw.requestedBy?.name ?? null,
		requestedAt: raw.requestedAt,
		decidedByName: raw.decidedBy?.name ?? null,
		decidedAt: raw.decidedAt ?? null,
		notes: raw.notes ?? null
	};
}

/**
 * The facility endpoint returns rooms keyed by their own synthetic id
 * ("room-zone-b") with a `zoneId` field. The frontend's 3D scene expects
 * RoomConfig.id to equal the zone id directly (that's how it correlates
 * live occupancy status to room geometry) — this is the one place that
 * distinction actually matters, so it's translated once, here.
 */
export function mapFacility(rawRooms: any[]): { rooms: RoomConfig[]; doors: DoorConfig[]; qrScanners: QrScannerConfig[] } {
	const rooms: RoomConfig[] = [];
	const doors: DoorConfig[] = [];
	const qrScanners: QrScannerConfig[] = [];

	for (const room of rawRooms) {
		const zoneId = room.zoneId as ZoneId;
		rooms.push({
			id: zoneId,
			label: room.label,
			size: [room.width, room.depth],
			origin: [room.originX, room.originZ],
			height: room.height,
			wallsBuilt: room.wallsBuilt?.length ? room.wallsBuilt : undefined,
			racks: room.racks?.length ? room.racks.map((r: any) => ({ wall: r.wall, count: r.count })) : undefined
		});
		for (const door of room.doors ?? []) {
			doors.push({
				id: door.id,
				label: door.label,
				room: zoneId,
				wall: door.wall,
				t: door.t,
				width: door.width,
				gate: door.gate,
				connectsTo: door.connectsTo
			});
			if (door.qrScanner) {
				qrScanners.push({
					id: door.qrScanner.id,
					label: door.qrScanner.label,
					doorId: door.id,
					position: [door.qrScanner.posX, door.qrScanner.posY, door.qrScanner.posZ]
				});
			}
		}
	}

	return { rooms, doors, qrScanners };
}
