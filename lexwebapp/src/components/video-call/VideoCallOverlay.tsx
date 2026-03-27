import React, { useEffect, useRef } from 'react';
import { useVideoCallStore } from '../../stores/videoCallStore';
import { useVideoSignaling } from '../../hooks/useVideoSignaling';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useSpeechTranscription } from '../../hooks/useSpeechTranscription';
import { VideoCallControls } from './VideoCallControls';
import { TranscriptionPanel } from './TranscriptionPanel';
import { CallNotification } from './CallNotification';

export const VideoCallOverlay: React.FC = () => {
  const {
    callState,
    callType,
    consultationId,
    localStream,
    remoteStream,
    remoteUserName,
    callDuration,
    transcriptionEnabled,
    incomingCall,
    incrementDuration,
  } = useVideoCallStore();

  // Wire up signaling, WebRTC, and transcription hooks
  const signaling = useVideoSignaling(consultationId);
  useWebRTC(signaling);
  useSpeechTranscription(signaling);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        incrementDuration();
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [callState, incrementDuration]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Render incoming call notification
  if (incomingCall && callState === 'idle') {
    return <CallNotification />;
  }

  // Don't render overlay when idle
  if (callState === 'idle') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative w-full h-full md:max-w-[80vw] md:max-h-[80vh] md:rounded-2xl overflow-hidden bg-gray-900 flex">
        {/* Main video area */}
        <div className="flex-1 relative flex items-center justify-center">
          {/* Status overlays */}
          {(callState === 'initiating' || callState === 'ringing') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-900/90">
              <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-6 animate-pulse">
                <div className="w-14 h-14 rounded-full bg-blue-500/40 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-blue-500" />
                </div>
              </div>
              <p className="text-white text-xl font-medium">
                {callState === 'initiating' ? 'Виклик...' : 'Очікування відповіді...'}
              </p>
              {remoteUserName && (
                <p className="text-gray-400 mt-2">{remoteUserName}</p>
              )}
            </div>
          )}

          {callState === 'connecting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-900/90">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-white text-lg">З'єднання...</p>
            </div>
          )}

          {callState === 'ended' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-900/90">
              <p className="text-white text-xl">Дзвінок завершено</p>
              <p className="text-gray-400 mt-2">{formatDuration(callDuration)}</p>
            </div>
          )}

          {/* Remote video (full area) */}
          {callType === 'video' ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center mb-4">
                <span className="text-4xl text-white">
                  {remoteUserName?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>
              <p className="text-white text-lg">{remoteUserName || 'Абонент'}</p>
            </div>
          )}

          {/* Local video PiP (bottom-right) */}
          {localStream && callType === 'video' && (
            <div className="absolute bottom-20 right-4 w-40 h-30 md:w-48 md:h-36 rounded-lg overflow-hidden border-2 border-gray-700 shadow-lg z-20">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
          )}

          {/* Duration timer */}
          {callState === 'connected' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div className="bg-black/60 text-white px-4 py-1.5 rounded-full text-sm font-mono">
                {formatDuration(callDuration)}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
            <VideoCallControls />
          </div>
        </div>

        {/* Transcription panel */}
        {transcriptionEnabled && (
          <div className="w-80 border-l border-gray-700 flex-shrink-0">
            <TranscriptionPanel />
          </div>
        )}
      </div>
    </div>
  );
};
