// Backend server URL configuration.
// - In local dev (or fullstack single-domain deploy): leave VITE_BACKEND_URL empty/unset.
// - In separate hosting (e.g. Vercel frontend + Render backend): set VITE_BACKEND_URL to your backend URL.
export const BACKEND_URL: string = (
  (import.meta.env.VITE_BACKEND_URL as string | undefined) || ''
).replace(/\/$/, '');
