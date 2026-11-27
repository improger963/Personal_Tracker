import { useCallback, useEffect, useRef, useState } from 'react';

export interface RecordedAudioPayload {
  audioBase64: string;
  mimeType: string;
  durationSec: number;
}

interface UseVoiceRecorderReturn {
  isSupported: boolean;
  isRecording: boolean;
  elapsedSec: number;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<RecordedAudioPayload | null>;
  cancelRecording: () => void;
  clearError: () => void;
}

const MAX_RECORDING_SEC = 45;

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  for (const mime of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore unsupported check
    }
  }
  return '';
}

function normalizeAudioMimeType(rawMime: string): string {
  const clean = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (
    clean === 'audio/webm' ||
    clean === 'audio/mp4' ||
    clean === 'audio/ogg' ||
    clean === 'audio/wav' ||
    clean === 'audio/mpeg'
  ) {
    return clean;
  }
  if (clean.includes('mp4') || clean.includes('m4a') || clean.includes('aac')) {
    return 'audio/mp4';
  }
  if (clean.includes('ogg')) return 'audio/ogg';
  return 'audio/webm';
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx >= 0) {
        resolve(result.slice(commaIdx + 1));
      } else if (result) {
        resolve(result);
      } else {
        reject(new Error('Չհաջողվեց մշակել ձայնագրությունը։'));
      }
    };
    reader.onerror = () => reject(new Error('Չհաջողվեց կարդալ ձայնագրությունը։'));
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const resolveStopRef = useRef<((payload: RecordedAudioPayload | null) => void) | null>(
    null
  );
  const cancelledRef = useRef(false);

  const cleanupTracksAndTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      cleanupTracksAndTimer();
    };
  }, [cleanupTracksAndTimer]);

  const stopRecording = useCallback((): Promise<RecordedAudioPayload | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanupTracksAndTimer();
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      resolveStopRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        resolveStopRef.current = null;
        cleanupTracksAndTimer();
        resolve(null);
      }
    });
  }, [cleanupTracksAndTimer]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    if (resolveStopRef.current) {
      resolveStopRef.current(null);
      resolveStopRef.current = null;
    }
    chunksRef.current = [];
    setElapsedSec(0);
    cleanupTracksAndTimer();
  }, [cleanupTracksAndTimer]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!isSupported) {
      setError('Ձայնագրությունը չի աջակցվում այս դիտարկիչում։');
      return;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      cancelledRef.current = false;
      streamRef.current = stream;
      chunksRef.current = [];
      const chosenMime = pickSupportedMimeType();
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setIsRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const wasCancelled = cancelledRef.current;
        const durationSec = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000)
        );
        const mime = normalizeAudioMimeType(
          recorder.mimeType || chosenMime || chunksRef.current[0]?.type || 'audio/webm'
        );
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        cleanupTracksAndTimer();

        const pendingResolve = resolveStopRef.current;
        resolveStopRef.current = null;

        if (wasCancelled || blob.size < 256) {
          if (!wasCancelled && blob.size < 256) {
            setError('Ձայնը չի լսվել․ խոսեք մի փոքր ավելի երկար։');
          }
          pendingResolve?.(null);
          return;
        }

        try {
          const audioBase64 = await blobToBase64(blob);
          pendingResolve?.({ audioBase64, mimeType: mime, durationSec });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Չհաջողվեց պատրաստել ձայնագրությունը։'
          );
          pendingResolve?.(null);
        }
      };

      recorder.start(250);

      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSec(sec);
        if (sec >= MAX_RECORDING_SEC) {
          void stopRecording();
        }
      }, 250);
    } catch (err) {
      cleanupTracksAndTimer();
      const domErr = err as { name?: string };
      if (domErr?.name === 'NotAllowedError' || domErr?.name === 'PermissionDeniedError') {
        setError('Խոսափողի թույլտվությունը մերժված է։ Թույլատրեք դիտարկիչում։');
      } else if (domErr?.name === 'NotFoundError') {
        setError('Խոսափող չի հայտնաբերվել այս սարքում։');
      } else {
        setError('Չհաջողվեց միացնել խոսափողը։');
      }
    }
  }, [cleanupTracksAndTimer, isSupported, stopRecording]);

  return {
    isSupported,
    isRecording,
    elapsedSec,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError: () => setError(null),
  };
}
