// backend/src/types.ts

export type Player = {
  id: string; // socket.id
  name: string;
  alive: boolean;
};

export type Role = "citizen" | "infiltrator" | "agent" | "spy";
export type Mode = "infiltrator" | "spy";
export type GamePhase = "lobby" | "speaking" | "voting" | "results" | "ended";

export type Room = {
  roomCode: string;
  hostId: string;
  players: Player[];

  // Game settings
  mode: Mode;
  phase: GamePhase;

  // Role assignments: socketId -> role
  roles: Record<string, Role>;
  // Word assignments: socketId -> word (null for infiltrator)
  words: Record<string, string | null>;

  // Speaking phase
  turnOrder: string[];
  currentTurnIndex: number;
  turnStartTime: number | null; // timestamp when turn started
  turnDuration: number; // milliseconds per turn (default 30000)

  // Voting phase
  votes: Record<string, string>; // voterId -> targetId
  
  // Game progress
  eliminated: string[]; // list of eliminated player ids
  lastEliminated: string | null; // most recently eliminated player
  round: number;

  // End game
  winner: string | null; // "citizens" | "infiltrator" | "agents" | "spy" | null
  winningPlayers: string[]; // ids of winning players
};

// Word dataset types
export type WordEntry = {
  word: string;
  similar: string[];
};

export type Domain = {
  name: string;
  words: WordEntry[];
};

export type WordDataset = {
  domains: Domain[];
};

// Client-safe room (without revealing other players' roles/words)
export type ClientRoom = Omit<Room, "roles" | "words"> & {
  myRole?: Role;
  myWord?: string | null;
};
