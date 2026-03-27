import { useEffect, useRef, useCallback } from 'react';
import { useVideoCallStore } from '../stores/videoCallStore';
import { videoCallService } from '../services/api/VideoCallService';
import type { useVideoSignaling } from './useVideoSignaling';

type Signaling = ReturnType<typeof useVideoSignaling>;

export function useWebRTC(signaling: Signaling) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);

  const {
    callType,
    consultationId,
    setLocalStream,
    setCallState,
    isScreenSharing,
    toggleScreenSharing,
  } = useVideoCallStore();

  const createPeerConnection = useCallback(async () => {
    if (!consultationId) return null;

    let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      iceServers = await videoCallService.getIceServers(consultationId);
    } catch {
      // fallback to default STUN
    }

    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.sendIceCandidate(event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        useVideoCallStore.getState().setRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        useVideoCallStore.getState().setCallState('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        useVideoCallStore.getState().setCallState('ended');
      }
    };

    pcRef.current = pc;
    return pc;
  }, [consultationId, signaling]);

  const acquireMedia = useCallback(async () => {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === 'video',
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    setLocalStream(stream);
    return stream;
  }, [callType, setLocalStream]);

  const startCall = useCallback(async () => {
    const pc = await createPeerConnection();
    if (!pc) return;

    const stream = await acquireMedia();
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signaling.sendOffer(offer);
    setCallState('ringing');
  }, [createPeerConnection, acquireMedia, signaling, setCallState]);

  const answerCall = useCallback(async () => {
    const pc = await createPeerConnection();
    if (!pc) return;

    const stream = await acquireMedia();
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // The offer will arrive via the webrtc-offer event and be handled below
  }, [createPeerConnection, acquireMedia]);

  const endCall = useCallback(() => {
    signaling.hangup();

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop screen share track if active
    if (originalVideoTrackRef.current) {
      originalVideoTrackRef.current.stop();
      originalVideoTrackRef.current = null;
    }

    const { localStream: currentStream } = useVideoCallStore.getState();
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    useVideoCallStore.getState().resetCall();
  }, [signaling]);

  const toggleMute = useCallback(() => {
    useVideoCallStore.getState().toggleMute();
  }, []);

  const toggleVideo = useCallback(() => {
    useVideoCallStore.getState().toggleVideo();
  }, []);

  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        originalVideoTrackRef.current = sender.track;
        await sender.replaceTrack(screenTrack);
      }

      if (!isScreenSharing) {
        toggleScreenSharing();
      }

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch {
      // user cancelled or error
    }
  }, [isScreenSharing, toggleScreenSharing]);

  const stopScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !originalVideoTrackRef.current) return;

    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) {
      await sender.replaceTrack(originalVideoTrackRef.current);
      originalVideoTrackRef.current = null;
    }

    if (isScreenSharing) {
      toggleScreenSharing();
    }
  }, [isScreenSharing, toggleScreenSharing]);

  // Handle incoming signaling events
  useEffect(() => {
    const handleOffer = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const pc = pcRef.current;
      if (!pc) return;

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: detail.sdpType, sdp: detail.sdp })
      );
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaling.sendAnswer(answer);
    };

    const handleAnswer = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const pc = pcRef.current;
      if (!pc) return;

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: detail.sdpType, sdp: detail.sdp })
      );
    };

    const handleIceCandidate = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const pc = pcRef.current;
      if (!pc) return;

      try {
        await pc.addIceCandidate(new RTCIceCandidate(detail.candidate));
      } catch {
        // ignore ICE candidate errors
      }
    };

    window.addEventListener('webrtc-offer', handleOffer);
    window.addEventListener('webrtc-answer', handleAnswer);
    window.addEventListener('webrtc-ice-candidate', handleIceCandidate);

    return () => {
      window.removeEventListener('webrtc-offer', handleOffer);
      window.removeEventListener('webrtc-answer', handleAnswer);
      window.removeEventListener('webrtc-ice-candidate', handleIceCandidate);
    };
  }, [signaling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      const { localStream: currentStream } = useVideoCallStore.getState();
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    startCall,
    answerCall,
    endCall,
    toggleMute,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
  };
}
