// JantaHR Ops is only reachable from Uganda.
//
// Runs on Netlify's edge before every request, on every domain of the site
// (ops.jantahr.com and jantahr-ops.netlify.app). A visitor whose connection
// geolocates outside the allowed countries gets a bare 404, so nothing reveals
// that Ops exists. Unknown locations are refused too.
//
// This is an extra layer, not the security boundary: the data lives in
// Supabase behind logins and row-level security. VPNs can get around it.
//
// Allowed countries: Netlify environment variable OPS_ALLOWED_COUNTRIES,
// comma-separated ISO codes (default "UG"). Add e.g. "UG,KE" when a team
// member travels, then redeploy.

import type { Config, Context } from 'https://edge.netlify.com';
import { decide } from './country-gate-rules.ts';

declare const Netlify: { env: { get(name: string): string | undefined } };

export default (_request: Request, context: Context) => {
  const allowed = Netlify.env.get('OPS_ALLOWED_COUNTRIES') ?? 'UG';
  if (decide(context.geo?.country?.code, allowed) === 'allow') return; // continue to the site
  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};

export const config: Config = { path: '/*' };
