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

## Realtime, calls, and uploads

The authenticated workspace supports persisted server messages and direct messages, friend requests, typing indicators, online presence, read receipts, in-app notifications, and image/PDF/text attachments. Messages are delivered live through a separate Socket.IO service, with Redis pub/sub shared by the web API and realtime service.

For local development, start PostgreSQL and Redis, configure `.env.local`, and run the web app and realtime service in separate terminals:

```powershell
npm run dev
npm run realtime:dev
```

Set `REDIS_URL=redis://localhost:6379`, `REALTIME_URL=http://localhost:3001`, and `REALTIME_ALLOWED_ORIGIN=http://localhost:3000`. The realtime service validates short-lived tokens issued by the web API, and also needs the same `AUTH_SECRET` and `DATABASE_URL` as the web app.

Community voice/video rooms use LiveKit. Create a LiveKit Cloud project and set `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`; the API secret must remain server-side. Create a `VOICE` channel in a server to start a room. Calls cannot connect until those values point to a working LiveKit project.

Attachments are uploaded directly to an S3-compatible bucket with short-lived signed URLs. Set `S3_BUCKET_NAME`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and (for S3-compatible providers) `S3_ENDPOINT`. Allow `PUT` from the Cord web origin in the bucket's CORS policy, and allow the `Content-Type` request header. Supported files are JPEG, PNG, GIF, WebP, PDF, and plain text up to 10 MB each. Keep the bucket private; the app issues temporary download URLs only to authenticated conversation members.

For Render, deploy both `cord` and `cord-realtime` from the Blueprint. Set the same `AUTH_SECRET`, database URLs, and `REDIS_URL` on both services. Set `REALTIME_URL` on `cord` to the realtime service HTTPS URL and set `REALTIME_ALLOWED_ORIGIN` on `cord-realtime` to the public Cord web URL. Configure LiveKit and S3 variables on `cord`. The Redis service is managed separately; use a Redis URL reachable from both Render services.

## Deploy to Render with Supabase

1. Push this repository to GitHub and connect `roroc858-dev/Cord` to Render as a Blueprint.
2. The included `render.yaml` selects the Singapore region and runs Prisma migrations before starting the app.
3. In Render, set `DATABASE_URL` to the Supabase connection-pooler URI and `DIRECT_URL` to the direct/session URI. Use the formats in `.env.example`, replacing the project host and password with your Supabase values.
4. Set `EMAIL_FROM` and `RESEND_API_KEY` to an authorized Resend sender. Render generates `AUTH_SECRET`.
5. Deploy. To create a demo login, set `DEMO_EMAIL`, `DEMO_USERNAME`, and a unique `DEMO_PASSWORD` (at least 12 characters) in Render, then run `npm run prisma:seed` once in a Render shell. The seed marks the demo account email as verified.

Never commit `.env.local` or paste database credentials into GitHub. The `.env.example` file contains placeholders only.

## Important notes

- Registration, login, and authenticated app routes are implemented with secure server-side validation and a session cookie.
- The authenticated workspace loads your servers and channels from PostgreSQL, supports creating servers and channels, and stores text messages in the database. Message history loads the latest 100 messages per channel.
- The app requires PostgreSQL for registration, authentication, messages, friendships, and notifications.
- Real-time updates require Redis and the separate Socket.IO service. When they are unavailable, persisted APIs still work, but live delivery and typing indicators will be offline.
- Voice/video calls require a configured LiveKit project. File uploads require private S3-compatible object storage.
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

- `app/` contains the landing page, login, registration, authenticated app shell, and API route handlers.
- `components/` contains reusable UI pieces like the Cord mark and interactive workspace.
- `realtime/` contains the authenticated Socket.IO service for live chat, typing, and presence.
- `lib/` contains validation, authentication helpers, Prisma access, and request utilities.
- `prisma/` contains the Prisma schema and seed data.
- `docker-compose.yml` provides a local PostgreSQL + Redis development stack.

## Production build

```powershell
npm run build
npm run start
```

For production, configure real credentials for email, object storage, and TURN/STUN before exposing the service to the internet.
