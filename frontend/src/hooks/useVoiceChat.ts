"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "@/lib/socket";

type PeerConnection = {
  odId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
  audioElement?: HTMLAudioElement;
};

type VoicePeer = {
  odId: string;
  isMuted: boolean;
  isSpeaking: boolean;
};

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
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
    console.log("🎙️ Creating peer connection for:", targetId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("🧊 Sending ICE candidate to:", targetId);
        socket.emit("voice:ice-candidate", {
          targetId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("🔊 Received audio track from:", targetId);
      const stream = event.streams[0];
      if (stream) {
        // Create audio element for playback - IMPORTANT: must add to DOM
        const audio = document.createElement("audio");
        audio.id = `audio-${targetId}`;
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.volume = 1.0;
        
        // Remove existing audio element if any
        const existing = document.getElementById(`audio-${targetId}`);
        if (existing) existing.remove();
        
        // Add to DOM (required for autoplay in many browsers)
        document.body.appendChild(audio);
        
        // Play with user interaction fallback
        audio.play().catch((err) => {
          console.log("Audio autoplay blocked, will play on user interaction:", err);
        });
        
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
        const existingPeer = peersRef.current.get(targetId);
        if (existingPeer) {
          existingPeer.stream = stream;
          existingPeer.audioElement = audio;
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`📡 Connection state for ${targetId}:`, pc.connectionState);
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
      // Remove audio element from DOM
      if (peer.audioElement) {
        peer.audioElement.srcObject = null;
        peer.audioElement.remove();
      }
      peersRef.current.delete(odId);
    }
    analyzersRef.current.delete(odId);
    setVoicePeers((prev) => {
      const next = new Map(prev);
      next.delete(odId);
      return next;
    });
  }, []);

  // Start connection with a peer (initiator side)
  const connectToPeer = useCallback(async (targetId: string) => {
    if (!localStreamRef.current) return;
    if (peersRef.current.has(targetId)) return; // Already connected
    
    console.log("🤝 Initiating connection to peer:", targetId);
    
    const pc = createPeerConnection(targetId);
    peersRef.current.set(targetId, { odId: targetId, connection: pc });
    
    setVoicePeers((prev) => {
      const next = new Map(prev);
      next.set(targetId, { odId: targetId, isMuted: true, isSpeaking: false });
      return next;
    });
    
    // Add local tracks
    localStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });
    
    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    console.log("📤 Sending offer to:", targetId);
    socket.emit("voice:offer", { targetId, offer });
  }, [createPeerConnection]);

  // Initialize voice chat
  const enableVoice = useCallback(async () => {
    try {
      console.log("🎤 Requesting microphone access...");
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

      // Start unmuted so others can hear you
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      setIsMuted(false);

      console.log("✅ Microphone access granted, announcing to room...");
      // Announce to room that we're ready for voice
      socket.emit("voice:ready", { roomCode });

    } catch (err) {
      console.error("Failed to get microphone permission:", err);
      setHasPermission(false);
    }
  }, [roomCode]);

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

    // When another peer is ready for voice, connect to them
    const handlePeerReady = ({ odId }: { odId: string }) => {
      console.log("👋 Peer ready for voice:", odId);
      connectToPeer(odId);
    };

    // Handle existing peers in the room (sent when we join)
    const handleExistingPeers = ({ peers }: { peers: string[] }) => {
      console.log("👥 Existing voice peers:", peers);
      peers.forEach((odId) => connectToPeer(odId));
    };

    const handleOffer = async ({ fromId, offer }: { fromId: string; offer: RTCSessionDescriptionInit }) => {
      console.log("📥 Received offer from:", fromId);
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
      console.log("📤 Sending answer to:", fromId);
      socket.emit("voice:answer", { targetId: fromId, answer });
    };

    const handleAnswer = async ({ fromId, answer }: { fromId: string; answer: RTCSessionDescriptionInit }) => {
      console.log("📥 Received answer from:", fromId);
      const peer = peersRef.current.get(fromId);
      if (peer && peer.connection.signalingState === "have-local-offer") {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleIceCandidate = async ({ fromId, candidate }: { fromId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current.get(fromId);
      if (peer && peer.connection.remoteDescription) {
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
      console.log("👋 Peer left:", odId);
      removePeer(odId);
    };

    socket.on("voice:peer-ready", handlePeerReady);
    socket.on("voice:existing-peers", handleExistingPeers);
    socket.on("voice:offer", handleOffer);
    socket.on("voice:answer", handleAnswer);
    socket.on("voice:ice-candidate", handleIceCandidate);
    socket.on("voice:mute-state", handleMuteState);
    socket.on("voice:peer-left", handlePeerLeft);

    return () => {
      socket.off("voice:peer-ready", handlePeerReady);
      socket.off("voice:existing-peers", handleExistingPeers);
      socket.off("voice:offer", handleOffer);
      socket.off("voice:answer", handleAnswer);
      socket.off("voice:ice-candidate", handleIceCandidate);
      socket.off("voice:mute-state", handleMuteState);
      socket.off("voice:peer-left", handlePeerLeft);
    };
  }, [isVoiceEnabled, createPeerConnection, removePeer, connectToPeer]);

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
