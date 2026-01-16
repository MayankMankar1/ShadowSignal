// backend/src/state/rooms.ts

import { Room, Player, Role, Mode, WordDataset, ClientRoom } from "../types";
import { generateRoomCode } from "../utils/generateRoomCode";
import { Server } from "socket.io";
import * as fs from "fs";
import * as path from "path";

// In-memory room store
const rooms = new Map<string, Room>();
// Timers per room (for speaking turns)
const roomTimers = new Map<string, NodeJS.Timeout | null>();

// Load word dataset
const wordsPath = path.join(__dirname, "../data/words.json");
const wordData: WordDataset = JSON.parse(fs.readFileSync(wordsPath, "utf-8"));

const TURN_DURATION = 30 * 1000; // 30 seconds

// Helper functions
function choose<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Get a random word and similar word for spy mode
 */
function getWordPair(): { mainWord: string; similarWord: string } {
  const domain = choose(wordData.domains);
  const entry = choose(domain.words);
  const similarWord = choose(entry.similar);
  return { mainWord: entry.word, similarWord };
}

/**
 * Get a random word for infiltrator mode
 */
function getRandomWord(): string {
  const domain = choose(wordData.domains);
  const entry = choose(domain.words);
  return entry.word;
}

/**
 * Create client-safe room data (hide other players' roles/words)
 */
export function getClientRoom(room: Room, playerId: string): ClientRoom {
  const { roles, words, ...safeRoom } = room;
  return {
    ...safeRoom,
    myRole: roles[playerId],
    myWord: words[playerId],
  };
}

/**
 * Create a new room and add host as first player
 */
export function createRoom(hostId: string, hostName: string): Room {
  const roomCode = generateRoomCode();

  const hostPlayer: Player = {
    id: hostId,
    name: hostName,
    alive: true,
  };

  const room: Room = {
    roomCode,
    hostId,
    players: [hostPlayer],
    mode: "infiltrator",
    phase: "lobby",
    roles: {},
    words: {},
    turnOrder: [],
    currentTurnIndex: 0,
    turnStartTime: null,
    turnDuration: TURN_DURATION,
    votes: {},
    eliminated: [],
    lastEliminated: null,
    round: 1,
    winner: null,
    winningPlayers: [],
  };

  rooms.set(roomCode, room);
  roomTimers.set(roomCode, null);
  return room;
}

/**
 * Join an existing room
 */
export function joinRoom(
  roomCode: string,
  playerId: string,
  playerName: string
): Room {
  const room = rooms.get(roomCode);

  if (!room) {
    throw new Error("Room not found");
  }

  if (room.phase !== "lobby") {
    throw new Error("Game already in progress");
  }

  const nameExists = room.players.some(
    (player) => player.name.toLowerCase() === playerName.toLowerCase()
  );

  if (nameExists) {
    throw new Error("Name already taken");
  }

  const newPlayer: Player = {
    id: playerId,
    name: playerName,
    alive: true,
  };

  room.players.push(newPlayer);
  return room;
}

/**
 * Get room by code
 */
export function getRoom(roomCode: string): Room | undefined {
  return rooms.get(roomCode);
}

/**
 * Find room code by player id
 */
export function findRoomByPlayerId(playerId: string): string | undefined {
  for (const [code, room] of rooms) {
    if (room.players.some((p) => p.id === playerId)) return code;
  }
  return undefined;
}

/**
 * Remove player (on disconnect)
 */
export function removePlayer(
  roomCode: string,
  playerId: string
): Room | undefined {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.players = room.players.filter((p) => p.id !== playerId);

  // If room becomes empty, delete it and clear timer
  if (room.players.length === 0) {
    rooms.delete(roomCode);
    const t = roomTimers.get(roomCode);
    if (t) clearTimeout(t);
    roomTimers.delete(roomCode);
    return;
  }

  // If host left, assign new host
  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
  }

  return room;
}

/**
 * Start the game: assign roles and words, set speaking turn order
 */
