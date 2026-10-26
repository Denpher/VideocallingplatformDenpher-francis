
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  Mic,
  MicOff,
  MonitorUp,
  Video,
  Wifi,
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  const [intro, setIntro] = useState(true);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIntro(false);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, []);

  function createRoom() {
    if (!name.trim()) {
      setError("Enter your name before creating a room.");
      document.getElementById("create-name")?.focus();
      return;
    }

    const id = crypto.randomUUID().slice(0, 8);

    router.push(
      `/room/${id}?name=${encodeURIComponent(name.trim())}`
    );
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Enter your name before joining.");
      document.getElementById("join-name")?.focus();
      return;
    }

    const id = roomCode.trim().replace(/\s+/g, "");

    if (!id) {
      setError("Enter the room code you received.");
      document.getElementById("room-code")?.focus();
      return;
    }

    router.push(
      `/room/${encodeURIComponent(id)}?name=${encodeURIComponent(name.trim())}`
    );
  }

  function updateName(value: string) {
    setName(value);
    setError("");
  }

  return (
    <main className="nx-page">
      {intro && (
        <div className="nx-intro" aria-label="NEXION introduction">
          <div className="nx-intro-content">
            <div className="nx-intro-logo">
              <span className="nx-intro-icon">
                <Video size={24} strokeWidth={1.7} />
              </span>

              <span>
                NEXION<span className="nx-dot">.</span>
              </span>
            </div>

            <div className="nx-intro-track">
              <span />
            </div>

            <p>Powered by Denpher and Francis</p>
          </div>
        </div>
      )}

      <div
        className={`nx-site ${
          intro ? "nx-site-waiting" : "nx-site-visible"
        }`}
      >
        <header className="nx-header">
          <a href="/" className="nx-brand" aria-label="NEXION home">
            <span className="nx-brand-icon">
              <Video size={18} />
            </span>

            <span>
              NEXION<span className="nx-dot">.</span>
            </span>
          </a>

          <nav className="nx-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#about">About</a>
          </nav>

          <a className="nx-header-cta" href="#start">
            Start a call <ArrowRight size={15} />
          </a>
        </header>

        <section className="nx-hero">
          <div className="nx-hero-copy nx-reveal">
            <div className="nx-kicker">
              <span className="nx-live-dot" />
              VIDEO CALLING / 001
            </div>

            <h1>
              Just open a room.
              <br />
              <span>Get talking.</span>
            </h1>

            <p className="nx-hero-description">
              Need to talk? Create a room, share the code, and
              bring everyone together. No complicated setup.
            </p>

            <div className="nx-hero-actions">
              <a className="nx-button nx-button-light" href="#start">
                Get started <ArrowRight size={16} />
              </a>

              <a className="nx-plain-link" href="#how-it-works">
                See how it works <ArrowDown size={15} />
              </a>
            </div>

            <div className="nx-small-note">
              <Check size={15} />
              Join from your browser.
            </div>
          </div>

          <div className="nx-visual nx-reveal nx-reveal-delay">
            <div className="nx-visual-heading">
              <span>ROOM PREVIEW</span>

              <span className="nx-visual-state">
                <span className="nx-live-dot" />
                READY
              </span>
            </div>

            <div className="nx-call-window">
              <div className="nx-call-window-top">
                <div className="nx-window-dots">
                  <span />
                  <span />
                  <span />
                </div>

                <span>nexion / room</span>
                <span className="nx-window-lock">PRIVATE ROOM</span>
              </div>

              <div className="nx-participants">
                <div className="nx-participant nx-participant-main">
                  <div className="nx-person-symbol">
                    <Video size={31} strokeWidth={1.4} />
                  </div>

                  <span className="nx-participant-name">Your space</span>
                  <span className="nx-participant-caption">
                    Ready when you are
                  </span>
                </div>

                <div className="nx-participant nx-participant-small">
                  <div className="nx-person-symbol nx-person-symbol-small">
                    <Camera size={24} strokeWidth={1.4} />
                  </div>

                  <span className="nx-participant-name">Room preview</span>
                </div>
              </div>

              <div className="nx-call-toolbar">
                <button
                  type="button"
                  className={`nx-round-control ${
                    !micOn ? "nx-control-muted" : ""
                  }`}
                  onClick={() => setMicOn((value) => !value)}
                  aria-label={micOn ? "Mute preview control" : "Enable preview control"}
                  title={micOn ? "Mute preview" : "Enable preview"}
                >
                  {micOn ? <Mic size={17} /> : <MicOff size={17} />}
                </button>

                <button
                  type="button"
                  className={`nx-round-control ${
                    !cameraOn ? "nx-control-muted" : ""
                  }`}
                  onClick={() => setCameraOn((value) => !value)}
                  aria-label={
                    cameraOn ? "Turn camera preview off" : "Turn camera preview on"
                  }
                  title={cameraOn ? "Camera preview off" : "Camera preview on"}
                >
                  {cameraOn ? <Camera size={17} /> : <CameraOff size={17} />}
                </button>

                <span className="nx-toolbar-label">
                  {micOn ? "Mic ready" : "Mic preview off"}
                </span>
              </div>
            </div>

            <div className="nx-visual-footer">
              <span>Simple by design.</span>
              <span>001 — NEXION</span>
            </div>
          </div>
        </section>

        <section className="nx-start-section" id="start">
          <div className="nx-section-heading">
            <div>
              <span className="nx-eyebrow">01 / GET CONNECTED</span>
              <h2>Who's joining?</h2>
            </div>

            <p>Start a room or join one someone has shared with you.</p>
          </div>

          <div className="nx-form-grid">
            <article className="nx-form-card">
              <span className="nx-card-index">01 — NEW ROOM</span>
              <h3>Start a call</h3>
              <p>Create a room and send its code to the people joining you.</p>

              <label className="nx-label" htmlFor="create-name">
                YOUR NAME
              </label>

              <input
                id="create-name"
                className="nx-input"
                value={name}
                onChange={(event) => updateName(event.target.value)}
                placeholder="Enter your name"
                maxLength={40}
                autoComplete="name"
              />

              <button
                className="nx-button nx-button-light nx-full-button"
                type="button"
                onClick={createRoom}
              >
                Create room <ArrowRight size={16} />
              </button>
            </article>

            <article className="nx-form-card" id="how-it-works">
              <span className="nx-card-index">02 — HAVE A CODE?</span>
              <h3>Join a call</h3>
              <p>Use the room code you received to join the conversation.</p>

              <form onSubmit={joinRoom}>
                <label className="nx-label" htmlFor="join-name">
                  YOUR NAME
                </label>

                <input
                  id="join-name"
                  className="nx-input"
                  value={name}
                  onChange={(event) => updateName(event.target.value)}
                  placeholder="Enter your name"
                  maxLength={40}
                  autoComplete="name"
                />

                <label className="nx-label" htmlFor="room-code">
                  ROOM CODE
                </label>

                <input
                  id="room-code"
                  className="nx-input"
                  value={roomCode}
                  onChange={(event) => {
                    setRoomCode(event.target.value);
                    setError("");
                  }}
                  placeholder="Paste the room code"
                  maxLength={100}
                  autoComplete="off"
                />

                <button
                  className="nx-button nx-button-outline nx-full-button"
                  type="submit"
                >
                  Join room <ArrowRight size={16} />
                </button>
              </form>
            </article>
          </div>

          {error && (
            <p className="nx-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="nx-features">
          <span className="nx-eyebrow">02 / THE BASICS</span>

          <div className="nx-feature-grid">
            <article className="nx-feature-card">
              <Video size={21} />
              <h3>Video calls</h3>
              <p>Talk face to face from your browser.</p>
            </article>

            <article className="nx-feature-card">
              <Mic size={21} />
              <h3>Mic controls</h3>
              <p>Control your microphone during a call.</p>
            </article>

            <article className="nx-feature-card">
              <MonitorUp size={21} />
              <h3>Screen sharing</h3>
              <p>Share what's on your screen when needed.</p>
            </article>

            <article className="nx-feature-card">
              <Wifi size={21} />
              <h3>Room codes</h3>
              <p>Share a code instead of explaining where to go.</p>
            </article>
          </div>
        </section>

        <section className="nx-about" id="about">
          <span className="nx-eyebrow">03 / ABOUT</span>

          <h2>
            Made to keep
            <br />
            things <span>simple.</span>
          </h2>

          <p>
            NEXION is a video-calling project built by Denpher and
            Francis. The aim is straightforward: make starting a
            conversation less of a hassle.
          </p>
        </section>

        <footer className="nx-footer">
          <a href="/" className="nx-brand" aria-label="NEXION home">
            <span className="nx-brand-icon">
              <Video size={17} />
            </span>

            <span>
              NEXION<span className="nx-dot">.</span>
            </span>
          </a>

          <span className="nx-footer-credit">
            Powered by Denpher and Francis
          </span>

          <span>© NEXION</span>
        </footer>
      </div>
    </main>
  );
}
