# UniSphere

**One space for every college community.**
Share projects and ideas, find related work and teammates, join clubs and events, learn from seniors and alumni.

| | |
| --- | --- |
| Stack | Next.js 16 (App Router, JavaScript), Tailwind CSS v4 + shadcn/ui, Supabase (Postgres, Auth, Realtime, RLS), Redis, Cloudflare R2, Resend, LangChain + Groq, Web Push |
| Installable | Progressive Web App (offline screen, install prompt, push notifications) |
| Access | **Open to join, private to view**: anyone can register with an email address (no college, role, ID or college email needed); nothing is visible to logged-out visitors. A college is optional and never counts as verification. Verified badges exist only where a college has shared its own ID list (checked privately, stored only as keyed hashes) |
| Deploys to | Vercel, Render (free plan) or any VPS: see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Admin | Full console: moderation, appeals, college directory (merge, correct, reports), student-ID list, roles, analytics, audit log, settings, feedback, releases |

## Quick start (local development)

You need Node.js 22+ and the Supabase CLI (`npx supabase`). The local Supabase stack runs in Docker Desktop; if you use a hosted Supabase project instead, you do not need Docker at all.

```bash
npm install
cp .env.example .env.local          # then fill in the values (see docs/SETUP.md)

npx supabase start                  # local Postgres, Auth, Realtime, Mailpit (ports 55321-55329)
npx supabase db reset               # applies supabase/migrations and the dev seed
npm run create-admin                # makes a local administrator; credentials go in .env.local as a comment
npm run seed:demo                   # optional: a fictional community for demos and screenshots

npm run dev                         # http://localhost:3000
npm run worker                      # optional second terminal: emails, push, reminders, deletions
```

The full walk-through, including every environment variable, is in [docs/SETUP.md](docs/SETUP.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build and run the production server |
| `npm run lint` | ESLint |
| `npm test` | Unit + database integration tests (Vitest; needs the local Supabase stack) |
| `npm run test:unit` / `test:rls` | Only the unit tests, or only the database (RLS/RBAC) tests |
| `npm run test:e2e` | Playwright end-to-end tests (starts the dev server itself) |
| `npm run worker` | Background loop calling `/api/cron/tick` |
| `npm run create-admin -- you@example.com "Name"` | Create or reset a local global administrator |
| `npm run seed:demo` | Fill a **local** database with a fictional demo community |
| `npm run icons` | Regenerate PWA/app icons from `public/unisphereLogo.png` |
| `npm run screenshots` | Capture store screenshots (needs a production build running) |
| `npm run db:start` / `db:reset` / `db:stop` | Supabase local stack helpers |

## Documentation

| Document | For |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Developers: local setup and every environment variable |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Whoever deploys: production checklist, Vercel/Render/VPS, UptimeRobot jobs, Supabase, DNS, first admin |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Running it: worker, backups, secrets rotation, monitoring, incident playbooks |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | College staff: student-ID list, moderation, appeals, roles, announcements |
| [docs/SECURITY.md](docs/SECURITY.md) | How data and access are protected, and what to review before launch |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit together |
| [docs/EMAIL.md](docs/EMAIL.md) | Resend, sender domain, templates, troubleshooting |
| [docs/AI.md](docs/AI.md) | What the AI features do, their limits and privacy rules |
| [docs/APP_STORES.md](docs/APP_STORES.md) | Google Play / App Store publishing kit |
| [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) | What is built, what is verified, what still needs you |

## Project layout

```
app/                  Routes: (marketing) (auth) (onboarding) (app) (content) (admin)/admin, api/
components/           UI by area (shell, posts, projects, admin, pwa, ...) + shadcn/ui primitives
lib/                  actions/ (Server Actions) · services/ (data access) · ai/ · storage/ · email/ · security/
supabase/             migrations (the source of truth for the database) · templates · seed.sql (dev only)
public/               icons, service worker (sw.js), logo
scripts/              worker, create-admin, seed-demo, generate-icons, capture-store-screenshots
tests/                unit/ · integration/ (real database, real JWTs) · e2e/ (Playwright)
docs/  store/         Documentation · store listing text and screenshots
```

## Principles the code follows

- **The database authorises.** Every table has Row Level Security; privileged actions are `SECURITY DEFINER`
  functions that re-check the caller's permission for the record's own college. The UI only hides what you cannot do.
- **Honest degradation.** Redis, R2, email, AI, push and embeddings are optional. When one is missing the feature says
  so or falls back, rather than pretending to work.
- **Private by default.** Anyone can join, but nothing is public: no public feed, no public profiles, no search-engine
  indexing of member content. Inside the network, visibility is still set per post and per profile, and private content
  never reaches AI providers.
- **No secrets in the browser.** Only `NEXT_PUBLIC_*` values ship to clients, and they are listed in `.env.example`.

## License

Copyright (c) UniSphere. All rights reserved
unless the team chooses to publish it under an open-source licence.