export function startGame(io: Server, roomCode: string, mode: Mode) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");

  if (room.players.length < 3) {
    throw new Error("Need at least 3 players to start");
  }

  room.mode = mode;
  room.phase = "speaking";
  room.round = 1;

  // Reset state
  room.roles = {};
  room.words = {};
  room.votes = {};
  room.eliminated = [];
  room.lastEliminated = null;
  room.winner = null;
  room.winningPlayers = [];

  // Reset all players to alive
  room.players.forEach((p) => (p.alive = true));

  // Choose special player randomly
  const playerIds = room.players.map((p) => p.id);
  const shuffledIds = shuffle(playerIds);
  const specialPlayerId = shuffledIds[0];

  if (mode === "infiltrator") {
    // Infiltrator mode: one player gets no word, others get the same word
    const secretWord = getRandomWord();
    for (const p of room.players) {
      if (p.id === specialPlayerId) {
        room.roles[p.id] = "infiltrator";
        room.words[p.id] = null;
      } else {
        room.roles[p.id] = "citizen";
        room.words[p.id] = secretWord;
      }
    }
  } else {
    // Spy mode: spy gets similar word, agents get main word
    const { mainWord, similarWord } = getWordPair();
    for (const p of room.players) {
      if (p.id === specialPlayerId) {
        room.roles[p.id] = "spy";
        room.words[p.id] = similarWord;
      } else {
        room.roles[p.id] = "agent";
        room.words[p.id] = mainWord;
      }
    }
  }

  // Shuffle turn order
  room.turnOrder = shuffle(playerIds);
  room.currentTurnIndex = 0;
  room.turnStartTime = Date.now();

  // Broadcast game started with private data
  broadcastRoomUpdate(io, room);

  // Start speaking timer
  startTurnTimer(io, roomCode);
}

/**
 * Broadcast room update to all players with their private data
 */
function broadcastRoomUpdate(io: Server, room: Room) {
  for (const p of room.players) {
    const clientRoom = getClientRoom(room, p.id);
    io.to(p.id).emit("room-updated", clientRoom);
  }
}

/**
 * Start turn timer
 */
function startTurnTimer(io: Server, roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Clear existing timer
  const existing = roomTimers.get(roomCode);
  if (existing) clearTimeout(existing);

  room.turnStartTime = Date.now();
  broadcastRoomUpdate(io, room);

  const t = setTimeout(() => {
    advanceTurn(io, roomCode);
  }, room.turnDuration);

  roomTimers.set(roomCode, t);
}

/**
 * Skip to next turn (called by current speaker or automatically)
 */
export function skipTurn(io: Server, roomCode: string, playerId: string) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");
  if (room.phase !== "speaking") throw new Error("Not in speaking phase");

  // Only current speaker can skip
  const currentSpeakerId = room.turnOrder[room.currentTurnIndex];
  if (playerId !== currentSpeakerId) {
    throw new Error("Not your turn");
  }

  advanceTurn(io, roomCode);
}

/**
 * Advance to next turn or voting phase
 */
function advanceTurn(io: Server, roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Clear timer
  const existing = roomTimers.get(roomCode);
  if (existing) clearTimeout(existing);

  room.currentTurnIndex++;

  // Get alive players in turn order
  const aliveTurnOrder = room.turnOrder.filter((id) => {
    const p = room.players.find((pl) => pl.id === id);
    return p && p.alive;
  });

  if (room.currentTurnIndex >= aliveTurnOrder.length) {
    // All players have spoken -> move to voting
    room.phase = "voting";
    room.votes = {};
    room.turnStartTime = null;
    broadcastRoomUpdate(io, room);
    io.to(room.roomCode).emit("phase-change", { phase: "voting" });
    return;
  }

  // Update turn order to only alive players
  room.turnOrder = aliveTurnOrder;
  startTurnTimer(io, roomCode);
}

/**
 * Handle a cast vote
 */
export function castVote(
  io: Server,
  roomCode: string,
  voterId: string,
  targetId: string
) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");
  if (room.phase !== "voting") throw new Error("Not in voting phase");

  // Check voter is alive
  const voter = room.players.find((p) => p.id === voterId);
  if (!voter || !voter.alive) throw new Error("You cannot vote");

  // Check target is alive
  const target = room.players.find((p) => p.id === targetId);
  if (!target || !target.alive) throw new Error("Invalid vote target");

  room.votes[voterId] = targetId;

  // Count votes from alive players
  const alivePlayers = room.players.filter((p) => p.alive);
  const voteCount = Object.keys(room.votes).length;

  broadcastRoomUpdate(io, room);

  if (voteCount >= alivePlayers.length) {
    // All votes in - tally and eliminate
    processVotes(io, room);
  }
}

/**
 * Process votes and eliminate player
 */
