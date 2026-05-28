/** Origins allowed for browser + Socket.io (comma-separated in CORS_ORIGINS or FRONTEND_URL). */
export function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

const vercelFrontend =
  /^https:\/\/veda-ai-frontend(-[a-z0-9-]+)?\.vercel\.app$/i;

/** Vercel preview URLs: veda-ai-frontend-git-*-*.vercel.app */
const vercelPreview =
  /^https:\/\/veda-ai-frontend-git-[a-z0-9-]+-[a-z0-9-]+\.vercel\.app$/i;

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (getAllowedOrigins().includes(origin)) return true;
  if (vercelFrontend.test(origin)) return true;
  if (vercelPreview.test(origin)) return true;
  return false;
}
