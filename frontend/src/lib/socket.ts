
// frontend/src/lib/socket.ts
import { io, Socket } from "socket.io-client";

const BACKEND_URL = "http://localhost:4000";

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false,
});
