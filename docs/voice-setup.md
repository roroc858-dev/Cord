# Cord voice and video setup

Real-time media calls need external infrastructure. Cord includes the architecture hooks for WebRTC and Socket.IO signaling, but the service should only be considered operational once STUN/TURN credentials are configured.

## Recommended production setup

- STUN/TURN: Twilio, LiveKit, or a self-hosted coturn setup
- Signaling: Socket.IO with authenticated room joins
- SFU: LiveKit for scalable multi-user rooms
- Browser signaling: WebRTC offer/answer exchange through secure authenticated Socket.IO events

## Required environment values

Set the following values in `.env.local`:

```env
TURN_SERVER_URL=turn:turn.example.com:3478
TURN_SERVER_USERNAME=cord
TURN_SERVER_CREDENTIAL=replace-me
```

## Local development

For local testing, a coturn service or a managed TURN deployment should be provided. Until those values are configured, the UI should be treated as a design and integration scaffold rather than a live calling feature.
