// backend/src/socket.ts

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { registerRoomHandlers } from "./handlers/room.handlers";

let io: Server;

/**
 * Initialize Socket.io server
 */
export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: "*", // allow frontend connections (lock later)
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log("🔌 Client connected:", socket.id);

    // Register all socket event handlers
    registerRoomHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });
}

/**
 * Optional getter if needed later
 */
export function getIO() {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}
