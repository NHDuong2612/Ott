# Vercel hosting

Official tournaments now work on Vercel with the local Docker judge. Follow [Vercel + Docker judge setup](VERCEL_JUDGE.md) for JUDGE_TOKEN, administration, operation and current limits.

Production URL: **https://oan-tu-ti-ai-arena.vercel.app** (project `oan-tu-ti-ai-arena`, team `nguyenlean17s-projects`, alias `oan-tu-ti-arena`). Deployment protection (SSO) is disabled so the URL is publicly reachable; the app's own email/password login is the only gate. Toggle it with `vercel project protection enable --sso`.

Vercel runs the shared UI and game routes as a Next.js app. The Next build aliases `lib/platform.ts` and `lib/auth-platform.ts` to the Vercel adapters. Sites retains its Cloudflare adapter; Docker uses native Next.js behind its gateway and a separate SQLite volume. Vercel accounts, bots, matches, registrations and friend rooms persist in Neon Postgres; user identity comes only from a verified HttpOnly session cookie, never incoming user headers.

The `oan-tu-ti-ai-arena` project uses the owner's Vercel Hobby account. Provision a **Neon Free (`free_v3`)** database in Singapore and connect its `DATABASE_URL` to production/development. Neon managed auth is disabled because the app already implements its own email/password accounts. Preview deployments need a separate database connection before building; they do not silently share production data.

```sh
vercel link
vercel env pull .env.vercel.local --environment development
node --env-file=.env.vercel.local scripts/migrate-vercel.mjs
npm run build:vercel
npm run start:vercel -- --port 3001
```

`vercel.json` selects Next.js, Singapore functions, and `npm run build:vercel`. That build applies the idempotent SQL schema inside a transaction, preserving existing records, then builds Next. No plaintext passwords, database URLs, session tokens, or local environment files belong in Git or deployment uploads.

The Next build must use `--webpack`: the Vercel adapters are selected by the `webpack` module-replacement rules in `next.config.ts`, so a Turbopack build would compile the Cloudflare `cloudflare:workers` default instead. Deploy with `vercel deploy --prod --yes`.

When running the Vercel CLI from a restricted agent shell, point its XDG directories at a writable copy of the CLI login and set `VERCEL=1` to skip the update-check worker:

```sh
XDG_DATA_HOME=$PWD/.vercel-global/xdg.data XDG_CONFIG_HOME=$PWD/.vercel-global/xdg.config \
XDG_CACHE_HOME=$PWD/.vercel-global/xdg.cache XDG_STATE_HOME=$PWD/.vercel-global/xdg.state \
VERCEL=1 vercel <command>
```

`.vercel-global/` is git-ignored and Vercel-ignored because it holds credentials.

Registration/login/logout reuse the Docker forms and password policy. Passwords use salted scrypt; only session-token hashes are stored. All mutations check the same origin, authentication forms also use CSRF tokens, and rate limits are incremented atomically in Postgres so concurrent serverless instances cannot bypass them. HTTPS sessions have Secure, HttpOnly and SameSite=Lax cookies. Sessions expire in seven days and logout revokes the current token in the database. This release has no email verification or password recovery.

New accounts never become organizers automatically. The database owner may grant a registered account permission to claim organizer setup:

```sh
node --env-file=.env.vercel.local scripts/vercel-admin.mjs your@email.com
```

For the official tournament workspace, open **/competition → Ban tổ chức** directly. The legacy practice area retains its own organizer setup. Existing organizer ownership is preserved. Do not expose a public setup token or put an administrator password in the repository.

The Docker volume and ChatGPT Sites database are independent from this new deployment. This setup does not copy or publish their existing users or records.

Checks: `npm test`, `npm run test:postgres`, `npm run test:bots`. The login integration checks can target a local Next server with `OTT_DOCKER_URL=http://localhost:3001 node tests/docker.test.mjs`. To explicitly test a newly deployed Vercel site, use `OTT_ALLOW_VERCEL_TESTS=1` and set `OTT_DOCKER_URL` to its exact HTTPS URL. Those tests create labeled QA accounts and game records; use an empty test deployment before public usage.

References: [Vercel persistent storage guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [Neon serverless driver](https://github.com/neondatabase/serverless), [Vercel database provisioning](https://vercel.com/docs/cli/integration).
