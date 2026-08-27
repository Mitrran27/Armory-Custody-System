import { customAlphabet } from 'nanoid';

// Uppercase + digits, no ambiguous characters (0/O, 1/I) — easy to read on a screen or radio.
const nano = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6);

/** e.g. genId('G') -> 'G-4F7K2A' */
export function genId(prefix: string): string {
	return `${prefix}-${nano()}`;
}
