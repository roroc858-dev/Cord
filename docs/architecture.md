# Cord architecture

Cord is a community chat application with protected user accounts, persisted messaging, and a separate real-time service.

## Core layers

- Frontend: Next.js App Router with React and TypeScript
- Backend: server routes, Prisma queries, and protected auth helpers
- Realtime: Authenticated Socket.IO service for channel/DM delivery, typing indicators, and friend presence
- Persistence: PostgreSQL via Prisma ORM
- Coordination: Redis pub/sub connects the Next.js API to the Socket.IO service and supports multiple realtime workers
- Calls: LiveKit room tokens are issued by authenticated API routes; browsers connect directly to the configured LiveKit project
- Storage: S3-compatible private object storage with short-lived signed upload and download URLs

## Auth and account flow

The app uses a signed session cookie and secure password hashing with bcrypt. The server validates every request and redirects unauthenticated users away from the protected `/app` experience.

## Messaging and social model

Server-channel messages and one-to-one direct messages are stored in PostgreSQL. Friendships gate direct conversations; each conversation member has a read timestamp. Server-channel read states are stored per user and channel. Notifications are persistent records and are also delivered live over Socket.IO.

The realtime endpoint issues short-lived signed JWTs from the web app. The Socket.IO service validates these against the shared `AUTH_SECRET` and checks server/channel or conversation membership before joining private rooms. Redis is required for event publishing across the web and realtime processes.

## External services

Voice/video media requires a LiveKit Cloud or self-hosted LiveKit deployment and server-side API credentials. File uploads require a private S3-compatible bucket with CORS configured for the Cord web origin. These services remain unavailable until their environment variables are configured.
