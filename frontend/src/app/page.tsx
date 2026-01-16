"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import { useRouter } from "next/navigation";

type Mode = "infiltrator" | "spy";

export default function HomePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<Mode>("infiltrator");
  const [error, setError] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("error", ({ message }) => {
      setError(message);
      setIsLoading(false);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("error");
    };
  }, []);

  const handleCreateRoom = () => {
    if (!name.trim()) {
      setError("Enter your name to play!");
      return;
    }
    if (name.length > 20) {
      setError("Name too long (max 20 characters)");
      return;
    }

    setError("");
    setIsLoading(true);

    socket.once("room-created", (room) => {
      setIsLoading(false);
      localStorage.setItem("playerName", name.trim());
      router.push(`/room/${room.roomCode}`);
    });

    socket.emit("create-room", { name: name.trim(), mode });
  };

  const handleJoinRoom = () => {
    if (!name.trim()) {
      setError("Enter your name first!");
      return;
    }
    if (!roomCode.trim()) {
      setError("Enter the room code!");
      return;
    }
    if (name.length > 20) {
      setError("Name too long (max 20 characters)");
      return;
    }

    setError("");
    setIsLoading(true);

    socket.once("joined-room", (room) => {
      setIsLoading(false);
      localStorage.setItem("playerName", name.trim());
      router.push(`/room/${room.roomCode}`);
    });

    socket.emit("join-room", {
      name: name.trim(),
      roomCode: roomCode.toUpperCase().trim(),
    });
  };

  return (
    <main className="min-h-screen bg-party relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="decoration-blob w-[500px] h-[500px] bg-purple-500/20 -top-48 -left-48" />
      <div className="decoration-blob w-[400px] h-[400px] bg-pink-500/20 top-1/2 -right-32" />
      <div className="decoration-blob w-[300px] h-[300px] bg-cyan-500/20 -bottom-24 left-1/4" />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8">
        {/* Logo & Title */}
        <div className="text-center mb-8 animate-bounce-in">
          <div className="mb-4 text-6xl sm:text-7xl animate-float">🕵️</div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-2">
            <span className="gradient-text">SHADOW</span>
            <span className="text-white"> SIGNAL</span>
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">
            Find the imposter • Protect your identity
          </p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className="text-xs text-gray-400">
            {isConnected ? "Ready to play" : "Connecting..."}
          </span>
        </div>

        {/* Main Card */}
        <div className="w-full max-w-sm">
          <div className="glass rounded-3xl p-6 sm:p-8 animate-slide-up">
            {/* Name Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-purple-500/50"
                maxLength={20}
                disabled={isLoading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm text-center animate-shake">
                {error}
              </div>
            )}

            {!showJoin ? (
              <>
                {/* Game Mode Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Game Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setMode("infiltrator")}
                      disabled={isLoading}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
                        mode === "infiltrator"
                          ? "border-purple-500 bg-purple-500/20 glow-purple"
                          : "border-white/10 bg-black/20 hover:border-white/20"
                      }`}
                    >
                      <div className="text-2xl mb-1">🎭</div>
                      <div className="font-bold text-sm">Infiltrator</div>
                      <div className="text-xs text-gray-400 mt-1">
                        One has NO word
                      </div>
                    </button>
                    <button
                      onClick={() => setMode("spy")}
                      disabled={isLoading}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
                        mode === "spy"
                          ? "border-pink-500 bg-pink-500/20 glow-pink"
                          : "border-white/10 bg-black/20 hover:border-white/20"
                      }`}
                    >
                      <div className="text-2xl mb-1">🔍</div>
                      <div className="font-bold text-sm">Spy</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Similar words
                      </div>
                    </button>
                  </div>
                </div>

                {/* Create Game Button */}
                <button
                  onClick={handleCreateRoom}
                  disabled={isLoading || !isConnected}
                  className="w-full py-4 btn-primary rounded-xl font-bold text-white text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <span>🚀</span> Create Game
                    </span>
                  )}
                </button>

                {/* Join Option */}
                <div className="mt-4 text-center">
                  <button
                    onClick={() => setShowJoin(true)}
                    className="text-gray-400 hover:text-white transition-colors text-sm"
                    disabled={isLoading}
                  >
                    Have a code?{" "}
                    <span className="text-purple-400 font-medium">
                      Join Game
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Join Game View */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Room Code
                  </label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="XXXXX"
                    className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-500 uppercase focus:border-purple-500/50"
                    maxLength={5}
                    disabled={isLoading}
                  />
                </div>

                <button
                  onClick={handleJoinRoom}
                  disabled={isLoading || !isConnected}
                  className="w-full py-4 btn-success rounded-xl font-bold text-white text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Joining...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <span>🎮</span> Join Game
                    </span>
                  )}
                </button>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => {
                      setShowJoin(false);
                      setRoomCode("");
                      setError("");
                    }}
                    className="text-gray-400 hover:text-white transition-colors text-sm"
                    disabled={isLoading}
                  >
                    ← Back to Create Game
                  </button>
                </div>
              </>
            )}
          </div>

          {/* How to Play */}
          <div
            className="mt-6 glass rounded-2xl p-5 animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
              <span>📖</span> How to Play
            </h3>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start gap-2">
                <span className="text-purple-400">1.</span>
                <span>
                  Everyone gets a <strong>secret word</strong> from the same
                  category
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">2.</span>
                <span>
                  Take turns <strong>describing</strong> your word without
                  saying it
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400">3.</span>
                <span>
                  <strong>Vote</strong> to eliminate the imposter among you
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500">
          3-10 players • Free to play • No account needed
        </div>
      </div>
    </main>
  );
}
