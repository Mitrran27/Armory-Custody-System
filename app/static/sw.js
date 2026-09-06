const CACHE_NAME = 'aawcs-shell-v1';
const SHELL_ASSETS = [
	'/portal-armorer',
	'/portal-armorer/login',
	'/portal-guard',
	'/portal-guard/login',
	'/manifest-armorer.webmanifest',
	'/manifest-guard.webmanifest'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(SHELL_ASSETS))
			.catch(() => {
				/* best-effort — a slow/offline first install shouldn't fail entirely */
			})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

// Network-first: this app is fundamentally online (live occupancy data, OTP
// login, real-time QR codes) — the service worker exists to make the app
// installable and to give the shell a chance to load if the network blips,
// not to serve stale application data while pretending to be "offline mode."
self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.pathname.startsWith('/api/')) return; // never cache API responses

	event.respondWith(
		fetch(event.request)
			.then((response) => {
				const copy = response.clone();
				caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
				return response;
			})
			.catch(() => caches.match(event.request))
	);
});
