import { getEditionStatus } from '@/lib/db';

// A small "last published" marker, generated at build time. The population
// service reads it after pushing to confirm the live site carries the edition.
export const dynamic = 'force-static';

export function GET() {
  const status = {
    ...getEditionStatus(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    builtAt: new Date().toISOString(),
  };
  return new Response(JSON.stringify(status) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
