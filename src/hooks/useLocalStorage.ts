import { useEffect, useRef, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)) {
  const loadedFromStorageRef = useRef(false);
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) {
        loadedFromStorageRef.current = true;
        return JSON.parse(saved) as T;
      }
    } catch {
      // Fallback to initial value if storage is unavailable
    }
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  });

  const latestRef = useRef({ key, value });
  latestRef.current = { key, value };
  const isFirstEffectRef = useRef(true);
  const dirtyRef = useRef(false);
  const lastSerializedRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isFirstEffectRef.current) {
      isFirstEffectRef.current = false;
      if (loadedFromStorageRef.current) {
        return;
      }
    }

    dirtyRef.current = true;

    const writeNow = () => {
      timerRef.current = null;
      dirtyRef.current = false;
      try {
        const serialized = JSON.stringify(latestRef.current.value);
        if (serialized !== lastSerializedRef.current) {
          window.localStorage.setItem(latestRef.current.key, serialized);
          lastSerializedRef.current = serialized;
        }
      } catch {
        // Ignore quota errors cleanly
      }
    };

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(writeNow, 120);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [key, value]);

  useEffect(() => {
    const flushPending = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      try {
        const serialized = JSON.stringify(latestRef.current.value);
        if (serialized !== lastSerializedRef.current) {
          window.localStorage.setItem(latestRef.current.key, serialized);
          lastSerializedRef.current = serialized;
        }
      } catch {
        // Ignore quota errors cleanly
      }
    };

    window.addEventListener('pagehide', flushPending);
    window.addEventListener('beforeunload', flushPending);
    return () => {
      flushPending();
      window.removeEventListener('pagehide', flushPending);
      window.removeEventListener('beforeunload', flushPending);
    };
  }, []);

  return [value, setValue] as const;
}
