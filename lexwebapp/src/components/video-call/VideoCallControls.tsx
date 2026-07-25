import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Languages,
  MessageSquare,
} from 'lucide-react';
import { useVideoCallStore } from '../../stores/videoCallStore';

interface VideoCallControlsProps {
  onEndCall?: () => void;
  onToggleScreenShare?: (start: boolean) => void;
}

export const VideoCallControls: React.FC<VideoCallControlsProps> = ({
  onEndCall,
  onToggleScreenShare,
}) => {
  const {
    isMuted,
    isVideoOff,
    isScreenSharing,
    transcriptionEnabled,
    transcriptionLanguage,
    callType,
    toggleMute,
    toggleVideo,
    toggleScreenSharing,
    toggleTranscription,
    setTranscriptionLanguage,
  } = useVideoCallStore();

  const [showLangDropdown, setShowLangDropdown] = useState(false);

  const handleEndCall = () => {
    onEndCall?.();
  };

  const handleScreenShare = () => {
    onToggleScreenShare?.(!isScreenSharing);
    toggleScreenSharing();
  };

  const handleLanguageChange = (lang: 'uk' | 'ru') => {
    setTranscriptionLanguage(lang);
    setShowLangDropdown(false);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Mute/Unmute */}
      <button
        onClick={toggleMute}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
          isMuted
            ? 'bg-red-500/80 hover:bg-red-500 text-white'
            : 'bg-gray-700/80 hover:bg-gray-600 text-white'
        }`}
        title={isMuted ? 'Увімкнути мікрофон' : 'Вимкнути мікрофон'}
      >
        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>

      {/* Video toggle (only for video calls) */}
      {callType === 'video' && (
        <button
          onClick={toggleVideo}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isVideoOff
              ? 'bg-red-500/80 hover:bg-red-500 text-white'
              : 'bg-gray-700/80 hover:bg-gray-600 text-white'
          }`}
          title={isVideoOff ? 'Увімкнути камеру' : 'Вимкнути камеру'}
        >
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
      )}

      {/* Screen share */}
      <button
        onClick={handleScreenShare}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
          isScreenSharing
            ? 'bg-blue-500/80 hover:bg-blue-500 text-white'
            : 'bg-gray-700/80 hover:bg-gray-600 text-white'
        }`}
        title={isScreenSharing ? 'Зупинити демонстрацію' : 'Демонстрація екрану'}
      >
        {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
      </button>

      {/* Transcription toggle */}
      <button
        onClick={toggleTranscription}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
          transcriptionEnabled
            ? 'bg-blue-500/80 hover:bg-blue-500 text-white'
            : 'bg-gray-700/80 hover:bg-gray-600 text-white'
        }`}
        title={transcriptionEnabled ? 'Вимкнути транскрипцію' : 'Увімкнути транскрипцію'}
      >
        <MessageSquare size={20} />
      </button>

      {/* Language selector */}
      <div className="relative">
        <button
          onClick={() => setShowLangDropdown(!showLangDropdown)}
          className="w-12 h-12 rounded-full bg-gray-700/80 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
          title="Мова транскрипції"
        >
          <Languages size={20} />
        </button>

        {showLangDropdown && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[100px]">
            <button
              onClick={() => handleLanguageChange('uk')}
              className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-700 transition-colors ${
                transcriptionLanguage === 'uk' ? 'text-blue-400' : 'text-white'
              }`}
            >
              Українська
            </button>
            <button
              onClick={() => handleLanguageChange('ru')}
              className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-700 transition-colors ${
                transcriptionLanguage === 'ru' ? 'text-blue-400' : 'text-white'
              }`}
            >
              Російська
            </button>
          </div>
        )}
      </div>

      {/* Hang up */}
      <button
        onClick={handleEndCall}
        className="w-14 h-12 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
        title="Завершити дзвінок"
      >
        <PhoneOff size={22} />
      </button>
    </div>
  );
};
