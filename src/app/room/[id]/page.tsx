
"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

type ChatMessage = {
  from: string;
  name: string;
  message: string;
  time: number;
};

type SignalPayload = {
  from: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

const SIGNAL_URL =
  process.env.NEXT_PUBLIC_SIGNAL_SERVER_URL || "http://localhost:4000";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId = params.id;
  const name = searchParams.get("name")?.trim().slice(0, 40) || "Guest";

  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Ready to join");
  const [remoteName, setRemoteName] = useState("Waiting for someone");
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const joiningRef = useRef(false);

  const createPeerConnection = useCallback((peerId: string) => {
    const existing = peerConnections.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const stream = localStreamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("ice-candidate", {
          to: peerId,
          data: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      let remoteStream = remoteStreamRef.current;

      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
      }

      if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        void remoteVideoRef.current.play().catch(() => {});
      }

      setRemoteConnected(true);
      setStatus("Connected");
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setRemoteConnected(true);
        setStatus("Connected");
      } else if (pc.connectionState === "connecting") {
        setStatus("Connecting video...");
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        setStatus("Connection interrupted");
      }
    };

    peerConnections.current.set(peerId, pc);
    return pc;
  }, []);

  const flushCandidates = useCallback(async (peerId: string) => {
    const pc = peerConnections.current.get(peerId);
    const candidates = pendingCandidates.current.get(peerId) || [];

    if (!pc?.remoteDescription) return;

    pendingCandidates.current.delete(peerId);

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Could not add queued ICE candidate:", err);
      }
    }
  }, []);

  const closeConnections = useCallback(() => {
    peerConnections.current.forEach((pc) => {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
    });

    peerConnections.current.clear();
    pendingCandidates.current.clear();

    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setRemoteConnected(false);
  }, []);

  const leaveCall = useCallback(() => {
    socketRef.current?.emit("leave-room");
    socketRef.current?.disconnect();
    socketRef.current = null;

    closeConnections();

    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    joiningRef.current = false;
    setJoined(false);
    setConnecting(false);
    setSharing(false);
    setStatus("Call ended");
  }, [closeConnections]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();

      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();

      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function joinCall() {
    if (joiningRef.current) return;

    joiningRef.current = true;
    setConnecting(true);
    setError("");
    setStatus("Requesting camera and microphone...");

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
    } catch (err) {
      joiningRef.current = false;
      setConnecting(false);
      setStatus("Camera or microphone unavailable");
      setError(
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : "Allow camera and microphone access, then try again."
      );
      return;
    }

    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    const socket = io(SIGNAL_URL, {
      transports: ["websocket"],
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-room", { roomId, name });
    });

    socket.on("connect_error", (err) => {
      setError(`Could not reach the signalling server: ${err.message}`);
      setStatus("Server connection failed");
      setConnecting(false);
    });

    socket.on("room-error", (message: string) => {
      setError(message);
      setStatus("Unable to join room");
      setConnecting(false);
      joiningRef.current = false;
    });

    socket.on(
      "room-joined",
      (data: {
        roomId: string;
        selfId: string;
        peers: { id: string; name: string }[];
      }) => {
        setJoined(true);
        setConnecting(false);
        setStatus(
          data.peers.length > 0
            ? "Connecting to participant..."
            : "Room created — waiting for someone"
        );

        if (data.peers.length > 0) {
          setRemoteName(data.peers[0].name);
        }
      }
    );

    // The participant already in the room sends the offer.
    socket.on(
      "peer-joined",
      async (peer: { id: string; name: string }) => {
        setRemoteName(peer.name || "Guest");

        const pc = createPeerConnection(peer.id);

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit("offer", {
            to: peer.id,
            data: pc.localDescription,
          });
        } catch (err) {
          console.error("Offer creation failed:", err);
          setError("Could not start the video connection.");
        }
      }
    );

    socket.on("offer", async ({ from, data }: SignalPayload) => {
      try {
        const pc = createPeerConnection(from);
        await pc.setRemoteDescription(
          new RTCSessionDescription(data as RTCSessionDescriptionInit)
        );

        await flushCandidates(from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
          to: from,
          data: pc.localDescription,
        });
      } catch (err) {
        console.error("Offer handling failed:", err);
        setError("Could not accept the video connection.");
      }
    });

    socket.on("answer", async ({ from, data }: SignalPayload) => {
      try {
        const pc = peerConnections.current.get(from);
        if (!pc) return;

        await pc.setRemoteDescription(
          new RTCSessionDescription(data as RTCSessionDescriptionInit)
        );

        await flushCandidates(from);
      } catch (err) {
        console.error("Answer handling failed:", err);
        setError("Could not complete the video connection.");
      }
    });

    socket.on("ice-candidate", async ({ from, data }: SignalPayload) => {
      const candidate = data as RTCIceCandidateInit;
      const pc = peerConnections.current.get(from);

      if (!pc || !pc.remoteDescription) {
        const queue = pendingCandidates.current.get(from) || [];
        queue.push(candidate);
        pendingCandidates.current.set(from, queue);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("ICE candidate failed:", err);
      }
    });

    socket.on("peer-left", () => {
      closeConnections();
      setRemoteName("Waiting for someone");
      setStatus("Participant left");
    });

    socket.on("chat-message", (message: ChatMessage) => {
      setMessages((previous) => [...previous, message]);
    });

    socket.on("disconnect", () => {
      if (joiningRef.current) {
        setStatus("Server disconnected");
      }
    });
  }

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }

  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
  }

  async function toggleScreenShare() {
    if (sharing) {
      await stopScreenShare();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      screenStreamRef.current = screenStream;

      for (const pc of peerConnections.current.values()) {
        const sender = pc.getSenders().find(
          (item) => item.track?.kind === "video"
        );

        if (sender) await sender.replaceTrack(screenTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      setSharing(true);

      screenTrack.onended = () => {
        void stopScreenShare();
      };
    } catch (err) {
      console.error("Screen sharing failed:", err);
      setError("Screen sharing was cancelled or is unavailable.");
    }
  }

  async function stopScreenShare() {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!cameraTrack) return;

    for (const pc of peerConnections.current.values()) {
      const sender = pc.getSenders().find(
        (item) => item.track?.kind === "video"
      );

      if (sender) {
        try {
          await sender.replaceTrack(cameraTrack);
        } catch (err) {
          console.error("Could not restore camera:", err);
        }
      }
    }

    screenStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });

    screenStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    setSharing(false);
  }

  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = chatText.trim();
    if (!message || !socketRef.current?.connected) return;

    socketRef.current.emit("chat-message", { message });
    setChatText("");
  }

  async function copyRoomLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Room link copied");
    } catch {
      setError("Couldn't copy automatically. Copy the room URL from your browser.");
    }
  }

  return (
    <main className="call-page">
      <header className="call-header">
        <a className="call-brand" href="/">nexion<span>.</span></a>

        <div className="room-info">
          <span className="room-live-dot" />
          <span>Room {roomId}</span>
        </div>

        <button className="copy-button" onClick={copyRoomLink}>
          Copy invite link
        </button>
      </header>

      <section className="call-layout">
        <div className="call-main">
          <div className="call-heading">
            <div>
              <p className="call-eyebrow">YOUR TALKING SPACE</p>
              <h1>{joined ? "You're in the room." : "Ready to connect?"}</h1>
              <p className="call-status">{status}</p>
            </div>
            <span className="participant-count">
              {joined ? (remoteConnected ? "2 participants" : "1 participant") : "Not connected"}
            </span>
          </div>

          {error && (
            <div className="call-error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">×</button>
            </div>
          )}

          <div className="video-grid">
            <article className="video-tile">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="video-element"
              />
              {!joined && (
                <div className="video-placeholder">
                  <div className="placeholder-avatar">N</div>
                  <p>Your camera preview</p>
                </div>
              )}
              {joined && !cameraOn && !sharing && (
                <div className="camera-off-label">Camera off</div>
              )}
              <span className="video-name">You ({name})</span>
              <span className="video-badge">{micOn ? "Mic on" : "Mic muted"}</span>
            </article>

            <article className="video-tile">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="video-element"
              />
              {!remoteConnected && (
                <div className="video-placeholder">
                  <div className="placeholder-avatar friend-avatar">
                    {remoteName.slice(0, 1).toUpperCase()}
                  </div>
                  <p>{remoteName}</p>
                  <small>{joined ? "Waiting for video..." : "Join to start calling"}</small>
                </div>
              )}
              <span className="video-name">{remoteName}</span>
            </article>
          </div>

          {!joined ? (
            <button
              className="join-call-button"
              onClick={joinCall}
              disabled={connecting}
            >
              {connecting ? "Connecting..." : "Join call"}
            </button>
          ) : (
            <div className="call-controls">
              <button
                className={`control-button ${!micOn ? "control-off" : ""}`}
                onClick={toggleMic}
                title={micOn ? "Mute microphone" : "Unmute microphone"}
              >
                <span>{micOn ? "🎙" : "🔇"}</span>
                <small>{micOn ? "Mute" : "Unmute"}</small>
              </button>

              <button
                className={`control-button ${!cameraOn ? "control-off" : ""}`}
                onClick={toggleCamera}
                title={cameraOn ? "Turn camera off" : "Turn camera on"}
              >
                <span>{cameraOn ? "▣" : "▧"}</span>
                <small>{cameraOn ? "Camera" : "Camera off"}</small>
              </button>

              <button
                className={`control-button ${sharing ? "control-active" : ""}`}
                onClick={toggleScreenShare}
              >
                <span>↗</span>
                <small>{sharing ? "Stop share" : "Share screen"}</small>
              </button>

              <button
                className={`control-button ${chatOpen ? "control-active" : ""}`}
                onClick={() => setChatOpen((value) => !value)}
              >
                <span>☰</span>
                <small>Chat</small>
              </button>

              <button
                className="control-button control-end"
                onClick={() => {
                  leaveCall();
                  router.push("/");
                }}
              >
                <span>×</span>
                <small>Leave</small>
              </button>
            </div>
          )}
        </div>

        {chatOpen && joined && (
          <aside className="chat-panel">
            <h2>Room chat</h2>
            <div className="chat-messages" aria-live="polite">
              {messages.length === 0 && (
                <p className="chat-empty">Messages sent here appear for everyone in this room.</p>
              )}
              {messages.map((message, index) => (
                <article className="chat-message" key={`${message.time}-${index}`}>
                  <strong>{message.name}</strong>
                  <p>{message.message}</p>
                  <small>
                    {new Date(message.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </article>
              ))}
            </div>
            <form className="chat-form" onSubmit={sendChat}>
              <input
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                placeholder="Write a message..."
                maxLength={1000}
              />
              <button type="submit">Send</button>
            </form>
          </aside>
        )}
      </section>

      <footer className="call-footer">
        <span>nexion.</span>
        <span>Built by Denpher × Francis</span>
        <a href="/">Leave room</a>
      </footer>

      <style jsx>{`
        .call-page {
          min-height: 100vh;
          background: #0d0f0e;
          color: #f1f3ee;
          padding: 0 5%;
          font-family: Arial, Helvetica, sans-serif;
        }
        .call-header {
          height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid #272b28;
        }
        .call-brand {
          color: #f4f5f0;
          font-size: 25px;
          font-weight: 750;
          text-decoration: none;
          letter-spacing: -1.2px;
        }
        .call-brand span { color: #c4f36b; }
        .room-info {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #b8beb7;
          font-size: 13px;
        }
        .room-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #a3e635;
        }
        .copy-button, .join-call-button {
          border: 0;
          border-radius: 10px;
          padding: 12px 16px;
          font-weight: 650;
          cursor: pointer;
        }
        .copy-button {
          background: #202420;
          color: #eef2e9;
          border: 1px solid #353b35;
        }
        .call-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 22px;
          padding: 34px 0;
          align-items: start;
        }
        .call-main { min-width: 0; }
        .call-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 22px;
        }
        .call-eyebrow {
          color: #b7df74;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2px;
          margin: 0 0 10px;
        }
        h1 {
          font-size: clamp(25px, 3vw, 37px);
          letter-spacing: -1.4px;
          margin: 0;
        }
        .call-status {
          color: #9ba39a;
          font-size: 13px;
          margin: 10px 0 0;
        }
        .participant-count {
          white-space: nowrap;
          font-size: 12px;
          color: #c0c8bd;
          border: 1px solid #303630;
          border-radius: 30px;
          padding: 9px 12px;
        }
        .call-error {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          background: #38201f;
          color: #ffc3bb;
          padding: 12px 14px;
          border-radius: 10px;
          margin-bottom: 15px;
          font-size: 13px;
          overflow-wrap: anywhere;
        }
        .call-error button {
          background: none;
          color: inherit;
          border: 0;
          font-size: 20px;
          cursor: pointer;
        }
        .video-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .video-tile {
          position: relative;
          overflow: hidden;
          aspect-ratio: 16 / 10;
          min-height: 210px;
          border-radius: 16px;
          background: #191d19;
          border: 1px solid #2c322c;
        }
        .video-element {
          width: 100%;
          height: 100%;
          object-fit: cover;
          position: absolute;
          inset: 0;
          z-index: 1;
          background: #191d19;
        }
        .video-placeholder {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: radial-gradient(ellipse at center, #252d24, #171a17 75%);
          color: #dce3d8;
          gap: 9px;
        }
        .video-placeholder p { margin: 0; font-size: 13px; }
        .video-placeholder small { color: #9ca79a; font-size: 11px; }
        .placeholder-avatar {
          width: 66px;
          height: 66px;
          display: grid;
          place-items: center;
          background: #c4f36b;
          color: #171c13;
          border-radius: 22px;
          font-size: 28px;
          font-weight: 750;
        }
        .friend-avatar {
          background: #293f39;
          color: #b6f4d7;
        }
        .video-name, .video-badge {
          position: absolute;
          z-index: 3;
          bottom: 12px;
          border-radius: 7px;
          background: #0d0f0ecb;
          color: #f1f3ee;
          padding: 7px 9px;
          font-size: 11px;
        }
        .video-name { left: 12px; }
        .video-badge { right: 12px; color: #c4f36b; }
        .camera-off-label {
          position: absolute;
          z-index: 4;
          top: 12px;
          right: 12px;
          background: #0d0f0ecb;
          padding: 7px 9px;
          border-radius: 7px;
          font-size: 11px;
        }
        .join-call-button {
          display: block;
          margin: 20px auto 0;
          min-width: 180px;
          background: #c4f36b;
          color: #13170e;
          font-size: 14px;
        }
        .join-call-button:disabled { opacity: .65; cursor: wait; }
        .call-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding-top: 22px;
        }
        .control-button {
          min-width: 75px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 7px;
          padding: 12px 13px;
          color: #f0f2ec;
          background: #202420;
          border: 1px solid #343a34;
          border-radius: 12px;
          cursor: pointer;
        }
        .control-button > span { font-size: 20px; }
        .control-button small { font-size: 10px; white-space: nowrap; }
        .control-off { background: #49302d; border-color: #70403b; }
        .control-active { border-color: #a3e635; color: #c4f36b; }
        .control-end { background: #8f3434; border-color: #8f3434; }
        .control-end small { color: white; }
        .chat-panel {
          min-height: 360px;
          height: min(65vh, 560px);
          display: flex;
          flex-direction: column;
          border: 1px solid #2b312b;
          background: #141714;
          border-radius: 15px;
          overflow: hidden;
        }
        .chat-panel h2 {
          font-size: 16px;
          margin: 0;
          padding: 18px;
          border-bottom: 1px solid #2b312b;
        }
        .chat-messages {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 14px;
        }
        .chat-empty { color: #8f988d; font-size: 12px; line-height: 1.6; }
        .chat-message {
          margin-bottom: 15px;
          padding-bottom: 12px;
          border-bottom: 1px solid #262b26;
          overflow-wrap: anywhere;
        }
        .chat-message strong { color: #c4f36b; font-size: 12px; }
        .chat-message p { font-size: 13px; line-height: 1.5; margin: 6px 0; }
        .chat-message small { color: #838d82; font-size: 10px; }
        .chat-form {
          display: flex;
          gap: 7px;
          padding: 12px;
          border-top: 1px solid #2b312b;
        }
        .chat-form input {
          width: 0;
          min-width: 0;
          flex: 1;
          background: #202420;
          color: white;
          border: 1px solid #363d36;
          border-radius: 8px;
          padding: 10px;
          outline: none;
        }
        .chat-form button {
          background: #c4f36b;
          color: #151a10;
          border: 0;
          border-radius: 8px;
          padding: 0 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .call-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          border-top: 1px solid #272b28;
          padding: 20px 0;
          color: #929a91;
          font-size: 11px;
        }
        .call-footer span:first-child { color: #e9eee5; font-weight: 700; }
        .call-footer a { color: #c4f36b; text-decoration: none; }
        @media (max-width: 900px) {
          .call-layout { grid-template-columns: minmax(0, 1fr); }
          .chat-panel { height: 400px; }
        }
        @media (max-width: 600px) {
          .call-page { padding: 0 16px; }
          .call-header { height: 66px; }
          .call-brand { font-size: 21px; }
          .room-info { font-size: 10px; }
          .copy-button { padding: 10px; font-size: 11px; }
          .call-layout { padding: 24px 0; }
          .call-heading { align-items: flex-start; flex-direction: column; }
          .video-grid { grid-template-columns: minmax(0, 1fr); }
          .video-tile { min-height: 230px; }
          .call-footer { flex-wrap: wrap; }
          .control-button { min-width: 67px; padding: 10px; }
        }
      `}</style>
    </main>
  );
}
