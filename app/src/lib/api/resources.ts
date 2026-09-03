import { apiFetch } from './client';
import {
	mapAccessRequest,
	mapAuditEvent,
	mapCamera,
	mapFacility,
	mapFirearm,
	mapGuard,
	mapMaintenance,
	mapSystemUser,
	mapZone
} from './mappers';
import type {
	AccessRequest,
	AccessRequestStatus,
	AccessRequestType,
	AuditEvent,
	AuditEventType,
	AuditSeverity,
	CameraConfig,
	ClearanceLevel,
	Company,
	DoorConfig,
	Firearm,
	Guard,
	GuardStatus,
	MaintenanceRecord,
	Notification,
	QrScannerConfig,
	RoomConfig,
	SystemRole,
	SystemUser,
	Zone,
	ZoneId
} from '$lib/types';

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export const companiesApi = {
	list: async (opts: { includeDeleted?: boolean } = {}) =>
		apiFetch<Company[]>('/api/companies', { query: { includeDeleted: opts.includeDeleted } }),
	create: async (body: { name: string; description?: string | null }) => apiFetch<Company>('/api/companies', { method: 'POST', body }),
	update: async (id: string, body: Partial<{ name: string; description: string | null }>) =>
		apiFetch<Company>(`/api/companies/${id}`, { method: 'PATCH', body }),
	remove: async (id: string) => apiFetch<{ message: string }>(`/api/companies/${id}`, { method: 'DELETE' }),
	restore: async (id: string) => apiFetch<{ message: string }>(`/api/companies/${id}/restore`, { method: 'POST' })
};

export const guardsApi = {
	list: async (opts: { includeDeleted?: boolean } = {}) =>
		(await apiFetch<any[]>('/api/guards', { query: { includeDeleted: opts.includeDeleted } })).map(mapGuard),
	get: async (id: string) => mapGuard(await apiFetch<any>(`/api/guards/${id}`)),
	create: async (body: {
		name: string;
		rank: string;
		companyId: string;
		clearance: ClearanceLevel;
		status?: GuardStatus;
		photoInitials: string;
		shift: string;
	}) => mapGuard(await apiFetch<any>('/api/guards', { method: 'POST', body })),
	update: async (id: string, body: Partial<Guard>) => mapGuard(await apiFetch<any>(`/api/guards/${id}`, { method: 'PATCH', body })),
	remove: async (id: string) => apiFetch<{ message: string }>(`/api/guards/${id}`, { method: 'DELETE' }),
	restore: async (id: string) => apiFetch<{ message: string }>(`/api/guards/${id}/restore`, { method: 'POST' }),
	issueQrToken: async (id: string, doorId = 'DOOR-01') =>
		apiFetch<{ code: string; doorId: string; expiresAt: string; ttlSeconds: number }>(`/api/guards/${id}/qr-token`, {
			method: 'POST',
			body: { doorId }
		})
};

// ---------------------------------------------------------------------------
// Firearms + maintenance
// ---------------------------------------------------------------------------

export const firearmsApi = {
	list: async (opts: { includeDeleted?: boolean } = {}) =>
		(await apiFetch<any[]>('/api/firearms', { query: { includeDeleted: opts.includeDeleted } })).map(mapFirearm),
	get: async (id: string) => mapFirearm(await apiFetch<any>(`/api/firearms/${id}`)),
	create: async (body: { serial: string; rfidTag: string; model: string; caliber: string; rack: string; slot: string }) =>
		mapFirearm(await apiFetch<any>('/api/firearms', { method: 'POST', body })),
	update: async (id: string, body: Partial<Firearm>) => mapFirearm(await apiFetch<any>(`/api/firearms/${id}`, { method: 'PATCH', body })),
	remove: async (id: string) => apiFetch<{ message: string }>(`/api/firearms/${id}`, { method: 'DELETE' }),
	restore: async (id: string) => apiFetch<{ message: string }>(`/api/firearms/${id}/restore`, { method: 'POST' }),

	checkout: async (id: string, guardId: string) =>
		apiFetch<{ firearm: any; event: any }>(`/api/firearms/${id}/checkout`, { method: 'POST', body: { guardId } }).then((r) => ({
			firearm: mapFirearm(r.firearm),
			event: mapAuditEvent(r.event)
		})),
	checkin: async (id: string) =>
		apiFetch<{ firearm: any; event: any }>(`/api/firearms/${id}/checkin`, { method: 'POST' }).then((r) => ({
			firearm: mapFirearm(r.firearm),
			event: mapAuditEvent(r.event)
		})),

	logMaintenance: async (id: string, body: { date: string; armorerId?: string | null; work: string; nextDue: string }) =>
		mapMaintenance(await apiFetch<any>(`/api/firearms/${id}/maintenance`, { method: 'POST', body })),
	assignMaintenance: async (id: string, body: { armorerId: string; work: string; nextDue: string; date?: string }) =>
		mapMaintenance(await apiFetch<any>(`/api/firearms/${id}/maintenance/assign`, { method: 'POST', body })),
	completeMaintenance: async (recordId: string, body: { work?: string; returnToService?: boolean } = {}) =>
		mapMaintenance(await apiFetch<any>(`/api/firearms/maintenance/${recordId}/complete`, { method: 'POST', body }))
};

