import { guardApiFetch } from './guardClient';
import { mapAccessRequest } from './mappers';
import type { AccessRequest, ActivityLog } from '$lib/types';

export const guardSelfApi = {
	listMyAccessRequests: async (): Promise<AccessRequest[]> => (await guardApiFetch<any[]>('/api/guard/access-requests')).map(mapAccessRequest),
	applyForArmory: async (): Promise<AccessRequest> => mapAccessRequest(await guardApiFetch<any>('/api/guard/apply-armory', { method: 'POST' })),
	issueMyQrToken: async (doorId = 'DOOR-01') =>
		guardApiFetch<{ code: string; doorId: string; expiresAt: string; ttlSeconds: number }>('/api/guard/qr-token', {
			method: 'POST',
			body: { doorId }
		}),
	clockIn: async (imageDataUrl?: string) => guardApiFetch<ActivityLog>('/api/guard/clock-in', { method: 'POST', body: { imageDataUrl } }),
	clockOut: async (imageDataUrl?: string) => guardApiFetch<ActivityLog>('/api/guard/clock-out', { method: 'POST', body: { imageDataUrl } }),
	myActivityLogs: async (): Promise<ActivityLog[]> => guardApiFetch<ActivityLog[]>('/api/guard/activity-logs')
};
