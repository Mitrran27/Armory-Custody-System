import { notifications } from '../db/schema.js';
import { genId } from '../utils/ids.js';
import type { DbClient, Tx } from '../db/index.js';

type DbOrTx = DbClient | Tx;

export async function createNotification(
	db: DbOrTx,
	input: {
		recipientRole: string;
		type: (typeof notifications.$inferInsert)['type'];
		title: string;
		body: string;
		relatedAccessRequestId?: string | null;
	}
) {
	const [row] = await db
		.insert(notifications)
		.values({
			id: genId('N'),
			recipientRole: input.recipientRole,
			type: input.type,
			title: input.title,
			body: input.body,
			relatedAccessRequestId: input.relatedAccessRequestId ?? null
		})
		.returning();
	return row;
}