// ---------------------------------------------------------------------------
// System Users
// ---------------------------------------------------------------------------

export const rolesApi = {
	list: async () => apiFetch<{ id: SystemRole; label: string; description: string }[]>('/api/roles')
};

export const usersApi = {
	list: async (opts: { includeDeleted?: boolean } = {}) =>
		(await apiFetch<any[]>('/api/users', { query: { includeDeleted: opts.includeDeleted } })).map(mapSystemUser),
	create: async (body: { name: string; email: string; role: SystemRole; mfaEnabled?: boolean }) =>
		mapSystemUser(await apiFetch<any>('/api/users', { method: 'POST', body })),
	update: async (id: string, body: Partial<SystemUser>) => mapSystemUser(await apiFetch<any>(`/api/users/${id}`, { method: 'PATCH', body })),
	remove: async (id: string) => apiFetch<{ message: string }>(`/api/users/${id}`, { method: 'DELETE' }),
	restore: async (id: string) => apiFetch<{ message: string }>(`/api/users/${id}/restore`, { method: 'POST' })
};

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export const zonesApi = {
	list: async () => (await apiFetch<any[]>('/api/zones')).map(mapZone),
	get: async (id: ZoneId) => mapZone(await apiFetch<any>(`/api/zones/${id}`)),
	update: async (id: ZoneId, body: Partial<Zone>) => mapZone(await apiFetch<any>(`/api/zones/${id}`, { method: 'PATCH', body })),
	entry: async (id: ZoneId, guardId: string, method: 'qr' | 'facial' | 'rfid_threshold' | 'none') =>
		apiFetch<{ session: any; event: any }>(`/api/zones/${id}/entry`, { method: 'POST', body: { guardId, method } }).then((r) => ({
			session: r.session,
			event: mapAuditEvent(r.event)
		})),
	exit: async (id: ZoneId, guardId: string) =>
		apiFetch<{ session: any; event: any }>(`/api/zones/${id}/exit`, { method: 'POST', body: { guardId } }).then((r) => ({
			session: r.session,
			event: mapAuditEvent(r.event)
		}))
};

// ---------------------------------------------------------------------------
// Cameras + facility layout (rooms/doors/QR scanners)
// ---------------------------------------------------------------------------

export const camerasApi = {
	list: async () => (await apiFetch<any[]>('/api/cameras')).map(mapCamera)
};

export const facilityApi = {
	layout: async (): Promise<{ rooms: RoomConfig[]; doors: DoorConfig[]; qrScanners: QrScannerConfig[] }> =>
		mapFacility(await apiFetch<any[]>('/api/facility/rooms')),
	scanDoor: async (doorId: string, code: string, guardId: string) =>
		apiFetch<{ session: any; event: any }>(`/api/facility/doors/${doorId}/scan`, { method: 'POST', body: { code, guardId } }).then((r) => ({
			session: r.session,
			event: mapAuditEvent(r.event)
		}))
};

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const auditApi = {
	list: async (
		opts: {
			type?: AuditEventType;
			severity?: AuditSeverity;
			zoneId?: string;
			firearmId?: string;
			limit?: number;
		} = {}
	): Promise<AuditEvent[]> => (await apiFetch<any[]>('/api/audit', { query: opts })).map(mapAuditEvent),
	create: async (body: { type: 'override' | 'admin_action' | 'alert'; severity?: AuditSeverity; zoneId?: string; firearmId?: string; detail: string }) =>
		mapAuditEvent(await apiFetch<any>('/api/audit', { method: 'POST', body }))
};

// ---------------------------------------------------------------------------
// Access requests (application / approval workflow)
// ---------------------------------------------------------------------------

export const accessRequestsApi = {
	list: async (opts: { type?: AccessRequestType; status?: AccessRequestStatus; guardId?: string; firearmId?: string } = {}) =>
		(await apiFetch<any[]>('/api/access-requests', { query: opts })).map(mapAccessRequest),
	create: async (body: { type: AccessRequestType; guardId: string; zoneId?: string; firearmId?: string; notes?: string }) =>
		mapAccessRequest(await apiFetch<any>('/api/access-requests', { method: 'POST', body })),
	approve: async (id: string, notes?: string) => mapAccessRequest(await apiFetch<any>(`/api/access-requests/${id}/approve`, { method: 'POST', body: { notes } })),
	reject: async (id: string, notes?: string) => mapAccessRequest(await apiFetch<any>(`/api/access-requests/${id}/reject`, { method: 'POST', body: { notes } })),
	revoke: async (id: string, notes?: string) => mapAccessRequest(await apiFetch<any>(`/api/access-requests/${id}/revoke`, { method: 'POST', body: { notes } }))
};

// ---------------------------------------------------------------------------
// Notifications (admin-facing)
// ---------------------------------------------------------------------------

export const notificationsApi = {
	list: async (): Promise<Notification[]> => apiFetch<Notification[]>('/api/notifications'),
	markRead: async (id: string) => apiFetch<Notification>(`/api/notifications/${id}/read`, { method: 'POST' }),
	markAllRead: async () => apiFetch<{ message: string }>('/api/notifications/read-all', { method: 'POST' })
};
