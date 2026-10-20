# Cord

Cord is a real-time chat and community platform built with Next.js, Prisma, PostgreSQL, Socket.IO, and a premium dark interface inspired by the product mockups.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (recommended for PostgreSQL + Redis)
- PostgreSQL 16 (if not using Docker)

## Windows quick start

Open PowerShell in the project folder and run:

```powershell
cd C:\Users\Chiro\Desktop\Cord
npm install
Copy-Item .env.example .env.local
docker compose up -d postgres redis
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Then open:

- http://localhost:3000

## Environment variables

Set the values in `.env.local` before starting the app.

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_SECRET=replace-with-a-very-long-random-secret-32-chars
DATABASE_URL=postgresql://cord:cord@localhost:5432/cord?schema=public
EMAIL_FROM="Cord <noreply@localhost>"
RESEND_API_KEY=
```

`prisma:seed` requires `DEMO_EMAIL`, `DEMO_USERNAME`, and `DEMO_PASSWORD` in `.env.local`. Set a unique, strong password of at least 12 characters; do not use the example placeholder in production.

## Deploy to Render with Supabase

1. Push this repository to GitHub and connect `roroc858-dev/Cord` to Render as a Blueprint.
2. The included `render.yaml` selects the Singapore region and runs Prisma migrations before starting the app.
3. In Render, set `DATABASE_URL` to the Supabase connection-pooler URI and `DIRECT_URL` to the direct/session URI. Use the formats in `.env.example`, replacing the project host and password with your Supabase values.
4. Set `EMAIL_FROM` and `RESEND_API_KEY` to an authorized Resend sender. Render generates `AUTH_SECRET`.
5. Deploy. To create a demo login, set `DEMO_EMAIL`, `DEMO_USERNAME`, and a unique `DEMO_PASSWORD` (at least 12 characters) in Render, then run `npm run prisma:seed` once in a Render shell. The seed marks the demo account email as verified.

Never commit `.env.local` or paste database credentials into GitHub. The `.env.example` file contains placeholders only.

## Important notes

- Registration, login, and authenticated app routes are implemented with secure server-side validation and a session cookie.
- The app is ready for a real Prisma/PostgreSQL backend. Without a database, the registration and auth routes will return a runtime error until the database is available.
- Voice and video calls require a TURN/STUN provider and a Socket.IO signalling layer.
- A production deployment should use HTTPS, a managed database, Redis, real object storage, and email delivery configured through the environment.

## Scripts

```powershell
npm run dev
npm run build
npm run start
npm run lint
npm test
npx prisma migrate dev
npx prisma studio
```

## Architecture overview

- `app/` contains the landing page, login, registration, and authenticated app shell.
- `components/` contains reusable UI pieces like the Cord mark.
- `lib/` contains validation, authentication helpers, Prisma access, and request utilities.
- `prisma/` contains the Prisma schema and seed data.
- `docker-compose.yml` provides a local PostgreSQL + Redis development stack.

## Production build

```powershell
npm run build
npm run start
```

For production, configure real credentials for email, object storage, and TURN/STUN before exposing the service to the internet.
