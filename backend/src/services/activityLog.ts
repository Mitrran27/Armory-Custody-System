import { activityLogs } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import type { DbClient, Tx } from '../db/index.js';

type DbOrTx = DbClient | Tx;

export interface CreateActivityLogInput {
	eventType: (typeof activityLogs.$inferInsert)['eventType'];
	personName: string;
	guardId?: string | null;
	systemUserId?: string | null;
	zoneId?: string | null;
	firearmId?: string | null;
	detail: string;
	imageUrl?: string | null;
}

export async function createActivityLog(db: DbOrTx, input: CreateActivityLogInput) {
	const [row] = await db
		.insert(activityLogs)
		.values({
			id: genId('AL'),
			eventType: input.eventType,
			personName: input.personName,
			guardId: input.guardId ?? null,
			systemUserId: input.systemUserId ?? null,
			zoneId: input.zoneId ?? null,
			firearmId: input.firearmId ?? null,
			detail: input.detail,
			imageUrl: input.imageUrl ?? null
		})
		.returning();
	return row;
}
