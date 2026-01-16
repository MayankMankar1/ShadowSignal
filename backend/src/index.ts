// backend/src/index.ts

import express from "express";
import http from "http";
import cors from "cors";
import { initSocket } from "./socket";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Basic health check (optional but useful)
app.get("/", (_req, res) => {
  res.send("Shadow Signal backend is running");
});

// Create HTTP server
const server = http.createServer(app);

// Initialize socket.io
initSocket(server);

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});
