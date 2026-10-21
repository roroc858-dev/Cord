"use client";

import { Mic, MicOff, Phone, Video, VideoOff, X } from "lucide-react";
import { Room, RoomEvent, Track, type Participant, type RemoteTrackPublication } from "livekit-client";
import { useEffect, useRef, useState } from "react";

type CallInfo = { url: string; token: string };

export function CommunityCall({ channelId, channelName }: { channelId: string; channelName: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [participants, setParticipants] = useState(1);
  const videoGrid = useRef<HTMLDivElement>(null);
  const audioContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!room) return;
    const attachTrack = (track: Track, participant: Participant) => {
      const element = track.attach();
      element.dataset.participantId = participant.identity;
      if (track.kind === Track.Kind.Video) {
        element.classList.add("call-video");
        videoGrid.current?.append(element);
      } else {
        element.autoplay = true;
        audioContainer.current?.append(element);
      }
    };
    const onSubscribed = (track: Track, _publication: RemoteTrackPublication, participant: Participant) => {
      attachTrack(track, participant);
    };
    const onUnsubscribed = (track: Track) => {
      track.detach().forEach((element) => element.remove());
    };
    const updateParticipants = () => setParticipants(room.remoteParticipants.size + 1);
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, updateParticipants);
    room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track) attachTrack(publication.track, participant);
      }
    }
    updateParticipants();
    return () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
      room.off(RoomEvent.ParticipantConnected, updateParticipants);
      room.off(RoomEvent.ParticipantDisconnected, updateParticipants);
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          publication.track?.detach().forEach((element) => element.remove());
        }
      }
      void room.disconnect();
    };
  }, [room]);

  async function joinCall() {
    setJoining(true);
    setError("");
    try {
      const response = await fetch("/api/calls/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const result = (await response.json()) as CallInfo & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not join the call.");
      const newRoom = new Room({ adaptiveStream: true, dynacast: true });
      await newRoom.connect(result.url, result.token);
      await newRoom.localParticipant.setMicrophoneEnabled(true);
      setAudioEnabled(true);
      setRoom(newRoom);
      setParticipants(newRoom.remoteParticipants.size + 1);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join the call.");
    } finally {
      setJoining(false);
    }
  }

  async function toggleAudio() {
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update microphone.");
    }
  }

  async function toggleVideo() {
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(!videoEnabled);
      const publication = Array.from(room.localParticipant.videoTrackPublications.values())[0];
      if (!videoEnabled && publication?.track && videoGrid.current) {
        const element = publication.track.attach();
        element.dataset.participantId = room.localParticipant.identity;
        element.classList.add("call-video");
        videoGrid.current.append(element);
      } else if (videoEnabled && publication?.track) {
        publication.track.detach().forEach((element) => element.remove());
      }
      setVideoEnabled(!videoEnabled);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update camera.");
    }
  }

  if (!room) {
    return (
      <div className="call-lobby">
        <div>
          <strong>Voice & video · {channelName}</strong>
          <span>Join this community call with your microphone. Camera starts off.</span>
        </div>
        <button type="button" className="call-join" onClick={joinCall} disabled={joining}>
          <Phone size={15} /> {joining ? "Joining…" : "Join call"}
        </button>
        {error ? <p className="call-error" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <section className="community-call" aria-label={`${channelName} voice and video call`}>
      <header className="call-header">
        <span><span className="call-live-dot" /> {channelName} · {participants} {participants === 1 ? "here" : "here"}</span>
        <button type="button" aria-label="Leave call" title="Leave call" onClick={() => {
          void room.disconnect();
          setRoom(null);
          setAudioEnabled(false);
          setVideoEnabled(false);
        }}>
          <X size={17} />
        </button>
      </header>
      <div className="call-video-grid" ref={videoGrid}>
        {!videoEnabled && participants === 1 ? <p className="call-placeholder">You’re in the room. Invite your community to join.</p> : null}
      </div>
      <div className="call-audio-container" ref={audioContainer} />
      {error ? <p className="call-error" role="alert">{error}</p> : null}
      <div className="call-controls">
        <button type="button" onClick={toggleAudio} aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}>
          {audioEnabled ? <Mic size={17} /> : <MicOff size={17} />} {audioEnabled ? "Mute" : "Unmute"}
        </button>
        <button type="button" onClick={toggleVideo} aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}>
          {videoEnabled ? <Video size={17} /> : <VideoOff size={17} />} {videoEnabled ? "Camera off" : "Camera on"}
        </button>
        <button type="button" className="call-leave" onClick={() => {
          void room.disconnect();
          setRoom(null);
          setAudioEnabled(false);
          setVideoEnabled(false);
        }}>
          <Phone size={16} /> Leave
        </button>
      </div>
    </section>
  );
}
