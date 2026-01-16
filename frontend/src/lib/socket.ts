
// frontend/src/lib/socket.ts
import { io, Socket } from "socket.io-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "https://shadowsignal-production.up.railway.app";

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false,
});