function processVotes(io: Server, room: Room) {
  // Tally votes
  const tally: Record<string, number> = {};
  for (const targetId of Object.values(room.votes)) {
    tally[targetId] = (tally[targetId] || 0) + 1;
  }

  // Find player with most votes (random tiebreaker)
  let maxVotes = 0;
  let candidates: string[] = [];

  for (const [playerId, votes] of Object.entries(tally)) {
    if (votes > maxVotes) {
      maxVotes = votes;
      candidates = [playerId];
    } else if (votes === maxVotes) {
      candidates.push(playerId);
    }
  }

  // Random tiebreaker
  const eliminatedId = choose(candidates);

  // Eliminate player
  const eliminated = room.players.find((p) => p.id === eliminatedId);
  if (eliminated) {
    eliminated.alive = false;
    room.eliminated.push(eliminatedId);
    room.lastEliminated = eliminatedId;
  }

  // Check win conditions
  const winner = checkWinCondition(room);

  if (winner) {
    room.phase = "ended";
    room.winner = winner;
    room.winningPlayers = getWinningPlayers(room, winner);

    // Clear timer
    const t = roomTimers.get(room.roomCode);
    if (t) clearTimeout(t);
    roomTimers.set(room.roomCode, null);

    broadcastRoomUpdate(io, room);
    io.to(room.roomCode).emit("game-ended", {
      winner,
      winningPlayers: room.winningPlayers,
      eliminatedPlayer: eliminated?.name,
      eliminatedRole: room.roles[eliminatedId],
    });
    return;
  }

  // Show results phase briefly, then continue
  room.phase = "results";
  broadcastRoomUpdate(io, room);

  // After 5 seconds, start next round
  setTimeout(() => {
    startNextRound(io, room);
  }, 5000);
}

/**
 * Check win condition
 */
function checkWinCondition(room: Room): string | null {
  const alivePlayers = room.players.filter((p) => p.alive);
  const aliveCount = alivePlayers.length;

  if (room.mode === "infiltrator") {
    const infiltratorId = Object.entries(room.roles).find(
      ([, r]) => r === "infiltrator"
    )?.[0];
    if (!infiltratorId) return null;

    const infiltratorAlive = alivePlayers.some((p) => p.id === infiltratorId);

    // Infiltrator eliminated -> Citizens win
    if (!infiltratorAlive) return "citizens";

    // Only 2 players left and infiltrator alive -> Infiltrator wins
    if (aliveCount <= 2 && infiltratorAlive) return "infiltrator";
  } else {
    // Spy mode
    const spyId = Object.entries(room.roles).find(
      ([, r]) => r === "spy"
    )?.[0];
    if (!spyId) return null;

    const spyAlive = alivePlayers.some((p) => p.id === spyId);

    // Spy eliminated -> Agents win
    if (!spyAlive) return "agents";

    // Only 2 players left and spy alive -> Spy wins
    if (aliveCount <= 2 && spyAlive) return "spy";
  }

  return null;
}

/**
 * Get winning player IDs
 */
function getWinningPlayers(room: Room, winner: string): string[] {
  if (winner === "citizens") {
    return Object.entries(room.roles)
      .filter(([, r]) => r === "citizen")
      .map(([id]) => id);
  }
  if (winner === "infiltrator") {
    return Object.entries(room.roles)
      .filter(([, r]) => r === "infiltrator")
      .map(([id]) => id);
  }
  if (winner === "agents") {
    return Object.entries(room.roles)
      .filter(([, r]) => r === "agent")
      .map(([id]) => id);
  }
  if (winner === "spy") {
    return Object.entries(room.roles)
      .filter(([, r]) => r === "spy")
      .map(([id]) => id);
  }
  return [];
}

/**
 * Start next round
 */
function startNextRound(io: Server, room: Room) {
  room.round++;
  room.phase = "speaking";
  room.votes = {};
  room.lastEliminated = null;

  // Rebuild turn order with only alive players, shuffled
  const alivePlayers = room.players.filter((p) => p.alive);
  room.turnOrder = shuffle(alivePlayers.map((p) => p.id));
  room.currentTurnIndex = 0;

  broadcastRoomUpdate(io, room);
  io.to(room.roomCode).emit("phase-change", { phase: "speaking", round: room.round });

  startTurnTimer(io, room.roomCode);
}

/**
 * Reset game to lobby (host only)
 */
export function resetGame(io: Server, roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");

  // Clear timer
  const t = roomTimers.get(roomCode);
  if (t) clearTimeout(t);
  roomTimers.set(roomCode, null);

  // Reset all state
  room.phase = "lobby";
  room.roles = {};
  room.words = {};
  room.turnOrder = [];
  room.currentTurnIndex = 0;
  room.turnStartTime = null;
  room.votes = {};
  room.eliminated = [];
  room.lastEliminated = null;
  room.round = 1;
  room.winner = null;
  room.winningPlayers = [];

  // Reset all players to alive
  room.players.forEach((p) => (p.alive = true));

  broadcastRoomUpdate(io, room);
}
