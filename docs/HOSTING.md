# Hosting JantaHR Ops

Ops is a static single-page app on **Netlify**, built from `main` of
`Jffkvn/jantahrops`. All data stays in Supabase, protected by login and
row-level security. Config: `netlify.toml`.

## Before anything is public

- **Public sign-up is OFF** in Supabase (Authentication → Sign In / Providers →
  "Allow new users to sign up"). This must stay off: any signed-in account can
  read every record. Add team members from Supabase → Authentication → Users →
  Invite user, then set their role in Ops → Settings → Team.
- Source maps are not published on Netlify builds (`vite.config.ts`).
- Search engines are told not to index (`X-Robots-Tag`, `robots.txt`).

## Netlify settings

Environment variables (Site configuration → Environment variables):

| Name                     | Value                                            |
| ------------------------ | ------------------------------------------------ |
| `VITE_SUPABASE_URL`      | `https://qjsgqskigjqrzjftunhg.supabase.co`       |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key     |
| `VITE_APP_URL`           | The live address, e.g. `https://ops.jantahr.com` |

`VITE_APP_ENV=production` and Node 22 come from `netlify.toml`.

Custom domain `ops.jantahr.com`: add it in Netlify → Domain management, then in
cPanel → Zone Editor add a CNAME record `ops` pointing at the site's
`*.netlify.app` address. Netlify issues the HTTPS certificate itself.

## Supabase settings

Authentication → URL Configuration:

- Site URL: the live address.
- Redirect URLs: `https://ops.jantahr.com/**` and `http://localhost:5180/**`
  (password-reset links go to `/reset-password`).

Edge-function secret `OPS_URL` = the live address. It turns on the
"Open in JantaHR Ops" buttons in team alerts and the morning digest.

## Security headers

`netlify.toml` sets a Content-Security-Policy that only allows this site and the
Supabase project. The one inline script (the theme snippet in `index.html`) is
allowed by its hash. If you edit that snippet, recompute the hash and update it:

```bash
npm run build && python3 -c "import re,hashlib,base64;h=open('dist/index.html').read();[print('sha256-'+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()) for s in re.findall(r'<script>(.*?)</script>',h,re.S)]"
```
