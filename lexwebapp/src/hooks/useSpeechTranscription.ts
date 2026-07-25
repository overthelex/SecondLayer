import { useEffect, useRef, useState } from 'react';
import { useVideoCallStore } from '../stores/videoCallStore';
import type { useVideoSignaling } from './useVideoSignaling';

type Signaling = ReturnType<typeof useVideoSignaling>;

export function useSpeechTranscription(signaling: Signaling) {
  const { localStream, transcriptionEnabled } = useVideoCallStore();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    if (!transcriptionEnabled || !localStream) {
      // Stop recording if transcription disabled or no stream
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
        recorderRef.current = null;
      }
      setIsTranscribing(false);
      return;
    }

    // Extract audio tracks from the local stream
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      setIsTranscribing(false);
      return;
    }

    const audioStream = new MediaStream(audioTracks);

    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }
    }

    const recorder = new MediaRecorder(audioStream, {
      ...(mimeType ? { mimeType } : {}),
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            // result is "data:<mime>;base64,<data>" — extract the base64 part
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1];
            if (base64) {
              signaling.sendAudioData(base64);
            }
          } catch {
            // ignore encoding errors
          }
        };
        reader.readAsDataURL(event.data);
      }
    };

    recorder.start(250); // capture every 250ms
    recorderRef.current = recorder;
    setIsTranscribing(true);

    return () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      recorderRef.current = null;
      setIsTranscribing(false);
    };
  }, [transcriptionEnabled, localStream, signaling]);

  return { isTranscribing };
}
