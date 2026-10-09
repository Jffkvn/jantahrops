// Where JantaHR Ops is hosted, for "Open in Ops" links in team emails.
// Set the OPS_URL secret (e.g. https://ops.jantahr.com). Unset = no links.

const RAW = (Deno.env.get('OPS_URL') ?? '').trim().replace(/\/+$/, '');

export const OPS_URL: string | null = /^https:\/\//.test(RAW) ? RAW : null;

/** A path inside Ops ("/leads?lead=…"), or null when Ops isn't hosted. */
export function opsLink(path: string): string | null {
  return OPS_URL ? `${OPS_URL}${path}` : null;
}
