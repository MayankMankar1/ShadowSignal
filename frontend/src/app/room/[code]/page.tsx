"use client";

import { useEffect, useState, useCallback } from "react";
import { socket } from "@/lib/socket";
import { useParams, useRouter } from "next/navigation";
import { useVoiceChat } from "@/hooks/useVoiceChat";

type Player = {
  id: string;
  name: string;
  alive: boolean;
};

type GamePhase = "lobby" | "speaking" | "voting" | "results" | "ended";
type Mode = "infiltrator" | "spy";
type Role = "citizen" | "infiltrator" | "agent" | "spy";

type Room = {
  roomCode: string;
  hostId: string;
  players: Player[];
  mode: Mode;
  phase: GamePhase;
  turnOrder: string[];
  currentTurnIndex: number;
  turnStartTime: number | null;
  turnDuration: number;
  votes: Record<string, string>;
  eliminated: string[];
  lastEliminated: string | null;
  round: number;
  winner: string | null;
  winningPlayers: string[];
  myRole?: Role;
  myWord?: string | null;
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("infiltrator");
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Voice chat hook
  const {
    isVoiceEnabled,
    isMuted,
    speakingPeers,
    hasPermission,
    enableVoice,
    disableVoice,
    toggleMute,
  } = useVoiceChat(roomCode, playerId || "");

  // Timer countdown
  useEffect(() => {
    if (!room || room.phase !== "speaking" || !room.turnStartTime) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const elapsed = Date.now() - room.turnStartTime!;
      const remaining = Math.max(
        0,
        Math.ceil((room.turnDuration - elapsed) / 1000)
      );
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [room?.turnStartTime, room?.phase, room?.turnDuration]);

  // Socket setup
  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      setPlayerId(socket.id ?? null);
      socket.emit("get-room", { roomCode });
    };

    const onRoomUpdated = (updatedRoom: Room) => {
      setRoom(updatedRoom);
      if (updatedRoom.phase === "voting") {
        setSelectedVote(null);
        setHasVoted(false);
      }
    };

    const onPhaseChange = ({ phase }: { phase: GamePhase }) => {
      if (phase === "voting") {
        setSelectedVote(null);
        setHasVoted(false);
      }
    };

    const onError = ({ message }: { message: string }) => {
      setError(message);
      setTimeout(() => setError(""), 3000);
    };

    const onRoomDeleted = () => {
      router.push("/");
    };

    socket.on("connect", onConnect);
    socket.on("room-updated", onRoomUpdated);
    socket.on("phase-change", onPhaseChange);
    socket.on("error", onError);
    socket.on("room-deleted", onRoomDeleted);

    if (socket.connected) {
      setPlayerId(socket.id ?? null);
      socket.emit("get-room", { roomCode });
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("room-updated", onRoomUpdated);
      socket.off("phase-change", onPhaseChange);
      socket.off("error", onError);
      socket.off("room-deleted", onRoomDeleted);
    };
  }, [roomCode, router]);

  const isHost = playerId === room?.hostId;
  const isMyTurn =
    room?.phase === "speaking" &&
    room.turnOrder[room.currentTurnIndex] === playerId;

  const currentSpeaker = room?.turnOrder?.[room?.currentTurnIndex ?? 0];
  const currentSpeakerName = room?.players.find(
    (p) => p.id === currentSpeaker
  )?.name;

  const handleStartGame = useCallback(() => {
    socket.emit("start-game", { roomCode, mode });
  }, [roomCode, mode]);

  const handleSkipTurn = useCallback(() => {
    socket.emit("skip-turn", { roomCode });
  }, [roomCode]);

  const handleVote = useCallback(() => {
    if (!selectedVote) return;
    socket.emit("cast-vote", { roomCode, targetId: selectedVote });
    setHasVoted(true);
  }, [roomCode, selectedVote]);

  const handlePlayAgain = useCallback(() => {
    socket.emit("reset-game", { roomCode });
  }, [roomCode]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomCode]);

  // Loading state
  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-party">
        <div className="text-center animate-bounce-in">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Connecting to room...</p>
        </div>
      </div>
    );
  }

  const getRoleInfo = () => {
    if (!room.myRole) return null;
    const roleConfig: Record<
      Role,
      { emoji: string; label: string; gradient: string; hint: string }
    > = {
      citizen: {
        emoji: "👤",
        label: "Citizen",
        gradient: "from-blue-500 to-cyan-500",
        hint: "You know the word. Find the imposter!",
      },
      infiltrator: {
        emoji: "🎭",
        label: "Infiltrator",
        gradient: "from-red-500 to-orange-500",
        hint: "You have no word. Blend in!",
      },
      agent: {
        emoji: "🕵️",
        label: "Agent",
        gradient: "from-blue-500 to-cyan-500",
        hint: "Find the spy with the different word!",
      },
      spy: {
        emoji: "🔍",
        label: "Spy",
        gradient: "from-red-500 to-orange-500",
        hint: "Your word is similar but different. Be subtle!",
      },
    };
    return roleConfig[room.myRole];
  };

  const roleInfo = getRoleInfo();

  const PlayerCard = ({
    player,
    isCurrentSpeaker = false,
    showVotes = false,
    isVoteTarget = false,
    onSelect,
    disabled = false,
  }: {
    player: Player;
    isCurrentSpeaker?: boolean;
    showVotes?: boolean;
    isVoteTarget?: boolean;
    onSelect?: () => void;
    disabled?: boolean;
  }) => {
    const isSpeaking = speakingPeers.has(player.id);
    const voteCount = showVotes
      ? Object.values(room.votes).filter((v) => v === player.id).length
      : 0;
    const hasPlayerVoted =
      showVotes && room.votes[player.id] !== undefined;

    return (
      <button
        onClick={onSelect}
        disabled={disabled || !onSelect}
        className={`relative w-full p-4 rounded-2xl transition-all duration-300 ${
          isCurrentSpeaker
            ? "bg-gradient-to-r from-yellow-500/30 to-orange-500/30 border-2 border-yellow-500 glow-purple"
            : isVoteTarget
            ? "bg-gradient-to-r from-red-500/30 to-pink-500/30 border-2 border-red-500"
            : "glass hover:bg-white/10"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${
          isSpeaking ? "animate-speaking" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
              player.alive
                ? "bg-gradient-to-br from-purple-500 to-pink-500"
                : "bg-gray-700"
            } ${isSpeaking ? "ring-4 ring-green-500 ring-opacity-50" : ""}`}
          >
            {player.alive ? player.name[0].toUpperCase() : "☠️"}
            {isSpeaking && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-[10px]">🎤</span>
              </div>
            )}
          </div>

          {/* Name & Status */}
          <div className="flex-1 text-left">
            <p
              className={`font-semibold ${
                player.alive ? "text-white" : "text-gray-500 line-through"
              }`}
            >
              {player.name}
              {player.id === playerId && (
                <span className="text-purple-400"> (You)</span>
              )}
            </p>
            <div className="flex items-center gap-2 text-xs">
              {player.id === room.hostId && (
                <span className="text-yellow-400">👑 Host</span>
              )}
              {isCurrentSpeaker && (
                <span className="text-yellow-400">🎙️ Speaking</span>
              )}
              {hasPlayerVoted && (
                <span className="text-green-400">✓ Voted</span>
              )}
            </div>
          </div>

          {/* Vote Count */}
          {showVotes && voteCount > 0 && (
            <div className="px-3 py-1 rounded-full bg-red-500/30 text-red-400 text-sm font-bold">
              {voteCount} 🗳️
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <main className="min-h-screen bg-party relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="decoration-blob w-[400px] h-[400px] bg-purple-500/10 -top-32 -left-32" />
      <div className="decoration-blob w-[300px] h-[300px] bg-pink-500/10 top-1/3 -right-24" />
      <div className="decoration-blob w-[350px] h-[350px] bg-cyan-500/10 -bottom-32 left-1/3" />

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl glass bg-red-500/20 border-red-500/50 text-red-400 text-sm shadow-lg animate-bounce-in">
          {error}
        </div>
      )}

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 glass-dark px-4 py-3 safe-area-top">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <button
              onClick={() => router.push("/")}
              className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
              <span className="text-xl">←</span>
            </button>

            <button
              onClick={handleCopyCode}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:bg-white/10 transition-all"
            >
              <span className="text-lg font-mono font-bold tracking-widest text-white">
                {room.roomCode}
              </span>
              <span className="text-sm">{copied ? "✓" : "📋"}</span>
            </button>

            {/* Voice Controls */}
            <div className="flex items-center gap-2">
              {!isVoiceEnabled ? (
                <button
                  onClick={enableVoice}
                  className="p-2 rounded-xl glass hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                  title="Enable Voice"
                >
                  🔇
                </button>
              ) : (
                <button
                  onClick={toggleMute}
                  className={`p-2 rounded-xl transition-all ${
                    isMuted
                      ? "glass text-gray-400"
                      : "bg-green-500/20 text-green-400 glow-green"
                  }`}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? "🔇" : "🎤"}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 px-4 py-4 pb-24">
          <div className="max-w-lg mx-auto space-y-4">
            {/* Role Card (shown during game) */}
            {roleInfo && room.phase !== "lobby" && (
              <div
                className={`p-5 rounded-2xl bg-gradient-to-r ${roleInfo.gradient} shadow-xl animate-bounce-in`}
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">{roleInfo.emoji}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70 uppercase tracking-wide">
                          Your Role
                        </p>
                        <p className="text-xl font-bold text-white">
                          {roleInfo.label}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/70 uppercase tracking-wide">
                          Your Word
                        </p>
                        <p className="text-xl font-bold text-white">
                          {room.myWord ?? "???"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-white/80">
                      {roleInfo.hint}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* LOBBY PHASE */}
            {room.phase === "lobby" && (
              <>
                {/* Welcome Message */}
                <div className="text-center py-4 animate-slide-up">
                  <div className="text-4xl mb-2 animate-float">🎮</div>
                  <h2 className="text-2xl font-bold text-white mb-1">
                    Waiting for Players
                  </h2>
                  <p className="text-gray-400 text-sm">
                    Share the code with friends to join
                  </p>
                </div>

                {/* Players Grid */}
                <div className="glass rounded-2xl p-4 animate-slide-up">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <span>👥</span> Players ({room.players.length})
                    </h3>
                    <span
                      className={`text-xs px-3 py-1 rounded-full ${
                        room.players.length >= 3
                          ? "bg-green-500/20 text-green-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {room.players.length < 3
                        ? `Need ${3 - room.players.length} more`
                        : "Ready!"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {room.players.map((player) => (
                      <PlayerCard key={player.id} player={player} />
                    ))}
                  </div>
                </div>

                {/* Host Controls */}
                {isHost ? (
                  <div className="glass rounded-2xl p-5 animate-slide-up">
                    <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                      <span>⚙️</span> Game Settings
                    </h3>

                    <div className="mb-5">
                      <label className="block text-sm text-gray-400 mb-3">
                        Game Mode
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setMode("infiltrator")}
                          className={`p-4 rounded-xl border-2 transition-all duration-300 ${
                            mode === "infiltrator"
                              ? "border-purple-500 bg-purple-500/20 glow-purple"
                              : "border-white/10 bg-black/20 hover:border-white/20"
                          }`}
                        >
                          <div className="text-2xl mb-1">🎭</div>
                          <div className="font-bold text-white">Infiltrator</div>
                          <div className="text-xs text-gray-400 mt-1">
                            One has NO word
                          </div>
                        </button>
                        <button
                          onClick={() => setMode("spy")}
                          className={`p-4 rounded-xl border-2 transition-all duration-300 ${
                            mode === "spy"
                              ? "border-pink-500 bg-pink-500/20 glow-pink"
                              : "border-white/10 bg-black/20 hover:border-white/20"
                          }`}
                        >
                          <div className="text-2xl mb-1">🔍</div>
                          <div className="font-bold text-white">Spy</div>
                          <div className="text-xs text-gray-400 mt-1">
                            Similar words
                          </div>
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleStartGame}
                      disabled={room.players.length < 3}
                      className="w-full py-4 btn-success rounded-xl font-bold text-white text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="flex items-center justify-center gap-2">
                         Start Game
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="glass rounded-2xl p-5 text-center animate-slide-up">
                    <div className="text-3xl mb-2 animate-pulse-glow">⏳</div>
                    <p className="text-gray-400">
                      Waiting for host to start the game...
                    </p>
                  </div>
                )}

                {/* Voice Chat Prompt */}
                {!isVoiceEnabled && !hasPermission && (
                  <div className="glass rounded-2xl p-4 animate-slide-up">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">🎤</div>
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          Enable Voice Chat?
                        </p>
                        <p className="text-gray-400 text-sm">
                          Talk with other players in real-time
                        </p>
                      </div>
                      <button
                        onClick={enableVoice}
                        className="px-4 py-2 btn-primary rounded-xl text-white text-sm font-medium"
                      >
                        Enable
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* SPEAKING PHASE */}
            {room.phase === "speaking" && (
              <>
                {/* Timer */}
                <div className="glass rounded-2xl p-5 text-center animate-bounce-in">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                    Round {room.round} • Speaking Phase
                  </p>
                  <div
                    className={`text-6xl font-black font-mono mb-2 ${
                      timeLeft !== null && timeLeft <= 10
                        ? "text-red-400 animate-timer-pulse"
                        : "text-white"
                    }`}
                  >
                    {timeLeft !== null ? timeLeft : "--"}
                  </div>
                  <p className="text-sm text-gray-400">seconds remaining</p>
                </div>

                {/* Current Speaker Highlight */}
                <div
                  className={`p-5 rounded-2xl animate-slide-up ${
                    isMyTurn
                      ? "bg-gradient-to-r from-yellow-500/30 to-orange-500/30 border-2 border-yellow-500"
                      : "glass"
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2">
                      {isMyTurn ? "🎙️" : "👂"}
                    </div>
                    <p className="text-xs text-white/70 uppercase tracking-wide mb-1">
                      {isMyTurn ? "Your Turn!" : "Now Speaking"}
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {isMyTurn ? "Describe your word!" : currentSpeakerName}
                    </p>
                    {isMyTurn && (
                      <button
                        onClick={handleSkipTurn}
                        className="mt-4 px-6 py-2 rounded-xl bg-white/20 text-white text-sm hover:bg-white/30 transition-all"
                      >
                        ✓ Done Speaking
                      </button>
                    )}
                  </div>
                </div>

                {/* Turn Order */}
                <div className="glass rounded-2xl p-4 animate-slide-up">
                  <h3 className="text-sm text-gray-400 mb-3 flex items-center gap-2">
                    <span>📋</span> Turn Order
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {room.turnOrder.map((id, idx) => {
                      const player = room.players.find((p) => p.id === id);
                      const isCurrent = idx === room.currentTurnIndex;
                      const isPast = idx < room.currentTurnIndex;
                      return (
                        <span
                          key={id}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                            isCurrent
                              ? "bg-yellow-500 text-black font-bold animate-pulse-glow"
                              : isPast
                              ? "bg-gray-700/50 text-gray-500 line-through"
                              : "bg-white/10 text-white"
                          }`}
                        >
                          {player?.name}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Players (showing who's speaking) */}
                <div className="glass rounded-2xl p-4 animate-slide-up">
                  <h3 className="text-sm text-gray-400 mb-3 flex items-center gap-2">
                    <span>👥</span> Players
                  </h3>
                  <div className="space-y-2">
                    {room.players.map((player) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        isCurrentSpeaker={player.id === currentSpeaker}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* VOTING PHASE */}
            {room.phase === "voting" && (
              <>
                <div className="glass rounded-2xl p-5 text-center animate-bounce-in">
                  <div className="text-4xl mb-2">🗳️</div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                    Voting Phase
                  </p>
                  <p className="text-xl font-bold text-white">
                    Who is the{" "}
                    {room.mode === "infiltrator" ? "Infiltrator" : "Spy"}?
                  </p>
                </div>

                <div className="glass rounded-2xl p-4 animate-slide-up">
                  <div className="space-y-2">
                    {room.players
                      .filter((p) => p.alive)
                      .map((player) => (
                        <PlayerCard
                          key={player.id}
                          player={player}
                          showVotes
                          isVoteTarget={selectedVote === player.id}
                          onSelect={
                            !hasVoted
                              ? () => setSelectedVote(player.id)
                              : undefined
                          }
                          disabled={hasVoted}
                        />
                      ))}
                  </div>

                  {!hasVoted ? (
                    <button
                      onClick={handleVote}
                      disabled={!selectedVote}
                      className="w-full mt-4 py-4 btn-danger rounded-xl font-bold text-white text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span>🗳️</span> Cast Vote
                      </span>
                    </button>
                  ) : (
                    <div className="mt-4 text-center">
                      <div className="text-2xl mb-2 animate-pulse-glow">⏳</div>
                      <p className="text-gray-400">
                        Waiting for other players...
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* RESULTS PHASE */}
            {room.phase === "results" && (
              <div className="glass rounded-2xl p-6 text-center animate-bounce-in">
                <div className="text-5xl mb-4">💀</div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Elimination Results
                </p>
                {room.lastEliminated && (
                  <p className="text-2xl font-bold text-red-400 mb-2">
                    {room.players.find((p) => p.id === room.lastEliminated)?.name}{" "}
                    was eliminated!
                  </p>
                )}
                <p className="text-gray-400">Next round starting soon...</p>
              </div>
            )}

            {/* ENDED PHASE */}
            {room.phase === "ended" && (
              <div className="glass rounded-2xl p-6 text-center animate-bounce-in">
                <div className="text-6xl mb-4">🏆</div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Game Over
                </p>
                <p className="text-3xl font-black gradient-text mb-4">
                  {room.winner === "citizens" && "Citizens Win!"}
                  {room.winner === "infiltrator" && "Infiltrator Wins!"}
                  {room.winner === "agents" && "Agents Win!"}
                  {room.winner === "spy" && "Spy Wins!"}
                </p>

                {/* Final Roles */}
                <div className="mb-6">
                  <p className="text-sm text-gray-400 mb-3">Final Roles</p>
                  <div className="space-y-2">
                    {room.players.map((player) => {
                      const isWinner = room.winningPlayers.includes(player.id);
                      return (
                        <div
                          key={player.id}
                          className={`p-3 rounded-xl ${
                            isWinner
                              ? "bg-green-500/20 border border-green-500/30"
                              : "bg-white/5"
                          }`}
                        >
                          <span className="text-white font-medium">
                            {player.name}
                          </span>
                          {isWinner && (
                            <span className="ml-2 text-yellow-400">🏆</span>
                          )}
                          {player.id === playerId && room.myRole && (
                            <span className="ml-2 text-gray-400">
                              ({room.myRole})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {isHost && (
                  <button
                    onClick={handlePlayAgain}
                    className="w-full py-4 btn-primary rounded-xl font-bold text-white text-lg shadow-lg"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>🔄</span> Play Again
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
