import { useEffect, useRef, useCallback, useState } from 'react';
import { useVideoCallStore } from '../stores/videoCallStore';

interface SignalingMessage {
  type: string;
  [key: string]: unknown;
}

export function useVideoSignaling(consultationId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const store = useVideoCallStore;

  const MAX_RECONNECT_ATTEMPTS = 3;

  const connect = useCallback(() => {
    if (!consultationId) return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws/video-signaling?token=${encodeURIComponent(token)}&consultationId=${encodeURIComponent(consultationId)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    ws.onmessage = (event) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };
  }, [consultationId]);

  const handleMessage = useCallback((msg: SignalingMessage) => {
    const {
      setCallState,
      setSessionId,
      setRemoteUser,
      setIncomingCall,
      addTranscriptSegment,
    } = store.getState();

    switch (msg.type) {
      case 'incoming-call': {
        const session = msg.session as any;
        setIncomingCall({
          sessionId: session?.id as string,
          callerId: session?.caller_id as string,
          callerName: msg.callerName as string,
          callType: session?.call_type as 'video' | 'audio',
          consultationId: session?.consultation_id as string,
        });
        break;
      }

      case 'call-created': {
        const session = msg.session as any;
        setSessionId(session?.id as string);
        break;
      }

      case 'call-accepted': {
        setCallState('connecting');
        setSessionId(msg.sessionId as string);
        setRemoteUser(msg.by as string, null);
        break;
      }

      case 'call-rejected': {
        setCallState('ended');
        break;
      }

      case 'call-ended': {
        setCallState('ended');
        break;
      }

      case 'call-offer': {
        window.dispatchEvent(new CustomEvent('webrtc-offer', { detail: msg }));
        break;
      }

      case 'call-answer': {
        window.dispatchEvent(new CustomEvent('webrtc-answer', { detail: msg }));
        break;
      }

      case 'ice-candidate': {
        window.dispatchEvent(new CustomEvent('webrtc-ice-candidate', { detail: msg }));
        break;
      }

      case 'transcription': {
        addTranscriptSegment({
          id: msg.segmentId as string,
          speakerId: msg.speakerId as string,
          speakerName: msg.speakerName as string | undefined,
          text: msg.text as string,
          language: msg.language as string,
          isFinal: msg.isFinal as boolean,
          timestampMs: msg.timestampMs as number,
        });
        break;
      }

      case 'ringing': {
        setCallState('ringing');
        break;
      }

      default:
        break;
    }
  }, [store]);

  const send = useCallback((message: SignalingMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendOffer = useCallback((offer: RTCSessionDescriptionInit) => {
    const { sessionId } = store.getState();
    send({ type: 'call-offer', sdp: offer.sdp, sdpType: offer.type, sessionId });
  }, [send, store]);

  const sendAnswer = useCallback((answer: RTCSessionDescriptionInit) => {
    const { sessionId } = store.getState();
    send({ type: 'call-answer', sdp: answer.sdp, sdpType: answer.type, sessionId });
  }, [send, store]);

  const sendIceCandidate = useCallback((candidate: RTCIceCandidateInit) => {
    send({ type: 'ice-candidate', candidate });
  }, [send]);

  const initiateCall = useCallback((callType: 'video' | 'audio', calleeId: string) => {
    send({ type: 'call-initiate', callType, calleeId, consultationId });
    store.getState().setCallState('initiating');
    store.getState().setCallType(callType);
  }, [send, consultationId, store]);

  const acceptCall = useCallback((sessionId: string) => {
    send({ type: 'call-accept', sessionId });
    store.getState().setCallState('connecting');
    store.getState().setIncomingCall(null);
  }, [send, store]);

  const rejectCall = useCallback((sessionId: string) => {
    send({ type: 'call-reject', sessionId });
    store.getState().setIncomingCall(null);
  }, [send, store]);

  const hangup = useCallback(() => {
    const { sessionId } = store.getState();
    send({ type: 'call-hangup', sessionId });
    store.getState().setCallState('ended');
  }, [send, store]);

  const sendAudioData = useCallback((audioBase64: string) => {
    const { transcriptionLanguage } = store.getState();
    send({ type: 'audio-data', audio: audioBase64, language: transcriptionLanguage });
  }, [send, store]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [connect]);

  return {
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    initiateCall,
    acceptCall,
    rejectCall,
    hangup,
    sendAudioData,
    isConnected,
  };
}
