# Hosting JantaHR Ops

Ops is a static single-page app hosted on **Cloudflare Pages** (migrated from
Netlify on 19 November 2026), built from `main` of `Jffkvn/jantahrops`. All
data stays in Supabase (`qjsgqskigjqrzjftunhg`), protected by login and
row-level security.

- **Cloudflare Pages project:** `jantahr-ops` (`https://jantahr-ops.pages.dev`)
- **Custom domain:** `https://ops.jantahr.com` (CNAME `ops` → `jantahr-ops.pages.dev` in cPanel Zone Editor; main site `jantahr.com` / `www.jantahr.com` remains untouched on Netlify)
- **Active Cloudflare config:** `public/_headers`, `functions/_middleware.ts`, and `CF_PAGES !== '1'` sourcemap guard in `vite.config.ts`
- **Branch control:** Production branch `main` enabled; Preview branch deployments set to **None** (only `main` builds)
- **Legacy config files:** `netlify.toml`, `netlify/edge-functions/country-gate.ts`, and `vercel.json` remain in the repo for reference; `netlify/lib/country-gate-rules.ts` is actively shared by `functions/_middleware.ts`.

## Before anything is public

- **Public sign-up is OFF** in Supabase (Authentication → Sign In / Providers →
  "Allow new users to sign up"). This must stay off: any signed-in account can
  read every record. Add team members from Supabase → Authentication → Users →
  Invite user, then set their role in Ops → Settings → Team.
- Source maps are not published on hosted builds (`NETLIFY=true`, `VERCEL=1`,
  and `CF_PAGES=1` are guarded in `vite.config.ts`).
- Search engines are told not to index (`X-Robots-Tag`, `robots.txt`).

## Cloudflare Pages settings

Build configuration (Workers & Pages → `jantahr-ops` → Settings → Build):

- **Production branch:** `main` (Preview branch: **None**)
- **Build command:** `npm run build`
- **Build output directory:** `dist`

Environment variables (Settings → Variables and Secrets → Production):

| Name                     | Value                                            |
| ------------------------ | ------------------------------------------------ |
| `NODE_VERSION`           | `22`                                             |
| `VITE_APP_ENV`           | `production`                                     |
| `VITE_SUPABASE_URL`      | `https://qjsgqskigjqrzjftunhg.supabase.co`       |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key     |
| `VITE_APP_URL`           | The live address, `https://ops.jantahr.com`      |
| `OPS_ALLOWED_COUNTRIES`  | `UG` (comma-separated ISO codes, default `UG`)   |

Custom domain `ops.jantahr.com`: added under Cloudflare Pages → `jantahr-ops` →
Custom domains (My DNS provider / CNAME setup), with cPanel → Zone Editor CNAME
`ops.jantahr.com.` pointing to `jantahr-ops.pages.dev`. Cloudflare issues the
HTTPS certificate automatically once verified. Remove `ops.jantahr.com` from
the old Netlify site only after Cloudflare shows **Active**.

## Supabase settings

Authentication → URL Configuration:

- Site URL: the live address (`https://ops.jantahr.com`).
- Redirect URLs: `https://ops.jantahr.com/**` and `http://localhost:5180/**`
  (password-reset links go to `/reset-password`).

Edge-function secret `OPS_URL` = the live address. It turns on the
"Open in JantaHR Ops" buttons in team alerts and the morning digest.

## Security headers

`public/_headers` (copied to `dist/_headers` on build) sets the same
Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`,
`X-Robots-Tag: noindex, nofollow`, and 1-year `/assets/*` cache header that
`netlify.toml` previously enforced. The one inline script (the theme snippet in
`index.html`) is allowed by its hash. If you edit that snippet, recompute the
hash and update `public/_headers` (and `netlify.toml` / `vercel.json` if kept):

```bash
npm run build && python3 -c "import re,hashlib,base64;h=open('dist/index.html').read();[print('sha256-'+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()) for s in re.findall(r'<script>(.*?)</script>',h,re.S)]"
```

## Uganda only

`functions/_middleware.ts` runs at Cloudflare's edge before every request on
every domain of the Pages project (`ops.jantahr.com` and `*.jantahr-ops.pages.dev`).
Visitors whose connection geolocates outside `OPS_ALLOWED_COUNTRIES` (or whose
location cannot be determined) get a bare `404 Not found`, so nothing shows that
Ops exists.

- Allowed countries: Cloudflare Pages environment variable
  `OPS_ALLOWED_COUNTRIES`, comma-separated ISO codes, default `UG`. To let
  someone work from Kenya, set `UG,KE` and redeploy.
- This is an extra layer, not the lock. Data is protected by Supabase logins,
  disabled sign-up and row-level security. A VPN exiting in Uganda gets through.
- The shared pure rule lives in `netlify/lib/country-gate-rules.ts` with its
  test (`deno test netlify/lib/`).
