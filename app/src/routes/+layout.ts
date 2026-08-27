// This app authenticates entirely client-side (JWT in localStorage, set by
// the OTP login flow). There's no session available during server-side
// rendering, so every route here is rendered client-side only — a
// deliberate choice for an internal, always-logged-in ops dashboard, not an
// oversight. If this app later needs SSR (e.g. for SEO on a public page),
// that page can override this per-route.
export const ssr = false;
