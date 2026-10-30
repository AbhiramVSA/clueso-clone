<p align="center">
  <img src="assets/clueso-mark.svg" alt="Clueso recording frame with event markers" width="104">
</p>

<h1 align="center">Clueso Clone</h1>

<p align="center">A multi-service prototype for browser capture, recording uploads, and AI-assisted narration.</p>

<div align="center">

[Overview](#overview) · [Run locally](#run-locally) · [Services and routes](#services-and-routes) · [Configuration](#configuration) · [Tests](#tests) · [Scope](#scope-and-notes)

</div>

## Overview

This repository contains four connected parts: a Chrome extension, an Express and Socket.IO service, a Next.js viewer, and a FastAPI processing service. The extension records screen and microphone media and collects page events. The Node service receives recording chunks and forwards processing requests to ProductAI. The viewer opens a recording session and receives socket updates.

The session-list page currently uses in-code sample entries; it does not load a live session list from the Node API. This repository is a prototype and does not provide a verified end-to-end deployment.

## Run locally

You need Node.js with npm, Python with pip, and Chrome. ProductAI declares Python 3.13 or newer. Start the services in the order below. The example ports match the extension’s current local URLs.

### 1. Start ProductAI

```sh
cd ProductAI
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API docs are at `http://localhost:8000/docs`. Model-backed endpoints need `GEMINI_API_KEY`; narration audio uses `DEEPGRAM_API_KEY`.

### 2. Start the Node service

In a second terminal, from the repository root:

```sh
cd Clueso_Node_layer
npm ci
npm run dev
```

The service listens on port `3000` by default and uses ProductAI at `http://localhost:8000` by default.

### 3. Start the web viewer

In a third terminal, from the repository root:

```sh
cd Clueso_Frontend_layer
npm ci
npm run dev -- --port 3001
```

Open `http://localhost:3001`. The extension and viewer use local ports `3000` and `3001`. If you change either port, update the matching client configuration.

### 4. Build and load the extension

```sh
cd Clueso_extension
npm ci
npm run build
```

In Chrome, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose `Clueso_extension/dist`. Chrome will request screen and microphone access when you start a recording.

## Services and routes

| Service | Source | Main responsibilities |
| --- | --- | --- |
| Chrome extension | [`Clueso_extension/`](Clueso_extension/) | Captures screen and microphone chunks plus browser events. It submits chunks to the local Node service. |
| Node service | [`Clueso_Node_layer/`](Clueso_Node_layer/) | Express and Socket.IO endpoints for recording chunks, sessions, health checks, and ProductAI forwarding. |
| ProductAI | [`ProductAI/`](ProductAI/) | FastAPI endpoints for recording processing, summaries, sentiment, quality scoring, translation, and analytics. |
| Web viewer | [`Clueso_Frontend_layer/`](Clueso_Frontend_layer/) | Next.js session entry and recording view with live socket updates. The session list uses sample data. |

The Node recording routes include `POST /api/v1/recording/video-chunk`, `POST /api/v1/recording/audio-chunk`, and `POST /api/v1/recording/process-recording`. ProductAI exposes `POST /process-recording`, `POST /audio-full-process`, `POST /generate-summary`, `POST /analyze-sentiment`, `POST /score-quality`, `POST /translate`, and `GET /health`.

## Configuration

The repository does not include service-specific `.env.example` files. Set only the values you use in your local environment, and do not commit API credentials.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `PORT` | Node service | Changes its listen port; default is `3000`. |
| `PYTHON_LAYER_URL` | Node service | Sets the ProductAI base URL; default is `http://localhost:8000`. |
| `PYTHON_SERVICE_TIMEOUT` | Node service | Sets the request timeout for ProductAI calls. |
| `GEMINI_API_KEY` | ProductAI | Authenticates Gemini model calls. |
| `DEEPGRAM_API_KEY` | Node service and ProductAI | Authenticates Deepgram transcription or speech requests. |
| `NEXT_PUBLIC_BACKEND_URL` | Web viewer | Sets the base URL used to build recording media URLs; default is `http://localhost:3000`. |
| `NEXT_PUBLIC_SOCKET_URL` | Web viewer | Sets the Socket.IO connection target; default is `http://localhost:3000`. |
| `NODE_SERVER_URL` | ProductAI | Sets the Node service target for generated media forwarding. |

Node reads its `.env` file from the repository root. The web viewer reads its public variables when Next.js starts.

## Scope and notes

- The browser extension uses local Node and viewer URLs in its current source. Keep the documented ports unless you update those URLs.
- The UI session list is a mock. The recording view requires a session ID and a running Node socket service.
- The code and dependency locks are split by service. Install packages from each service directory.
- The repository describes this project as part of a Clueso internship submission. The Node package metadata lists ISC, but the repository has no root `LICENSE` file.

## Tests

ProductAI test files are in [`ProductAI/tests/`](ProductAI/tests/). The runtime requirements do not include pytest; after you install pytest in the development environment, run the suite from `ProductAI/`:

```sh
python -m pytest tests/ -v
```

## Component documentation

- [Frontend implementation notes](FRONTEND_DOCUMENTATION.md)
- [Node service notes](NODE_LAYER_DOCUMENTATION.md)
- [ProductAI notes](PRODUCTAI_DOCUMENTATION.md)
- [Extension notes](EXTENSION_DOCUMENTATION.md)

**Author:** Abhiram VSA · [GitHub](https://github.com/AbhiramVSA)
