# Cord architecture

Cord is structured to support a real community product with a premium single-page desktop experience, protected user accounts, and a real-time messaging backend.

## Core layers

- Frontend: Next.js App Router with React and TypeScript
- Backend: server routes, Prisma queries, and protected auth helpers
- Realtime: Socket.IO signaling and presence updates
- Persistence: PostgreSQL via Prisma ORM
- Cache and coordination: Redis for presence and scaling
- Storage: S3-compatible object storage for media uploads

## Auth and account flow

The app uses a signed session cookie and secure password hashing with bcrypt. The server validates every request and redirects unauthenticated users away from the protected `/app` experience.

## Messaging model

Channels and server memberships are modeled in Prisma. Message history is persisted in PostgreSQL and can be queried and paginated for large conversations.

## Future expansion

This foundation is designed to evolve toward direct messages, voice channels, moderation tools, and WebRTC-based audio/video calls. A separate signal server or LiveKit/SFU deployment would be the natural next step for scalable calls.
