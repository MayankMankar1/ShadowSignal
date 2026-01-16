# 🕵️ Shadow Signal

A real-time multiplayer social deduction party game built with modern web technologies.

![Game Modes](https://img.shields.io/badge/Modes-Infiltrator%20%7C%20Spy-purple)
![Players](https://img.shields.io/badge/Players-3--10-green)
![Real-time](https://img.shields.io/badge/Real--time-Socket.io-blue)

---

##  Table of Contents

- [Game Overview](#-game-overview)
- [Architecture](#-architecture)
- [Real-time Logic](#-real-time-logic)
- [AI Integration](#-ai-integration)
- [Tech Stack](#-tech-stack)
- [Setup & Installation](#-setup--installation)
- [Deployment](#-deployment)

---

##  Game Overview

Shadow Signal is a social deduction game where players try to identify the imposter among them. Each player receives a secret word from the same category, except for the imposter who either has no word (Infiltrator mode) or a similar but different word (Spy mode).

### Game Modes

| Mode | Description |
|------|-------------|
|  **Infiltrator** | One player has NO word and must blend in by listening to others |
|  **Spy** | One player has a SIMILAR word and must avoid detection |

### Game Flow

```
LOBBY → SPEAKING → VOTING → RESULTS
         ↓           ↓         ↓
    (30s/turn)   (All vote)  (Eliminate)
                               ↓
              ┌────────────────┴────────────────┐
              ↓                                 ↓
        Game Continues                     Game Ends
        (Next Round)                   (Winner Declared)
```

---

## 🏗 Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Next.js Frontend                         │  │
│  │                                                        │  │
│  │   Home Page        Room Page         Voice Chat        │  │
│  │   (Create/Join)    (Game UI)         (WebRTC P2P)      │  │
│  │                                                        │  │
│  │                    Socket.io Client                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                   WebSocket Connection
                            │
┌─────────────────────────────────────────────────────────────┐
│                      SERVER                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Express + Socket.io                       │  │
│  │                                                        │  │
│  │  Room Handlers    Game State       Voice Signaling     │  │
│  │  - create-room    - rooms Map      - offer/answer      │  │
│  │  - join-room      - players        - ICE candidates    │  │
│  │  - start-game     - phases         - mute states       │  │
│  │  - cast-vote      - votes                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  In-Memory Store                       │  │
│  │  rooms: Map<roomCode, Room>                            │  │
│  │  - hostId, players[], phase, turnOrder, votes, etc.    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
shadow-signal/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server entry
│   │   ├── socket.ts             # Socket.io initialization
│   │   ├── types.ts              # TypeScript interfaces
│   │   ├── handlers/
│   │   │   └── room.handlers.ts  # All socket event handlers
│   │   ├── state/
│   │   │   └── rooms.ts          # Game state management
│   │   └── utils/
│   │       └── generateRoomCode.ts
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Home (Create/Join)
│   │   │   ├── room/[code]/
│   │   │   │   └── page.tsx      # Game room UI
│   │   │   ├── globals.css       # Party game styling
│   │   │   └── layout.tsx
│   │   ├── lib/
│   │   │   └── socket.ts         # Socket client singleton
│   │   └── hooks/
│   │       └── useVoiceChat.ts   # WebRTC voice chat
│   └── package.json
│
└── README.md
```

---

##  Real-time Logic

### Socket.io Event Flow

The game uses **bidirectional WebSocket communication** for instant updates across all connected clients.

#### Key Socket Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `create-room` | Client → Server | Host creates a new game room |
| `join-room` | Client → Server | Player joins with room code |
| `room-updated` | Server → All | Broadcast state changes |
| `start-game` | Client → Server | Host starts the game |
| `skip-turn` | Client → Server | Player finishes speaking |
| `cast-vote` | Client → Server | Player votes for suspect |
| `reset-game` | Client → Server | Host restarts game |

### State Synchronization

```typescript
// Server broadcasts sanitized state to each player
function broadcastRoomState(room: Room) {
  room.players.forEach(player => {
    const clientRoom = sanitizeForPlayer(room, player.id);
    // Each player only sees their own role/word
    io.to(player.id).emit('room-updated', clientRoom);
  });
}
```

### Turn Timer Logic

```typescript
// 30-second countdown per player
const TURN_DURATION = 30000;

function startTurnTimer(roomCode: string) {
  room.turnStartTime = Date.now();
  
  setTimeout(() => {
    advanceToNextTurn(roomCode);
    // Auto-advance when timer expires
  }, TURN_DURATION);
}
```

### Voice Chat Signaling

Voice chat uses **WebRTC for peer-to-peer audio** with Socket.io as the signaling server:

```
Player A              Server              Player B
    │                    │                    │
    │── voice:offer ────▶│                    │
    │                    │── voice:offer ────▶│
    │                    │                    │
    │                    │◀── voice:answer ───│
    │◀── voice:answer ───│                    │
    │                    │                    │
    │◀════════ P2P Audio Stream ════════════▶│
```

---

##  AI Integration

### Development Process

This entire project was **built with AI assistance** using GitHub Copilot (Claude). The AI was used for:

| Area | How AI Helped |
|------|---------------|
| **Architecture** | Client-server pattern, Socket.io, state machine design |
| **Code Generation** | TypeScript interfaces, handlers, React components |
| **UI/UX Design** | Party game aesthetic, animations, glassmorphism |
| **Game Logic** | Word datasets, role assignment, win conditions |
| **Bug Fixing** | Race conditions, type errors, WebRTC issues |

### AI-Assisted Workflow

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│  Describe  │───▶│ AI Writes  │───▶│   Human    │───▶│  Iterate   │
│  Feature   │    │   Code     │    │  Reviews   │    │ & Refine   │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
```

### Potential Future AI Features

| Feature | Description |
|---------|-------------|
| **AI Players** | Bot players that can describe words and vote |
| **Smart Words** | LLMs generate contextual word pairs |
| **Cheat Detection** | Analyze if players reveal too much |
| **Dynamic Difficulty** | Adjust word similarity by skill |

---

## 🛠 Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| Next.js 15 | React framework with App Router |
| React 19 | UI components |
| TypeScript | Type safety |
| Tailwind CSS v4 | Styling |
| Socket.io Client | Real-time communication |
| WebRTC | Peer-to-peer voice chat |

### Backend

| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| Express | HTTP server |
| Socket.io | WebSocket server |
| TypeScript | Type safety |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Vercel | Frontend hosting |
| Railway | Backend hosting |
| GitHub | Version control |

---

## Setup & Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/shadow-signal.git
cd shadow-signal

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Start backend (Terminal 1)
cd backend
npm run dev

# Start frontend (Terminal 2)
cd frontend
npm run dev
```

Open `http://localhost:3000` to play!

---

##  Deployment

### Environment Variables

**Frontend (.env.local)**
```
NEXT_PUBLIC_SOCKET_URL=https://your-backend-url.com
```

**Backend**
```
PORT=4000
```

### Deploy to Vercel + Railway

1. Push code to GitHub
2. Deploy backend to Railway (set root to `backend`)
3. Deploy frontend to Vercel (set root to `frontend`)
4. Add environment variables
5. Play! 

---

## 📄 License

MIT License - Feel free to use, modify, and distribute.

---

Built with ❤️ using AI-assisted development (GitHub Copilot / Claude)
