import {
	pgTable,
	pgEnum,
	text,
	timestamp,
	boolean,
	doublePrecision,
	integer,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums — mirror the union types in the frontend's src/lib/types.ts
// ---------------------------------------------------------------------------

export const systemUserStatusEnum = pgEnum('system_user_status', ['active', 'disabled']);
export const clearanceLevelEnum = pgEnum('clearance_level', ['level_1', 'level_2', 'level_3']);
export const guardStatusEnum = pgEnum('guard_status', ['active', 'suspended', 'off_duty']);
export const zoneStatusEnum = pgEnum('zone_status', ['clear', 'occupied', 'alert']);
export const firearmStatusEnum = pgEnum('firearm_status', [
	'in_armory',
	'checked_out',
	'maintenance',
	'decommissioned'
]);
export const tagHealthEnum = pgEnum('tag_health', ['ok', 'weak', 'tamper']);
export const cameraStatusEnum = pgEnum('camera_status', ['online', 'offline']);
export const rackWallEnum = pgEnum('rack_wall', ['north', 'south', 'east', 'west']);
export const doorGateEnum = pgEnum('door_gate', ['qr', 'facial', 'rfid_threshold', 'none']);
export const auditEventTypeEnum = pgEnum('audit_event_type', [
	'qr_scan',
	'facial_match',
	'facial_fail',
	'firearm_taken',
	'firearm_returned',
	'maintenance',
	'override',
	'admin_action',
	'alert'
]);
export const auditSeverityEnum = pgEnum('audit_severity', ['info', 'warning', 'critical']);

export const accessRequestTypeEnum = pgEnum('access_request_type', ['zone_access', 'firearm_assignment']);
export const accessRequestStatusEnum = pgEnum('access_request_status', ['pending', 'approved', 'rejected', 'revoked']);
export const maintenanceStatusEnum = pgEnum('maintenance_status', ['assigned', 'in_progress', 'completed']);

// ---------------------------------------------------------------------------
// Roles — a real lookup table instead of a bare Postgres enum, so a role is
// a first-class, queryable/extendable row rather than a hardcoded label.
// ---------------------------------------------------------------------------

export const roles = pgTable('roles', {
	id: text('id').primaryKey(), // 'admin' | 'duty_officer' | 'armorer' | 'auditor' — stable natural key
	label: text('label').notNull(),
	description: text('description').notNull()
});

// ---------------------------------------------------------------------------
// Back-office accounts (System Users page) — passwordless/OTP login, RBAC
// ---------------------------------------------------------------------------

export const systemUsers = pgTable(
	'system_users',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		// JS-facing field is `role` for compatibility with the rest of the app
		// (JWT claims, RBAC middleware, etc.), but the actual DB column is a
		// proper FK to roles.id, not a bare enum value.
		role: text('role_id')
			.notNull()
			.references(() => roles.id),
		status: systemUserStatusEnum('status').notNull().default('active'),
		mfaEnabled: boolean('mfa_enabled').notNull().default(false),
		lastLogin: timestamp('last_login', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [uniqueIndex('system_users_email_idx').on(t.email), index('system_users_deleted_at_idx').on(t.deletedAt)]
);

export const otpCodes = pgTable(
	'otp_codes',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => systemUsers.id, { onDelete: 'cascade' }),
		code: text('code').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		consumedAt: timestamp('consumed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('otp_codes_user_code_idx').on(t.userId, t.code)]
);

// ---------------------------------------------------------------------------
// Guards Management
// ---------------------------------------------------------------------------

export const guards = pgTable(
	'guards',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		rank: text('rank').notNull(),
		unit: text('unit').notNull(),
		clearance: clearanceLevelEnum('clearance').notNull(),
		status: guardStatusEnum('status').notNull().default('active'),
		photoInitials: text('photo_initials').notNull(),
		biometricEnrolled: boolean('biometric_enrolled').notNull().default(false),
		tokenIssued: boolean('token_issued').notNull().default(false),
		shift: text('shift').notNull(),
		lastSeen: timestamp('last_seen', { withTimezone: true }),
		currentZoneId: text('current_zone_id').references(() => zones.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('guards_deleted_at_idx').on(t.deletedAt)]
);

// ---------------------------------------------------------------------------
// Facility layout — Zones / Rooms / Doors / Cameras / QR scanners.
// Kept editable (not just seed-only) so the "modular camera layout" concept
// from the frontend holds true here too: adding a camera is an API call,
// not a code change.
// ---------------------------------------------------------------------------

export const zones = pgTable('zones', {
	id: text('id').primaryKey(), // 'zone-a' | 'zone-b' | 'zone-c'
	label: text('label').notNull(),
	description: text('description'),
	status: zoneStatusEnum('status').notNull().default('clear'),
	/** If true, entering this zone requires an approved zone_access AccessRequest for the guard — see accessRequests below. Set on the armory (Zone C) by default. */
	requiresAuthorization: boolean('requires_authorization').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

// Which guards are currently inside which zone — powers "Currently inside"
// on the monitoring page, and gives zone entry/exit its own history.
export const zoneSessions = pgTable(
	'zone_sessions',
	{
		id: text('id').primaryKey(),
		zoneId: text('zone_id')
			.notNull()
			.references(() => zones.id),
		guardId: text('guard_id')
			.notNull()
			.references(() => guards.id),
		enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
		exitedAt: timestamp('exited_at', { withTimezone: true }),
		method: doorGateEnum('method').notNull()
	},
	(t) => [index('zone_sessions_zone_exit_idx').on(t.zoneId, t.exitedAt), index('zone_sessions_guard_exit_idx').on(t.guardId, t.exitedAt)]
);

export const rooms = pgTable('rooms', {
	// Shared primary key: a Room only ever exists because a Zone has one, so
	// its id IS the zone's id rather than a separate synthetic key plus a
	// unique FK column pointing back at it.
	id: text('id')
		.primaryKey()
		.references(() => zones.id),
	label: text('label').notNull(),
	width: doublePrecision('width').notNull(),
	depth: doublePrecision('depth').notNull(),
	originX: doublePrecision('origin_x').notNull(),
	originZ: doublePrecision('origin_z').notNull(),
	height: doublePrecision('height').notNull(),
	wallsBuilt: rackWallEnum('walls_built').array().notNull().default([]),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true })
});

export const rackWallConfigs = pgTable('rack_wall_configs', {
	id: text('id').primaryKey(),
	roomId: text('room_id')
		.notNull()
		.references(() => rooms.id, { onDelete: 'cascade' }),
	wall: rackWallEnum('wall').notNull(),
	count: integer('count').notNull()
});

export const doors = pgTable(
	'doors',
	{
		id: text('id').primaryKey(),
		label: text('label').notNull(),
		roomId: text('room_id')
			.notNull()
			.references(() => rooms.id),
		wall: rackWallEnum('wall').notNull(),
		t: doublePrecision('t').notNull(),
		width: doublePrecision('width').notNull(),
		gate: doorGateEnum('gate').notNull(),
		// The zone this door leads to on its far side. Null means it leads
		// outside the building envelope — a real nullable FK instead of a
		// magic 'outside' string, so a typo'd zone id can't silently pass.
		connectsToZoneId: text('connects_to_zone_id').references(() => zones.id),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('doors_deleted_at_idx').on(t.deletedAt)]
);

export const qrScanners = pgTable(
	'qr_scanners',
	{
		// Shared primary key: a QR scanner only ever exists because a Door has
		// one, so its id IS the door's id rather than a separate synthetic key
		// plus a unique FK column pointing back at it.
		id: text('id')
			.primaryKey()
			.references(() => doors.id),
		label: text('label').notNull(),
		posX: doublePrecision('pos_x').notNull(),
		posY: doublePrecision('pos_y').notNull(),
		posZ: doublePrecision('pos_z').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	}
);

/**
 * Short-lived, single-use codes for the QR gate at Door 1. A guard's app
 * requests one (POST /api/guards/:id/qr-token), it's valid for
 * QR_TOKEN_TTL_SECONDS and only until first use, and the reader at the door
 * redeems it (POST /api/doors/:doorId/scan) — which is what actually admits
 * the guard into the zone that door opens into.
 */
export const qrTokens = pgTable(
	'qr_tokens',
	{
		id: text('id').primaryKey(),
		guardId: text('guard_id')
			.notNull()
			.references(() => guards.id),
		doorId: text('door_id')
			.notNull()
			.references(() => doors.id),
		code: text('code').notNull(),
		issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		consumedAt: timestamp('consumed_at', { withTimezone: true })
	},
	(t) => [uniqueIndex('qr_tokens_code_idx').on(t.code), index('qr_tokens_guard_idx').on(t.guardId)]
);

export const cameras = pgTable(
	'cameras',
	{
		id: text('id').primaryKey(),
		label: text('label').notNull(),
		zoneId: text('zone_id')
			.notNull()
			.references(() => zones.id),
		posX: doublePrecision('pos_x').notNull(),
		posY: doublePrecision('pos_y').notNull(),
		posZ: doublePrecision('pos_z').notNull(),
		targetX: doublePrecision('target_x').notNull(),
		targetY: doublePrecision('target_y').notNull(),
		targetZ: doublePrecision('target_z').notNull(),
		fovDeg: doublePrecision('fov_deg').notNull(),
		status: cameraStatusEnum('status').notNull().default('online'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('cameras_deleted_at_idx').on(t.deletedAt)]
);

// ---------------------------------------------------------------------------
// Firearm Management
// ---------------------------------------------------------------------------

export const firearms = pgTable(
	'firearms',
	{
		id: text('id').primaryKey(),
		serial: text('serial').notNull(),
		rfidTag: text('rfid_tag').notNull(),
		model: text('model').notNull(),
		caliber: text('caliber').notNull(),
		rack: text('rack').notNull(),
		slot: text('slot').notNull(),
		status: firearmStatusEnum('status').notNull().default('in_armory'),
		holderId: text('holder_id').references(() => guards.id),
		checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
		tagHealth: tagHealthEnum('tag_health').notNull().default('ok'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [
		uniqueIndex('firearms_serial_idx').on(t.serial),
		uniqueIndex('firearms_rfid_tag_idx').on(t.rfidTag),
		index('firearms_deleted_at_idx').on(t.deletedAt)
	]
);

export const maintenanceRecords = pgTable(
	'maintenance_records',
	{
		id: text('id').primaryKey(),
		firearmId: text('firearm_id')
			.notNull()
			.references(() => firearms.id),
		date: timestamp('date', { withTimezone: true }).notNull(),
		/** The person in charge — who the maintenance is assigned to / who performed it. */
		armorerId: text('armorer_id').references(() => systemUsers.id),
		/** Who made the assignment (admin/duty officer). Null for records logged directly as already-completed history. */
		assignedByUserId: text('assigned_by_user_id').references(() => systemUsers.id),
		status: maintenanceStatusEnum('status').notNull().default('completed'),
		work: text('work').notNull(),
		nextDue: timestamp('next_due', { withTimezone: true }).notNull(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('maintenance_deleted_at_idx').on(t.deletedAt), index('maintenance_firearm_idx').on(t.firearmId)]
);

/**
 * Applications for either (a) permission for a guard to physically enter an
 * authorization-gated zone, or (b) permission for a guard to be issued a
 * specific firearm. Both follow the same apply -> admin approves/rejects
 * shape, so they share one table rather than two near-identical ones.
 */
export const accessRequests = pgTable(
	'access_requests',
	{
		id: text('id').primaryKey(),
		type: accessRequestTypeEnum('type').notNull(),
		guardId: text('guard_id')
			.notNull()
			.references(() => guards.id),
		zoneId: text('zone_id').references(() => zones.id),
		firearmId: text('firearm_id').references(() => firearms.id),
		status: accessRequestStatusEnum('status').notNull().default('pending'),
		requestedByUserId: text('requested_by_user_id').references(() => systemUsers.id),
		requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
		decidedByUserId: text('decided_by_user_id').references(() => systemUsers.id),
		decidedAt: timestamp('decided_at', { withTimezone: true }),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [
		index('access_requests_guard_idx').on(t.guardId),
		index('access_requests_status_idx').on(t.status),
		index('access_requests_deleted_at_idx').on(t.deletedAt)
	]
);

// ---------------------------------------------------------------------------
// Audit Trail — append-only & hash-chained on purpose (see README §Audit).
// No deletedAt column and no update/delete route exists for this table, even
// though every other resource supports soft delete: an editable or deletable
// audit trail would defeat the point of having one.
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
	'audit_events',
	{
		id: text('id').primaryKey(),
		type: auditEventTypeEnum('type').notNull(),
		severity: auditSeverityEnum('severity').notNull().default('info'),
		timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
		actorName: text('actor_name').notNull(),
		actorGuardId: text('actor_guard_id').references(() => guards.id),
		actorUserId: text('actor_user_id').references(() => systemUsers.id),
		zoneId: text('zone_id').references(() => zones.id),
		firearmId: text('firearm_id').references(() => firearms.id),
		detail: text('detail').notNull(),
		hash: text('hash').notNull(),
		prevHash: text('prev_hash'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('audit_events_hash_idx').on(t.hash),
		index('audit_events_timestamp_idx').on(t.timestamp),
		index('audit_events_type_idx').on(t.type)
	]
);

// ---------------------------------------------------------------------------
// Relations (used by Drizzle's relational query API — db.query.x.findMany({ with: ... }))
// ---------------------------------------------------------------------------

export const rolesRelations = relations(roles, ({ many }) => ({
	users: many(systemUsers)
}));

export const systemUsersRelations = relations(systemUsers, ({ one, many }) => ({
	roleRef: one(roles, { fields: [systemUsers.role], references: [roles.id] }),
	otpCodes: many(otpCodes),
	maintenanceRecordsAssigned: many(maintenanceRecords, { relationName: 'ArmorerUser' }),
	maintenanceRecordsAssignedBy: many(maintenanceRecords, { relationName: 'AssignedByUser' }),
	auditEventsAsActor: many(auditEvents),
	accessRequestsDecided: many(accessRequests, { relationName: 'DecidedByUser' }),
	accessRequestsRequested: many(accessRequests, { relationName: 'RequestedByUser' })
}));

export const otpCodesRelations = relations(otpCodes, ({ one }) => ({
	user: one(systemUsers, { fields: [otpCodes.userId], references: [systemUsers.id] })
}));

export const guardsRelations = relations(guards, ({ one, many }) => ({
	currentZone: one(zones, { fields: [guards.currentZoneId], references: [zones.id] }),
	firearmsHeld: many(firearms),
	zoneSessions: many(zoneSessions),
	auditEventsAsActor: many(auditEvents),
	qrTokens: many(qrTokens),
	accessRequests: many(accessRequests)
}));

export const zonesRelations = relations(zones, ({ many, one }) => ({
	guards: many(guards),
	cameras: many(cameras),
	room: one(rooms, { fields: [zones.id], references: [rooms.id] }),
	zoneSessions: many(zoneSessions),
	auditEvents: many(auditEvents),
	accessRequests: many(accessRequests)
}));

export const zoneSessionsRelations = relations(zoneSessions, ({ one }) => ({
	zone: one(zones, { fields: [zoneSessions.zoneId], references: [zones.id] }),
	guard: one(guards, { fields: [zoneSessions.guardId], references: [guards.id] })
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
	zone: one(zones, { fields: [rooms.id], references: [zones.id] }),
	racks: many(rackWallConfigs),
	doors: many(doors)
}));

export const rackWallConfigsRelations = relations(rackWallConfigs, ({ one }) => ({
	room: one(rooms, { fields: [rackWallConfigs.roomId], references: [rooms.id] })
}));

export const doorsRelations = relations(doors, ({ one, many }) => ({
	room: one(rooms, { fields: [doors.roomId], references: [rooms.id] }),
	qrScanner: one(qrScanners, { fields: [doors.id], references: [qrScanners.id] }),
	qrTokens: many(qrTokens)
}));

export const qrTokensRelations = relations(qrTokens, ({ one }) => ({
	guard: one(guards, { fields: [qrTokens.guardId], references: [guards.id] }),
	door: one(doors, { fields: [qrTokens.doorId], references: [doors.id] })
}));

export const qrScannersRelations = relations(qrScanners, ({ one }) => ({
	door: one(doors, { fields: [qrScanners.id], references: [doors.id] })
}));

export const camerasRelations = relations(cameras, ({ one }) => ({
	zone: one(zones, { fields: [cameras.zoneId], references: [zones.id] })
}));

export const firearmsRelations = relations(firearms, ({ one, many }) => ({
	holder: one(guards, { fields: [firearms.holderId], references: [guards.id] }),
	maintenance: many(maintenanceRecords),
	auditEvents: many(auditEvents),
	accessRequests: many(accessRequests)
}));

export const maintenanceRecordsRelations = relations(maintenanceRecords, ({ one }) => ({
	firearm: one(firearms, { fields: [maintenanceRecords.firearmId], references: [firearms.id] }),
	armorer: one(systemUsers, { fields: [maintenanceRecords.armorerId], references: [systemUsers.id], relationName: 'ArmorerUser' }),
	assignedBy: one(systemUsers, { fields: [maintenanceRecords.assignedByUserId], references: [systemUsers.id], relationName: 'AssignedByUser' })
}));

export const accessRequestsRelations = relations(accessRequests, ({ one }) => ({
	guard: one(guards, { fields: [accessRequests.guardId], references: [guards.id] }),
	zone: one(zones, { fields: [accessRequests.zoneId], references: [zones.id] }),
	firearm: one(firearms, { fields: [accessRequests.firearmId], references: [firearms.id] }),
	requestedBy: one(systemUsers, { fields: [accessRequests.requestedByUserId], references: [systemUsers.id], relationName: 'RequestedByUser' }),
	decidedBy: one(systemUsers, { fields: [accessRequests.decidedByUserId], references: [systemUsers.id], relationName: 'DecidedByUser' })
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
	actorGuard: one(guards, { fields: [auditEvents.actorGuardId], references: [guards.id] }),
	actorUser: one(systemUsers, { fields: [auditEvents.actorUserId], references: [systemUsers.id] }),
	zone: one(zones, { fields: [auditEvents.zoneId], references: [zones.id] }),
	firearm: one(firearms, { fields: [auditEvents.firearmId], references: [firearms.id] })
}));
