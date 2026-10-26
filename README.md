# NEXION — Video Calling Platform

A real-time video calling platform built with **Next.js**, **WebRTC**, **LiveKit**, and **Socket.IO**.

## Prerequisites

- **Node.js** `v20.19.0` or higher (recommended: **v24+**)
- **npm** `v10` or higher

> **⚠️ Important:** If you're on Node `v22`, make sure you have at least **v22.13.0** or later. Older v22 releases may show engine compatibility warnings.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Denpher/VideocallingplatformDenpher-francis.git
cd VideocallingplatformDenpher-francis
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the root directory with your configuration:

```env
# Add your environment variables here
# Example:
# LIVEKIT_API_KEY=your_api_key
# LIVEKIT_API_SECRET=your_api_secret
# NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-server
```

### 4. Run the development server

Start the **Next.js frontend**:

```bash
npm run dev
```

Start the **Socket.IO signalling server** (in a separate terminal):

```bash
npm run server
```

### 5. Open in browser

Navigate to [http://localhost:3000](http://localhost:3000) to use the app.

## Project Structure

```
nexion/
├── src/
│   └── app/
│       ├── page.tsx            # Landing page
│       ├── layout.tsx          # Root layout
│       ├── globals.css         # Global styles
│       └── room/
│           └── [id]/
│               └── page.tsx    # Video room page (WebRTC)
├── server/
│   └── index.js               # Socket.IO signalling server
├── public/                     # Static assets
├── package.json
├── next.config.ts
└── tsconfig.json
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Video:** WebRTC, LiveKit
- **Signalling:** Socket.IO, Express
- **Styling:** CSS Modules

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run server` | Start Socket.IO signalling server |
| `npm run lint` | Run ESLint |

## License

This project is open source.
