export type ZoneId = 'zone-a' | 'zone-b' | 'zone-c';

export type ZoneStatus = 'clear' | 'occupied' | 'alert';

export interface Zone {
	id: ZoneId;
	label: string;
	description: string | null;
	status: ZoneStatus;
	requiresAuthorization: boolean;
	occupants: string[]; // guard IDs currently inside
}

export type ClearanceLevel = 'level_1' | 'level_2' | 'level_3';

export type GuardStatus = 'active' | 'suspended' | 'off_duty';

export interface Company {
	id: string;
	name: string;
	description: string | null;
}

export interface Guard {
	id: string;
	name: string;
	rank: string;
	unit: string; // display name, resolved from the linked company
	companyId: string;
	clearance: ClearanceLevel;
	status: GuardStatus;
	photoInitials: string;
	biometricEnrolled: boolean;
	tokenIssued: boolean;
	shift: string;
	lastSeen: string | null; // ISO
	currentZone: ZoneId | null;
}

export type FirearmStatus = 'in_armory' | 'checked_out' | 'maintenance' | 'decommissioned';

export type MaintenanceStatus = 'assigned' | 'in_progress' | 'completed';

export interface MaintenanceRecord {
	id: string;
	firearmId: string;
	date: string; // ISO
	armorer: string | null; // person in charge — display name
	armorerId: string | null;
	assignedBy: string | null; // display name of who made the assignment
	status: MaintenanceStatus;
	work: string;
	nextDue: string; // ISO
	completedAt: string | null; // ISO
}

export interface Firearm {
	id: string;
	serial: string;
	rfidTag: string;
	model: string;
	caliber: string;
	rack: string;
	slot: string;
	status: FirearmStatus;
	holder: string | null; // guard id
	checkedOutAt: string | null; // ISO
	tagHealth: 'ok' | 'weak' | 'tamper';
	maintenance: MaintenanceRecord[];
}

export type SystemRole = 'admin' | 'duty_officer' | 'armorer' | 'auditor';

export interface SystemUser {
	id: string;
	name: string;
	email: string;
	role: SystemRole;
	mfaEnabled: boolean;
	status: 'active' | 'disabled';
	lastLogin: string | null; // ISO
}

export type AuditEventType =
	| 'qr_scan'
	| 'facial_match'
	| 'facial_fail'
	| 'firearm_taken'
	| 'firearm_returned'
	| 'maintenance'
	| 'override'
	| 'admin_action'
	| 'alert';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEvent {
	id: string;
	type: AuditEventType;
	severity: AuditSeverity;
	timestamp: string; // ISO
	actor: string; // guard or user display name
	actorGuardId: string | null;
	actorUserId: string | null;
	zone: ZoneId | null;
	firearmId: string | null;
	detail: string;
	hash: string; // tamper-evident chain reference
}

export type CameraStatus = 'online' | 'offline';

export interface CameraConfig {
	id: string;
	label: string;
	zone: ZoneId;
	/** Position in room-model units [x, y, z] — modular: add a row here to add a camera to the 3D scene. */
	position: [number, number, number];
	/** Look-at target in room-model units [x, y, z] */
	target: [number, number, number];
	fovDeg: number;
	status: CameraStatus;
}

export type RackWall = 'north' | 'south' | 'east' | 'west';

export interface RoomConfig {
	id: ZoneId;
	label: string;
	/** footprint in model units */
	size: [number, number]; // width (x), depth (z)
	origin: [number, number]; // corner offset (x, z)
	height: number;
	wallsBuilt?: RackWall[];
	racks?: { wall: RackWall; count: number }[];
}

export interface DoorConfig {
	id: string;
	label: string;
	room: ZoneId;
	wall: RackWall;
	t: number;
	width: number;
	gate: 'qr' | 'facial' | 'rfid_threshold' | 'none';
	connectsTo: ZoneId | 'outside';
}

export interface QrScannerConfig {
	id: string;
	label: string;
	doorId: string;
	position: [number, number, number];
}

export type AccessRequestType = 'zone_access' | 'firearm_assignment';
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface AccessRequest {
	id: string;
	type: AccessRequestType;
	guardId: string;
	guardName: string;
	zoneId: ZoneId | null;
	firearmId: string | null;
	firearmLabel: string | null;
	status: AccessRequestStatus;
	requestedByName: string | null;
	requestedAt: string; // ISO
	decidedByName: string | null;
	decidedAt: string | null; // ISO
	notes: string | null;
}

export interface Notification {
	id: string;
	recipientRole: SystemRole;
	type: 'access_request_submitted';
	title: string;
	body: string;
	relatedAccessRequestId: string | null;
	read: boolean;
	createdAt: string; // ISO
}
