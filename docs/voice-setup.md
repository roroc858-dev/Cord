# Cord voice and video setup

Community voice/video calls use LiveKit rooms. Cord's authenticated web API issues short-lived participant tokens scoped to a member's voice channel; browsers connect to LiveKit directly. The LiveKit API secret is never sent to the browser.

## Recommended production setup

- Media service: LiveKit Cloud or a self-hosted LiveKit server
- Signaling and SFU: provided by LiveKit for community rooms
- Realtime chat/typing/presence: separate authenticated Socket.IO service; this is independent of media call signaling

## Required environment variables

Set these values in `.env.local` and in the production web service:

```env
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

Keep `LIVEKIT_API_SECRET` private. Create a server voice channel in Cord and select it to join the associated call room. A call token can only be issued to an authenticated member of that channel.

## Troubleshooting

The call API returns a configuration error until all three values are set. If tokens are issued but connections fail, verify the public LiveKit URL, project status, browser microphone/camera permissions, and network access to LiveKit's media endpoints. For self-hosted deployments, configure the appropriate TURN and firewall/media port settings in LiveKit.
cccccccc