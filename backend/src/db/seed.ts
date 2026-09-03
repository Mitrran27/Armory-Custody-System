import 'dotenv/config';
import { inArray } from 'drizzle-orm';
import { db, pool } from './index.js';
import {
	roles,
	companies,
	systemUsers,
	guards,
	zones,
	rooms,
	rackWallConfigs,
	doors,
	qrScanners,
	cameras,
	firearms,
	maintenanceRecords,
	zoneSessions,
	auditEvents,
	accessRequests
} from './schema.js';
import { computeAuditHash } from '../utils/auditHash.js';

async function seed() {
	console.log('Seeding database...');

	// -------------------------------------------------------------------
	// Roles — a real lookup table, referenced by system_users.role (FK)
	// -------------------------------------------------------------------

	await db.insert(roles).values([
		{ id: 'admin', label: 'Administrator', description: 'Full system access — configuration, RBAC, all modules.' },
		{ id: 'duty_officer', label: 'Duty Officer', description: 'Monitors live view, acknowledges alerts, approves overrides.' },
		{ id: 'armorer', label: 'Armorer', description: 'Manages firearm inventory and maintenance records.' },
		{ id: 'auditor', label: 'Auditor', description: 'Read-only access to audit trail and reporting exports.' }
	]);

	// -------------------------------------------------------------------
	// Zones, rooms, doors, QR scanner, cameras — the physical layout
	// -------------------------------------------------------------------

	await db.insert(zones).values([
		{ id: 'zone-a', label: 'Zone A — Approach', description: 'Corridor outside the outer door.', status: 'clear' },
		{ id: 'zone-b', label: 'Big Room — Zone B', description: 'Staging room with the QR gate and facial checkpoint.', status: 'clear' },
		{ id: 'zone-c', label: 'Small Room — Armory (Zone C)', description: 'Weapons vault.', status: 'clear', requiresAuthorization: true }
	]);

	await db.insert(rooms).values([
		{ id: 'zone-b', label: 'Big Room — Zone B', width: 12, depth: 6, originX: 0, originZ: 0, height: 3, wallsBuilt: ['north', 'south', 'east', 'west'] },
		{ id: 'zone-c', label: 'Small Room — Armory (Zone C)', width: 5.5, depth: 2.7, originX: 6.5, originZ: 0, height: 3, wallsBuilt: ['west', 'south'] }
	]);

	await db.insert(rackWallConfigs).values([
		{ id: 'rack-zone-c-north', roomId: 'zone-c', wall: 'north', count: 8 },
		{ id: 'rack-zone-c-west', roomId: 'zone-c', wall: 'west', count: 4 }
	]);

	await db.insert(doors).values([
		{ id: 'DOOR-01', label: 'Door 1 — QR Gate', roomId: 'zone-b', wall: 'west', t: 0.78, width: 1.2, gate: 'qr', connectsToZoneId: null },
		{ id: 'DOOR-02', label: 'Door 2 — Facial Checkpoint', roomId: 'zone-c', wall: 'south', t: 0.31, width: 1.2, gate: 'facial', connectsToZoneId: 'zone-b' }
	]);

	await db.insert(qrScanners).values([{ id: 'DOOR-01', label: 'QR Scanner', posX: -0.7, posY: 1.2, posZ: 4.68 }]);

	await db.insert(cameras).values([
		{ id: 'CAM-01', label: 'Camera 1 — Door 1 / QR Gate', zoneId: 'zone-b', posX: 0.55, posY: 2.6, posZ: 4.55, targetX: 5.5, targetY: 0, targetZ: 2.6, fovDeg: 75, status: 'online' },
		{ id: 'CAM-02', label: 'Camera 2 — Far Corner Overwatch', zoneId: 'zone-b', posX: 11.45, posY: 2.6, posZ: 5.55, targetX: 5, targetY: 0, targetZ: 2.2, fovDeg: 75, status: 'online' }
	]);

	// -------------------------------------------------------------------
	// System users (back-office / RBAC accounts — passwordless OTP login)
	// -------------------------------------------------------------------

	await db.insert(systemUsers).values([
		{ id: 'U-001', name: 'Mitrran Menon', email: 'mitrran@cre8iot.com', role: 'admin', mfaEnabled: true, status: 'active', lastLogin: new Date('2026-08-26T05:40:00+08:00') },
		{ id: 'U-002', name: 'Jeevasulogan', email: 'jeevasulogan@cre8iot.com', role: 'duty_officer', mfaEnabled: true, status: 'active', lastLogin: new Date('2026-08-26T05:55:00+08:00') },
		{ id: 'U-003', name: 'Sasitheran', email: 'sasitheran@cre8iot.com', role: 'armorer', mfaEnabled: true, status: 'active', lastLogin: new Date('2026-08-25T17:20:00+08:00') },
		{ id: 'U-004', name: 'Pathma', email: 'pathma@cre8iot.com', role: 'admin', mfaEnabled: false, status: 'active', lastLogin: new Date('2026-08-24T13:05:00+08:00') },
		{ id: 'U-005', name: 'Test', email: 'test@cre8iot.com', role: 'auditor', mfaEnabled: true, status: 'active', lastLogin: new Date('2026-08-20T09:00:00+08:00') }
	]);

	// -------------------------------------------------------------------
	// Guards
	// -------------------------------------------------------------------

	// -------------------------------------------------------------------
	// Companies — a real lookup table for guard organizational units
	// -------------------------------------------------------------------

	await db.insert(companies).values([
		{ id: 'company-1st-guard', name: '1st Guard Company' },
		{ id: 'company-2nd-guard', name: '2nd Guard Company' },
		{ id: 'company-3rd-guard', name: '3rd Guard Company' }
	]);

	await db.insert(guards).values([
		{ id: 'G-1042', name: 'Matt Armstrong', email: 'matt.armstrong@mg.com', rank: 'Cpl', companyId: 'company-2nd-guard', clearance: 'level_3', status: 'active', photoInitials: 'AH', biometricEnrolled: true, tokenIssued: true, shift: '0600–1400', lastSeen: new Date('2026-08-26T05:58:00+08:00'), currentZoneId: 'zone-c' },
		{ id: 'G-1087', name: 'Ronaldo', email: 'ronaldo@mg.com', rank: 'Sgt', companyId: 'company-2nd-guard', clearance: 'level_3', status: 'active', photoInitials: 'NZ', biometricEnrolled: true, tokenIssued: true, shift: '0600–1400', lastSeen: new Date('2026-08-26T06:02:00+08:00'), currentZoneId: 'zone-b' },
		{ id: 'G-1103', name: 'Messi', email: 'messi@mg.com', rank: 'Pte', companyId: 'company-2nd-guard', clearance: 'level_2', status: 'active', photoInitials: 'FD', biometricEnrolled: true, tokenIssued: true, shift: '1400–2200', lastSeen: new Date('2026-08-25T21:40:00+08:00'), currentZoneId: null },
		{ id: 'G-1119', name: 'D.Johnson', email: 'd.johnson@mg.com', rank: 'Cpl', companyId: 'company-1st-guard', clearance: 'level_2', status: 'active', photoInitials: 'SK', biometricEnrolled: true, tokenIssued: true, shift: '2200–0600', lastSeen: new Date('2026-08-25T22:05:00+08:00'), currentZoneId: null },
		{ id: 'G-1155', name: 'Tony Stark', email: 'tony.stark@mg.com', rank: 'Pte', companyId: 'company-1st-guard', clearance: 'level_1', status: 'off_duty', photoInitials: 'WJ', biometricEnrolled: true, tokenIssued: true, shift: '0600–1400', lastSeen: new Date('2026-08-24T14:10:00+08:00'), currentZoneId: null },
		{ id: 'G-1176', name: 'Vijay', email: 'vijay@mg.com', rank: 'Sgt', companyId: 'company-3rd-guard', clearance: 'level_3', status: 'suspended', photoInitials: 'NA', biometricEnrolled: false, tokenIssued: false, shift: 'Unassigned', lastSeen: new Date('2026-08-18T09:12:00+08:00'), currentZoneId: null }
	]);

	// Open zone sessions matching the two guards shown "currently inside" on the frontend
	await db.insert(zoneSessions).values([
		{ id: 'ZS-seed-1', zoneId: 'zone-c', guardId: 'G-1042', enteredAt: new Date('2026-08-26T06:00:32+08:00'), exitedAt: null, method: 'facial' },
		{ id: 'ZS-seed-2', zoneId: 'zone-b', guardId: 'G-1087', enteredAt: new Date('2026-08-26T06:02:11+08:00'), exitedAt: null, method: 'qr' }
	]);
	await db.update(zones).set({ status: 'occupied' }).where(inArray(zones.id, ['zone-b', 'zone-c']));

	// -------------------------------------------------------------------
	// Firearms + maintenance history
	// -------------------------------------------------------------------

	await db.insert(firearms).values([
		{ id: 'F-0001', serial: 'MDA-HK416-00231', rfidTag: 'RF-A1F2C9', model: 'HK416 A5', caliber: '5.56×45mm', rack: 'Rack A', slot: 'A-01', status: 'checked_out', holderId: 'G-1042', checkedOutAt: new Date('2026-08-26T06:01:00+08:00'), tagHealth: 'ok' },
		{ id: 'F-0002', serial: 'MDA-HK416-00232', rfidTag: 'RF-B77E10', model: 'HK416 A5', caliber: '5.56×45mm', rack: 'Rack A', slot: 'A-02', status: 'in_armory', tagHealth: 'ok' },
		{ id: 'F-0003', serial: 'MDA-GLK19-00874', rfidTag: 'RF-C0913A', model: 'Glock 19 Gen5', caliber: '9×19mm', rack: 'Rack B', slot: 'B-04', status: 'in_armory', tagHealth: 'weak' },
		{ id: 'F-0004', serial: 'MDA-GLK19-00875', rfidTag: 'RF-D442FF', model: 'Glock 19 Gen5', caliber: '9×19mm', rack: 'Rack B', slot: 'B-05', status: 'maintenance', tagHealth: 'ok' },
		{ id: 'F-0005', serial: 'MDA-MP5-00119', rfidTag: 'RF-E51B02', model: 'MP5A5', caliber: '9×19mm', rack: 'Rack C', slot: 'C-02', status: 'in_armory', tagHealth: 'ok' },
		{ id: 'F-0006', serial: 'MDA-HK416-00240', rfidTag: 'RF-F09A77', model: 'HK416 A5', caliber: '5.56×45mm', rack: 'Rack A', slot: 'A-03', status: 'in_armory', tagHealth: 'tamper' }
	]);

	await db.insert(maintenanceRecords).values([
		{ id: 'M-1', firearmId: 'F-0001', date: new Date('2026-07-02T00:00:00+08:00'), armorerId: 'U-003', work: 'Bore inspection, barrel cleaning', nextDue: new Date('2026-10-02T00:00:00+08:00'), status: 'completed', completedAt: new Date('2026-07-02T00:00:00+08:00') },
		{ id: 'M-2', firearmId: 'F-0002', date: new Date('2026-06-14T00:00:00+08:00'), armorerId: 'U-003', work: 'Firing pin replacement', nextDue: new Date('2026-09-14T00:00:00+08:00'), status: 'completed', completedAt: new Date('2026-06-14T00:00:00+08:00') },
		{ id: 'M-3', firearmId: 'F-0003', date: new Date('2026-05-20T00:00:00+08:00'), armorerId: 'U-004', work: 'Recoil spring service', nextDue: new Date('2026-08-20T00:00:00+08:00'), status: 'completed', completedAt: new Date('2026-05-20T00:00:00+08:00') },
		{ id: 'M-4', firearmId: 'F-0004', date: new Date('2026-08-24T00:00:00+08:00'), armorerId: 'U-004', assignedByUserId: 'U-002', work: 'Trigger group inspection after malfunction report', nextDue: new Date('2026-11-24T00:00:00+08:00'), status: 'assigned' },
		{ id: 'M-5', firearmId: 'F-0005', date: new Date('2026-04-11T00:00:00+08:00'), armorerId: 'U-003', work: 'Full strip and clean', nextDue: new Date('2026-07-11T00:00:00+08:00'), status: 'completed', completedAt: new Date('2026-04-11T00:00:00+08:00') },
		{ id: 'M-6', firearmId: 'F-0006', date: new Date('2026-03-30T00:00:00+08:00'), armorerId: 'U-004', work: 'Rail tightened, sight zeroed', nextDue: new Date('2026-06-30T00:00:00+08:00'), status: 'completed', completedAt: new Date('2026-03-30T00:00:00+08:00') }
	]);

	// -------------------------------------------------------------------
	// Access requests — the apply/approve workflow for armory entry and
	// firearm assignment. A mix of approved (matching the state above) and
	// one still pending, to demo the admin approval step.
	// -------------------------------------------------------------------

	await db.insert(accessRequests).values([
		{
			id: 'AR-0001',
			type: 'zone_access',
			guardId: 'G-1042',
			zoneId: 'zone-c',
			status: 'approved',
			requestedByUserId: 'U-002',
			requestedAt: new Date('2026-08-20T08:00:00+08:00'),
			decidedByUserId: 'U-001',
			decidedAt: new Date('2026-08-20T09:00:00+08:00'),
			notes: 'Standing armory access for 2nd Guard Company duty rotation.'
		},
		{
			id: 'AR-0002',
			type: 'firearm_assignment',
			guardId: 'G-1042',
			firearmId: 'F-0001',
			status: 'approved',
			requestedByUserId: 'U-002',
			requestedAt: new Date('2026-08-20T08:05:00+08:00'),
			decidedByUserId: 'U-001',
			decidedAt: new Date('2026-08-20T09:01:00+08:00')
		},
		{
			id: 'AR-0003',
			type: 'firearm_assignment',
			guardId: 'G-1103',
			firearmId: 'F-0004',
			status: 'approved',
			requestedByUserId: 'U-002',
			requestedAt: new Date('2026-08-15T08:00:00+08:00'),
			decidedByUserId: 'U-001',
			decidedAt: new Date('2026-08-15T10:00:00+08:00')
		},
		{
			id: 'AR-0004',
			type: 'firearm_assignment',
			guardId: 'G-1119',
			firearmId: 'F-0005',
			status: 'pending',
			requestedByUserId: 'U-002',
			requestedAt: new Date('2026-08-26T07:30:00+08:00'),
			notes: 'Requested for upcoming perimeter patrol shift.'
		},
		{
			id: 'AR-0005',
			type: 'zone_access',
			guardId: 'G-1155',
			zoneId: 'zone-c',
			status: 'pending',
			requestedByUserId: 'U-002',
			requestedAt: new Date('2026-08-25T14:00:00+08:00')
		}
	]);

	// -------------------------------------------------------------------
	// Audit trail — inserted oldest-first so the hash chain is genuine,
	// not just backfilled with matching mock strings.
	// -------------------------------------------------------------------

	const auditSeed = [
		{ id: 'E-90222', type: 'admin_action', severity: 'info', timestamp: '2026-08-20T09:00:00+08:00', actorName: 'Puan Aisyah Nordin', actorUserId: 'U-005', zoneId: null, firearmId: null, detail: 'Exported audit log (2026-08-01 – 2026-08-20) for quarterly review' },
		{ id: 'E-90223', type: 'override', severity: 'critical', timestamp: '2026-08-22T03:12:00+08:00', actorName: 'Capt. Siti Rahmah', actorUserId: 'U-002', zoneId: 'zone-a', firearmId: null, detail: 'Manual door override — outer door reader RD-01 offline, supervisor key used' },
		{ id: 'E-90224', type: 'maintenance', severity: 'info', timestamp: '2026-08-24T09:15:00+08:00', actorName: 'Sgt Halim Mokhtar', actorUserId: 'U-004', zoneId: 'zone-c', firearmId: 'F-0004', detail: 'Trigger group inspection logged for F-0004 after malfunction report' },
		{ id: 'E-90225', type: 'firearm_returned', severity: 'info', timestamp: '2026-08-25T21:40:02+08:00', actorName: 'Pte Farid Danial Osman', actorGuardId: 'G-1103', zoneId: 'zone-c', firearmId: 'F-0004', detail: 'Glock 19 Gen5 (RF-D442FF, F-0004) returned to Rack B-05' },
		{ id: 'E-90226', type: 'facial_fail', severity: 'warning', timestamp: '2026-08-25T21:38:44+08:00', actorName: 'Unidentified', zoneId: 'zone-b', firearmId: null, detail: 'Facial match failed (2nd attempt), 41% confidence — CAM-02' },
		{ id: 'E-90227', type: 'alert', severity: 'warning', timestamp: '2026-08-25T22:14:03+08:00', actorName: 'System', zoneId: 'zone-c', firearmId: 'F-0006', detail: 'RFID tag RF-F09A77 (F-0006) reporting weak/tamper signal on rack read' },
		{ id: 'E-90228', type: 'qr_scan', severity: 'info', timestamp: '2026-08-26T06:02:11+08:00', actorName: 'Sgt Nur Izzati Zulkifli', actorGuardId: 'G-1087', zoneId: 'zone-a', firearmId: null, detail: 'QR token verified at outer door reader (RD-01)' },
		{ id: 'E-90229', type: 'qr_scan', severity: 'info', timestamp: '2026-08-26T05:59:58+08:00', actorName: 'Cpl Aiman Hakim Rosli', actorGuardId: 'G-1042', zoneId: 'zone-a', firearmId: null, detail: 'QR token verified at outer door reader (RD-01)' },
		{ id: 'E-90230', type: 'facial_match', severity: 'info', timestamp: '2026-08-26T06:00:32+08:00', actorName: 'Cpl Aiman Hakim Rosli', actorGuardId: 'G-1042', zoneId: 'zone-b', firearmId: null, detail: 'Facial match confirmed, 98.7% confidence — CAM-02' },
		{ id: 'E-90231', type: 'firearm_taken', severity: 'info', timestamp: '2026-08-26T06:01:00+08:00', actorName: 'Cpl Aiman Hakim Rosli', actorGuardId: 'G-1042', zoneId: 'zone-c', firearmId: 'F-0001', detail: 'HK416 A5 (RF-A1F2C9, F-0001) removed from Rack A-01' }
	] as const;

	let prevHash: string | null = null;
	for (const e of auditSeed) {
		const timestamp = new Date(e.timestamp);
		const hash = computeAuditHash({
			id: e.id,
			type: e.type,
			severity: e.severity,
			timestamp: timestamp.toISOString(),
			actorName: e.actorName,
			zoneId: e.zoneId,
			firearmId: e.firearmId,
			detail: e.detail,
			prevHash
		});
		await db.insert(auditEvents).values({
			id: e.id,
			type: e.type,
			severity: e.severity,
			timestamp,
			actorName: e.actorName,
			actorGuardId: 'actorGuardId' in e ? e.actorGuardId : null,
			actorUserId: 'actorUserId' in e ? e.actorUserId : null,
			zoneId: e.zoneId,
			firearmId: e.firearmId,
			detail: e.detail,
			hash,
			prevHash
		});
		prevHash = hash;
	}

	console.log('Seed complete.');

	console.log('Access requests seeded: AR-0001..AR-0003 approved, AR-0004/AR-0005 pending —');
	console.log('try POST /api/access-requests/AR-0004/approve as admin to see it unlock a checkout.');
}

seed()
	.catch((err) => {
		console.error('Seed failed:', err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await pool.end();
	});
