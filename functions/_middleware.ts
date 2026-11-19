// JantaHR Ops is only reachable from Uganda (Cloudflare Pages middleware).
//
// Runs at Cloudflare's edge before every request on every domain of the Pages
// project (ops.jantahr.com and *.jantahr-ops.pages.dev). Visitors whose
// connection geolocates outside OPS_ALLOWED_COUNTRIES (default "UG") — or whose
// location cannot be determined — receive a bare 404 so nothing reveals Ops.
//
// Allowed countries: Cloudflare Pages env var OPS_ALLOWED_COUNTRIES,
// comma-separated ISO codes (default "UG").

import { decide } from '../netlify/lib/country-gate-rules';

interface PagesEnv {
  OPS_ALLOWED_COUNTRIES?: string;
}

interface PagesContext {
  request: Request & { cf?: { country?: string } };
  env: PagesEnv;
  next: () => Promise<Response>;
}

export const onRequest = (context: PagesContext): Response | Promise<Response> => {
  const allowed = context.env.OPS_ALLOWED_COUNTRIES ?? 'UG';
  const country = context.request.cf?.country;
  if (decide(country, allowed) === 'allow') {
    return context.next();
  }
  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};
