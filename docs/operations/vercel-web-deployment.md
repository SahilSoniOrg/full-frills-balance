# Vercel Web Deployment & Subdomain Configuration

This document describes the web deployment architecture, GoDaddy DNS routing, Vercel project configuration, and maintenance workflows for **Full Frills Balance** on the web.

---

## 1. Overview

- **Live URL:** [https://fullfrillsapp.sahilsoni.in](https://fullfrillsapp.sahilsoni.in)
- **Deployment Platform:** [Vercel](https://vercel.com)
- **Vercel Project:** `full-frills-balance` (`prj_leHXy6R2otAvPe5iUxgnINVRQu6T`)
- **DNS Registrar:** GoDaddy (`sahilsoni.in`)
- **Build Output:** Static Single Page Application (SPA) exported via Expo Web Metro bundler.

---

## 2. DNS Infrastructure & Routing

The root domain `sahilsoni.in` is registered and hosted on GoDaddy with authoritative nameservers:

- `ns41.domaincontrol.com`
- `ns42.domaincontrol.com`

### CNAME Record

To route web traffic for `fullfrillsapp.sahilsoni.in` to Vercel's global edge network, a CNAME record was added in GoDaddy DNS:

| Type  | Name / Host     | Value / Destination    | TTL      |
| ----- | --------------- | ---------------------- | -------- |
| CNAME | `fullfrillsapp` | `cname.vercel-dns.com` | 1/2 Hour |

### DNS Verification

Verify the CNAME resolution:

```bash
dig @8.8.8.8 fullfrillsapp.sahilsoni.in CNAME +short
# Output: cname.vercel-dns.com.
```

And edge routing:

```bash
dig @8.8.8.8 fullfrillsapp.sahilsoni.in +short
# Output:
# cname.vercel-dns.com.
# 76.76.21.93
# 66.33.60.194
```

---

## 3. Vercel Configuration

### `vercel.json`

The [`vercel.json`](../../vercel.json) file at the project root manages the build command, output directory, and client-side SPA routing:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npx expo export --platform web",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

> **Note on SPA Rewrites:** Do not enable `"cleanUrls": true` alongside SPA rewrites (`"source": "/(.*)", "destination": "/index.html"`), as clean URLs strip `.html` and can create redirect loops or 404s when attempting to serve `index.html` for deep routes.

### `package.json`

An explicit script was added for web builds:

```json
"build:web": "expo export --platform web"
```

---

## 4. Environment Variables

The project requires several runtime and build-time environment variables configured under the **Production** environment in Vercel:

| Variable                                              | Description                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `EXPO_PUBLIC_BUILD_TYPE`                              | Set to `production`.                                             |
| `EXPO_PUBLIC_POSTHOG_API_KEY`                         | PostHog telemetry API key.                                       |
| `EXPO_PUBLIC_POSTHOG_HOST`                            | PostHog telemetry ingest host (`https://eu.i.posthog.com`).      |
| `EXPO_PUBLIC_SENTRY_DSN`                              | Sentry error reporting ingest DSN.                               |
| `EXPO_PUBLIC_SENTRY_AUTH_TOKEN` / `SENTRY_AUTH_TOKEN` | Sentry CLI auth token.                                           |
| `EXPO_PUBLIC_HF_TOKEN`                                | Hugging Face inference token for receipt/categorization parsing. |
| `EXPO_PUBLIC_SUPABASE_URL`                            | Production Supabase database endpoint URL.                       |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`                       | Production Supabase anonymous client key.                        |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`                    | Google OAuth Client ID for web clients.                          |

Pulling or updating environment variables locally:

```bash
# Pull production environment variables
vercel pull --yes --environment=production

# Add or update a variable
vercel env add <VARIABLE_NAME> production
```

---

## 5. Deployment Procedures

### Automated Git Deployments

The Vercel project is linked to the GitHub repository:

- `main` branch pushes automatically trigger a production build and deployment to `https://fullfrillsapp.sahilsoni.in`.
- Feature branches create preview deployments on unique preview URLs.

### Manual CLI Deployment

To build and deploy from the local development environment:

```bash
# 1. Pull latest project settings and production env vars
vercel pull --yes --environment=production

# 2. Build the static bundle using Vercel CLI
vercel build --prod

# 3. Deploy the prebuilt bundle to production
vercel deploy --prebuilt --prod
```

---

## 6. Verifying Deployment Health

After deploying, verify the endpoint returns HTTP/2 200 OK:

```bash
curl -ILs https://fullfrillsapp.sahilsoni.in/ | grep -E '^HTTP|^server:|^content-type:|^x-vercel'
```

Expected output:

```text
HTTP/2 200
content-type: text/html; charset=utf-8
server: Vercel
```
