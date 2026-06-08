/**
 * rrweb Session Recorder
 * Records DOM mutations, mouse movements, clicks, scrolls.
 * Sends event chunks to backend every 10 seconds.
 * Injects X-Session-Id header into all API requests for server-side log correlation.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { sessionReplayApi } from '../utils/api/session-replay';
import apiClient from '../utils/api/client';

// Module-level session ID (survives re-renders, accessible outside React)
let activeSessionId: string | null = null;

export function getActiveSessionId(): string | null {
  return activeSessionId;
}

const FLUSH_INTERVAL_MS = 10_000; // 10 seconds
const MAX_BUFFER_SIZE = 500; // flush early if buffer gets large
const MAX_CHUNK_BYTES = 5_000_000; // 5MB — stay well under the 10MB body-parser limit

export function useSessionRecorder() {
  const { user, isAuthenticated } = useAuth();
  const stopRef = useRef<(() => void) | null>(null);
  const bufferRef = useRef<any[]>([]);
  const chunkIndexRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const interceptorIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;
    activeSessionId = sessionId;

    const viewport = `${window.innerWidth}x${window.innerHeight}`;

    // Register session on backend
    sessionReplayApi.createSession(sessionId, viewport).catch(() => {
      // Non-critical — recording still works locally, chunks will create session on first store
    });

    // Add X-Session-Id header to all API requests
    const interceptorId = apiClient.interceptors.request.use((config) => {
      if (activeSessionId) {
        config.headers['X-Session-Id'] = activeSessionId;
      }
      return config;
    });
    interceptorIdRef.current = interceptorId;

    // Dynamically import rrweb to avoid blocking initial load
    let mounted = true;
    import('rrweb').then(({ record, addCustomEvent }) => {
      if (!mounted) return;

      const stop = record!({
        emit: (event) => {
          bufferRef.current.push(event);

          if (bufferRef.current.length >= MAX_BUFFER_SIZE) {
            flushBuffer(sessionId);
          }
        },
        sampling: {
          mousemove: true,
          mouseInteraction: true,
          scroll: 150,
          input: 'last',
        },
        maskInputOptions: {
          password: true,
        },
        recordCanvas: false,
        collectFonts: true,
      });

      stopRef.current = stop ?? null;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (!e.key || e.key === 'Unidentified') return;
        addCustomEvent('keyboard', {
          key: e.key,
          code: e.code,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        });
      };
      window.addEventListener('keydown', handleKeyDown);
      (stopRef as any)._keyHandler = handleKeyDown;
    });

    // Periodic flush
    flushTimerRef.current = setInterval(() => {
      flushBuffer(sessionId);
    }, FLUSH_INTERVAL_MS);

    // Cleanup on unmount / logout
    return () => {
      mounted = false;

      // Remove keyboard listener
      if ((stopRef as any)._keyHandler) {
        window.removeEventListener('keydown', (stopRef as any)._keyHandler);
      }

      // Stop rrweb recording
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
      }

      // Clear flush timer
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      // Remove axios interceptor
      if (interceptorIdRef.current !== null) {
        apiClient.interceptors.request.eject(interceptorIdRef.current);
        interceptorIdRef.current = null;
      }

      // Final flush + end session
      if (sessionIdRef.current) {
        flushBuffer(sessionIdRef.current);
        sessionReplayApi.endSession(sessionIdRef.current).catch(() => {});
      }

      activeSessionId = null;
      sessionIdRef.current = null;
    };
  }, [isAuthenticated, user?.id]); // re-init on login/logout

  function flushBuffer(sessionId: string) {
    if (bufferRef.current.length === 0) return;

    const events = [...bufferRef.current];
    bufferRef.current = [];

    // Split events into chunks that fit under the body-parser limit
    const batches: any[][] = [];
    let currentBatch: any[] = [];
    let currentSize = 0;

    for (const event of events) {
      const eventSize = JSON.stringify(event).length;

      // If a single event exceeds the limit, skip it (e.g. huge FullSnapshot)
      if (eventSize > MAX_CHUNK_BYTES) {
        console.warn('[SessionRecorder] Dropping oversized event', event.type, eventSize);
        continue;
      }

      if (currentSize + eventSize > MAX_CHUNK_BYTES && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentSize = 0;
      }

      currentBatch.push(event);
      currentSize += eventSize;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // Send each batch as a separate chunk
    for (const batch of batches) {
      const chunkIndex = chunkIndexRef.current++;

      sessionReplayApi.sendChunk(sessionId, chunkIndex, batch).catch((err) => {
        // Only retry on transient errors (5xx, network). Drop on 413/4xx to prevent snowball.
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500) {
          console.warn('[SessionRecorder] Dropping chunk (client error)', chunkIndex, status);
          return;
        }
        console.warn('[SessionRecorder] Failed to send chunk (will retry)', chunkIndex, err);
        bufferRef.current.unshift(...batch);
        chunkIndexRef.current--;
      });
    }
  }

  // Also flush on page unload (best-effort with sendBeacon)
  useEffect(() => {
    const handleUnload = () => {
      if (!sessionIdRef.current || bufferRef.current.length === 0) return;

      const events = bufferRef.current;
      const chunkIndex = chunkIndexRef.current;
      const payload = JSON.stringify({
        chunkIndex,
        events,
      });

      // sendBeacon is reliable for unload scenarios
      const url = `${apiClient.defaults.baseURL}/api/session-replay/sessions/${sessionIdRef.current}/chunks`;
      const token = localStorage.getItem('auth_token');
      const blob = new Blob([payload], { type: 'application/json' });

      // sendBeacon can't set custom headers, so we use fetch with keepalive
      fetch(url, {
        method: 'POST',
        body: blob,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        keepalive: true,
      }).catch(() => {});

      // Also try to end session
      fetch(`${apiClient.defaults.baseURL}/api/session-replay/sessions/${sessionIdRef.current}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);
}
