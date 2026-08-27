import { and, eq, isNull } from 'drizzle-orm';
import { accessRequests } from '../db/schema.js';
import type { DbClient, Tx } from '../db/index.js';

type DbOrTx = DbClient | Tx;

export async function hasApprovedZoneAccess(db: DbOrTx, guardId: string, zoneId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: accessRequests.id })
		.from(accessRequests)
		.where(
			and(
				eq(accessRequests.type, 'zone_access'),
				eq(accessRequests.guardId, guardId),
				eq(accessRequests.zoneId, zoneId),
				eq(accessRequests.status, 'approved'),
				isNull(accessRequests.deletedAt)
			)
		)
		.limit(1);
	return !!row;
}

export async function hasApprovedFirearmAssignment(db: DbOrTx, guardId: string, firearmId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: accessRequests.id })
		.from(accessRequests)
		.where(
			and(
				eq(accessRequests.type, 'firearm_assignment'),
				eq(accessRequests.guardId, guardId),
				eq(accessRequests.firearmId, firearmId),
				eq(accessRequests.status, 'approved'),
				isNull(accessRequests.deletedAt)
			)
		)
		.limit(1);
	return !!row;
}
