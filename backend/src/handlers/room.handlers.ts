import { Server, Socket } from "socket.io";
import {
  createRoom,
  joinRoom,
  getRoom,
  getClientRoom,
  startGame,
  castVote,
  skipTurn,
  resetGame,
  removePlayer,
  findRoomByPlayerId,
} from "../state/rooms";

export function registerRoomHandlers(io: Server, socket: Socket) {
  // CREATE ROOM
  socket.on("create-room", ({ name }) => {
    try {
      if (!name || !name.trim()) {
        socket.emit("error", { message: "Name is required" });
        return;
      }

      const room = createRoom(socket.id, name.trim());
      socket.join(room.roomCode);

      // Send to creator with their private data
      const clientRoom = getClientRoom(room, socket.id);
      socket.emit("room-created", clientRoom);
      socket.emit("room-updated", clientRoom);
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  // JOIN ROOM
  socket.on("join-room", ({ roomCode, name }) => {
    try {
      if (!name || !name.trim()) {
        socket.emit("error", { message: "Name is required" });
        return;
      }
      if (!roomCode || !roomCode.trim()) {
        socket.emit("error", { message: "Room code is required" });
        return;
      }

      const room = joinRoom(roomCode.toUpperCase(), socket.id, name.trim());
      socket.join(roomCode.toUpperCase());

      // Confirm join to this user
      const clientRoom = getClientRoom(room, socket.id);
      socket.emit("joined-room", clientRoom);

      // Broadcast updated room to all players
      for (const p of room.players) {
        io.to(p.id).emit("room-updated", getClientRoom(room, p.id));
      }

      // Notify existing players about new peer for voice chat
      socket.to(roomCode.toUpperCase()).emit("voice:peer-joined", {
        odId: socket.id,
        name: name.trim(),
      });
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  // FETCH ROOM (for refresh/navigation)
  socket.on("get-room", ({ roomCode }) => {
    try {
      const room = getRoom(roomCode);
      if (room) {
        // Re-join socket room in case of reconnect
        socket.join(roomCode);
        const clientRoom = getClientRoom(room, socket.id);
        socket.emit("room-updated", clientRoom);
      } else {
        socket.emit("error", { message: "Room not found" });
      }
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  // START GAME (host only)
  socket.on("start-game", ({ roomCode, mode }) => {
    try {
      const room = getRoom(roomCode);
      if (!room) throw new Error("Room not found");
      if (room.hostId !== socket.id) throw new Error("Only host can start");

      startGame(io, roomCode, mode);
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  // CAST VOTE
  socket.on("cast-vote", ({ roomCode, targetId }) => {
    try {
      castVote(io, roomCode, socket.id, targetId);
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  // SKIP TURN (current speaker only)
  socket.on("skip-turn", ({ roomCode }) => {
    try {
      skipTurn(io, roomCode, socket.id);
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  // RESET GAME (host only)
  socket.on("reset-game", ({ roomCode }) => {
    try {
      const room = getRoom(roomCode);
      if (!room) throw new Error("Room not found");
      if (room.hostId !== socket.id) throw new Error("Only host can reset");

      resetGame(io, roomCode);
    } catch (err) {
      socket.emit("error", { message: (err as Error).message });
    }
  });

  // ============ VOICE CHAT SIGNALING ============

  // WebRTC signaling: relay offer to specific peer
  socket.on("voice:offer", ({ targetId, offer }) => {
    io.to(targetId).emit("voice:offer", {
      fromId: socket.id,
      offer,
    });
  });

  // WebRTC signaling: relay answer to specific peer
  socket.on("voice:answer", ({ targetId, answer }) => {
    io.to(targetId).emit("voice:answer", {
      fromId: socket.id,
      answer,
    });
  });

  // WebRTC signaling: relay ICE candidate
  socket.on("voice:ice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("voice:ice-candidate", {
      fromId: socket.id,
      candidate,
    });
  });

  // Voice mute state broadcast
  socket.on("voice:mute-state", ({ roomCode, isMuted }) => {
    socket.to(roomCode).emit("voice:mute-state", {
      odId: socket.id,
      isMuted,
    });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    try {
      const roomCode = findRoomByPlayerId(socket.id);
      if (roomCode) {
        // Notify others about voice peer leaving
        socket.to(roomCode).emit("voice:peer-left", { odId: socket.id });

        const updated = removePlayer(roomCode, socket.id);
        if (updated) {
          // Broadcast to remaining players
          for (const p of updated.players) {
            io.to(p.id).emit("room-updated", getClientRoom(updated, p.id));
          }
        } else {
          // Room was deleted
          io.to(roomCode).emit("room-deleted", { roomCode });
        }
      }
    } catch (err) {
      console.error("Error during disconnect:", err);
    }
  });
}
