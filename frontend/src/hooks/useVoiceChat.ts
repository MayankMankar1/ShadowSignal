"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "@/lib/socket";

type PeerConnection = {
  odId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
};

type VoicePeer = {
  odId: string;
  isMuted: boolean;
  isSpeaking: boolean;
};

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useVoiceChat(roomCode: string, playerId: string) {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [voicePeers, setVoicePeers] = useState<Map<string, VoicePeer>>(new Map());
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzersRef = useRef<Map<string, AnalyserNode>>(new Map());

  // Create peer connection
  const createPeerConnection = useCallback((targetId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("voice:ice-candidate", {
          targetId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        // Create audio element for playback
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
        
        // Set up volume analyzer for speaking detection
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const audioContext = audioContextRef.current;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyzersRef.current.set(targetId, analyser);

        // Update peer state
        const existing = peersRef.current.get(targetId);
        if (existing) {
          existing.stream = stream;
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        removePeer(targetId);
      }
    };

    return pc;
  }, []);

  // Remove peer
  const removePeer = useCallback((odId: string) => {
    const peer = peersRef.current.get(odId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(odId);
    }
    analyzersRef.current.delete(odId);
    setVoicePeers((prev) => {
      const next = new Map(prev);
      next.delete(odId);
      return next;
    });
  }, []);

  // Initialize voice chat
  const enableVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;
      setHasPermission(true);
      setIsVoiceEnabled(true);

      // Mute by default
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });

      // Announce to room that we're ready for voice
      socket.emit("voice:ready", { roomCode });

    } catch (err) {
      console.error("Failed to get microphone permission:", err);
      setHasPermission(false);
    }
  }, [roomCode, createPeerConnection]);

  // Disable voice chat
  const disableVoice = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    peersRef.current.forEach((peer) => peer.connection.close());
    peersRef.current.clear();
    analyzersRef.current.clear();

    setIsVoiceEnabled(false);
    setVoicePeers(new Map());
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !newMuted;
    });
    setIsMuted(newMuted);
    socket.emit("voice:mute-state", { roomCode, isMuted: newMuted });
  }, [isMuted, roomCode]);

  // Handle incoming voice signals
  useEffect(() => {
    if (!isVoiceEnabled) return;

    const handleOffer = async ({ fromId, offer }: { fromId: string; offer: RTCSessionDescriptionInit }) => {
      let peer = peersRef.current.get(fromId);
      if (!peer) {
        const pc = createPeerConnection(fromId);
        peer = { odId: fromId, connection: pc };
        peersRef.current.set(fromId, peer);
        setVoicePeers((prev) => {
          const next = new Map(prev);
          next.set(fromId, { odId: fromId, isMuted: true, isSpeaking: false });
          return next;
        });
      }

      await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));

      // Add local tracks if available
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          const senders = peer!.connection.getSenders();
          const alreadyAdded = senders.some((s) => s.track === track);
          if (!alreadyAdded) {
            peer!.connection.addTrack(track, localStreamRef.current!);
          }
        });
      }

      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      socket.emit("voice:answer", { targetId: fromId, answer });
    };

    const handleAnswer = async ({ fromId, answer }: { fromId: string; answer: RTCSessionDescriptionInit }) => {
      const peer = peersRef.current.get(fromId);
      if (peer) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleIceCandidate = async ({ fromId, candidate }: { fromId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current.get(fromId);
      if (peer) {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const handleMuteState = ({ odId, isMuted }: { odId: string; isMuted: boolean }) => {
      setVoicePeers((prev) => {
        const next = new Map(prev);
        const peer = next.get(odId);
        if (peer) {
          next.set(odId, { ...peer, isMuted });
        }
        return next;
      });
    };

    const handlePeerLeft = ({ odId }: { odId: string }) => {
      removePeer(odId);
    };

    socket.on("voice:offer", handleOffer);
    socket.on("voice:answer", handleAnswer);
    socket.on("voice:ice-candidate", handleIceCandidate);
    socket.on("voice:mute-state", handleMuteState);
    socket.on("voice:peer-left", handlePeerLeft);

    return () => {
      socket.off("voice:offer", handleOffer);
      socket.off("voice:answer", handleAnswer);
      socket.off("voice:ice-candidate", handleIceCandidate);
      socket.off("voice:mute-state", handleMuteState);
      socket.off("voice:peer-left", handlePeerLeft);
    };
  }, [isVoiceEnabled, createPeerConnection, removePeer]);

  // Speaking detection loop
  useEffect(() => {
    if (!isVoiceEnabled) return;

    const detectSpeaking = () => {
      const speaking = new Set<string>();
      
      analyzersRef.current.forEach((analyser, odId) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        if (average > 30) {
          speaking.add(odId);
        }
      });

      setSpeakingPeers(speaking);
    };

    const interval = setInterval(detectSpeaking, 100);
    return () => clearInterval(interval);
  }, [isVoiceEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disableVoice();
    };
  }, [disableVoice]);

  return {
    isVoiceEnabled,
    isMuted,
    voicePeers,
    speakingPeers,
    hasPermission,
    enableVoice,
    disableVoice,
    toggleMute,
  };
}
