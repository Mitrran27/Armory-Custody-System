import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

const EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

/**
 * Accepts a data URL (e.g. "data:image/jpeg;base64,/9j/4AAQ...") captured
 * client-side from a device camera, writes it to disk under `uploads/`, and
 * returns the relative URL path to store on an activity_logs row.
 *
 * Deliberately simple local-disk storage rather than S3/blob storage — this
 * is a local/dev deployment; swapping in real object storage later means
 * changing this one function, not every call site.
 */
export async function saveCapturedImage(dataUrl: string): Promise<string> {
	const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
	if (!match) {
		throw new Error('Expected a base64 image data URL (e.g. "data:image/jpeg;base64,...").');
	}
	const [, mime, base64] = match;
	const ext = EXT_BY_MIME[mime] ?? 'jpg';

	await mkdir(UPLOADS_DIR, { recursive: true });

	const filename = `${new Date().toISOString().slice(0, 10)}-${randomBytes(8).toString('hex')}.${ext}`;
	const filePath = path.join(UPLOADS_DIR, filename);
	await writeFile(filePath, Buffer.from(base64, 'base64'));

	return `/uploads/${filename}`;
}
