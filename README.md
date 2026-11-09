# SurShongi (সুরসঙ্গী)

A collaboration platform for musicians in Bangladesh. Phase 0 is the app shell: Bangla-first layout, the dark studio design system, and the landing page.

## Requirements

- Node.js 22+
- npm

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, copy the env file with:

```powershell
Copy-Item .env.example .env.local
```

Open [http://localhost:3000](http://localhost:3000). Bangla is the default. English is at [http://localhost:3000/en](http://localhost:3000/en).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Environment

See `.env.example`.

| Variable | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical and Open Graph URLs |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase, from Phase 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key, from Phase 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key. Never expose it to the browser |

No database is connected in this phase. Do not put real secrets in `.env.example`.

## Languages

- `/` — Bangla (বাংলা), the default
- `/en` — English

The visitor's browser language does not switch the site. The header toggle does.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, next-intl, Framer Motion. Supabase arrives with authentication in the next phase.
