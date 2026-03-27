import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useVideoCallStore } from '../../stores/videoCallStore';

const AUTO_DISMISS_MS = 30_000;

export const CallNotification: React.FC = () => {
  const { incomingCall, setIncomingCall, setCallState, setSessionId, setRemoteUser, setCallType } =
    useVideoCallStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!incomingCall) return;

    timerRef.current = setTimeout(() => {
      // Auto-dismiss after 30 seconds (missed call)
      setIncomingCall(null);
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [incomingCall, setIncomingCall]);

  if (!incomingCall) return null;

  const handleAccept = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSessionId(incomingCall.sessionId);
    setRemoteUser(incomingCall.callerId, incomingCall.callerName);
    setCallType(incomingCall.callType);
    setCallState('connecting');
    setIncomingCall(null);
    // The actual WebRTC accept is handled by the parent via signaling.acceptCall
    window.dispatchEvent(
      new CustomEvent('video-call-accept', { detail: incomingCall })
    );
  };

  const handleReject = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIncomingCall(null);
    window.dispatchEvent(
      new CustomEvent('video-call-reject', { detail: incomingCall })
    );
  };

  const isVideoCall = incomingCall.callType === 'video';
  const callLabel = isVideoCall
    ? `Вхідний відеодзвінок від ${incomingCall.callerName}`
    : `Вхідний аудіодзвінок від ${incomingCall.callerName}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
        {/* Pulsing ring animation */}
        <div className="relative mx-auto mb-6 w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
          <div className="absolute inset-2 rounded-full bg-green-500/30 animate-pulse" />
          <div className="relative w-16 h-16 rounded-full bg-green-500/40 flex items-center justify-center">
            {isVideoCall ? (
              <Video size={28} className="text-white" />
            ) : (
              <Phone size={28} className="text-white" />
            )}
          </div>
        </div>

        {/* Caller info */}
        <p className="text-white text-lg font-medium mb-2">{callLabel}</p>
        <p className="text-gray-400 text-sm mb-8">
          {isVideoCall ? 'Відеодзвінок' : 'Аудіодзвінок'}
        </p>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-8">
          {/* Reject */}
          <button
            onClick={handleReject}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-lg"
            title="Відхилити"
          >
            <PhoneOff size={24} />
          </button>

          {/* Accept */}
          <button
            onClick={handleAccept}
            className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-500 text-white flex items-center justify-center transition-colors shadow-lg"
            title="Прийняти"
          >
            <Phone size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
