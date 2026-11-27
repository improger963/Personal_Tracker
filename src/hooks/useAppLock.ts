import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

export interface AppLockConfig {
  enabled: boolean;
  pinHash: string;
  salt: string;
  autoLockOnHide: boolean;
  webAuthnCredentialId?: string;
}

const DEFAULT_CONFIG: AppLockConfig = {
  enabled: false,
  pinHash: '',
  salt: '',
  autoLockOnHide: true,
};

function readStoredAppLock(): AppLockConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.APP_LOCK);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AppLockConfig>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CONFIG;
    return {
      enabled: Boolean(parsed.enabled && parsed.pinHash && parsed.salt),
      pinHash: typeof parsed.pinHash === 'string' ? parsed.pinHash : '',
      salt: typeof parsed.salt === 'string' ? parsed.salt : '',
      autoLockOnHide:
        typeof parsed.autoLockOnHide === 'boolean' ? parsed.autoLockOnHide : true,
      webAuthnCredentialId:
        typeof parsed.webAuthnCredentialId === 'string'
          ? parsed.webAuthnCredentialId
          : undefined,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function writeStoredAppLock(config: AppLockConfig): void {
  try {
    if (!config.enabled) {
      window.localStorage.removeItem(STORAGE_KEYS.APP_LOCK);
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.APP_LOCK, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  window.crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

async function hashPinWithSalt(pin: string, salt: string): Promise<string> {
  if (!window.crypto?.subtle) {
    throw new Error('Այս դիտարկիչում գաղտնագրման համակարգը հասանելի չէ։');
  }
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export function useAppLock() {
  const [config, setConfig] = useState<AppLockConfig>(() => readStoredAppLock());
  const [isLocked, setIsLocked] = useState<boolean>(() => readStoredAppLock().enabled);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [isBiometricsSupported, setIsBiometricsSupported] = useState(false);

  useEffect(() => {
    let active = true;
    const checkSupport = async () => {
      try {
        if (
          typeof window !== 'undefined' &&
          'PublicKeyCredential' in window &&
          typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
            'function'
        ) {
          const ok =
            await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          if (active) setIsBiometricsSupported(ok);
        }
      } catch {
        if (active) setIsBiometricsSupported(false);
      }
    };
    void checkSupport();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!config.enabled || !config.autoLockOnHide) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setIsLocked(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [config.enabled, config.autoLockOnHide]);

  const persistConfig = useCallback((next: AppLockConfig) => {
    setConfig(next);
    writeStoredAppLock(next);
  }, []);

  const lockNow = useCallback(() => {
    if (!config.enabled) return;
    setIsLocked(true);
  }, [config.enabled]);

  const verifyPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!config.enabled) return true;
      const computed = await hashPinWithSalt(pin, config.salt);
      return computed === config.pinHash;
    },
    [config]
  );

  const unlockWithPin = useCallback(
    async (pin: string): Promise<{ ok: boolean; error?: string }> => {
      if (!config.enabled) {
        setIsLocked(false);
        return { ok: true };
      }
      const now = Date.now();
      const lockoutExpired = Boolean(lockoutUntil && now >= lockoutUntil);
      if (lockoutUntil && now < lockoutUntil) {
        const secs = Math.max(1, Math.ceil((lockoutUntil - now) / 1000));
        return {
          ok: false,
          error: `Սպասեք ${secs} վայրկյան մինչև կրկին փորձելը։`,
        };
      }
      if (lockoutExpired) {
        setLockoutUntil(null);
      }

      try {
        const ok = await verifyPin(pin);
        if (ok) {
          setFailedAttempts(0);
          setLockoutUntil(null);
          setIsLocked(false);
          return { ok: true };
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Չհաջողվեց ստուգել PIN կոդը։',
        };
      }

      const baseFails = lockoutExpired ? 0 : failedAttempts;
      const nextFails = baseFails + 1;
      setFailedAttempts(nextFails);
      if (nextFails >= 5) {
        setLockoutUntil(Date.now() + 15_000);
        return {
          ok: false,
          error: 'Չափազանց շատ սխալ փորձեր․ փորձեք 15 վայրկյանից։',
        };
      }
      return {
        ok: false,
        error: `Սխալ PIN կոդ (${nextFails}/5)։`,
      };
    },
    [config.enabled, failedAttempts, lockoutUntil, verifyPin]
  );

  const enablePinLock = useCallback(
    async (pin: string) => {
      if (!/^\d{4}$/.test(pin)) {
        throw new Error('PIN կոդը պետք է լինի 4 թվանշան։');
      }
      const salt = generateSalt();
      const pinHash = await hashPinWithSalt(pin, salt);
      persistConfig({
        enabled: true,
        pinHash,
        salt,
        autoLockOnHide: config.autoLockOnHide,
        webAuthnCredentialId: config.webAuthnCredentialId,
      });
      setIsLocked(false);
    },
    [config.autoLockOnHide, config.webAuthnCredentialId, persistConfig]
  );

  const changePin = useCallback(
    async (currentPin: string, nextPin: string) => {
      if (!(await verifyPin(currentPin))) {
        throw new Error('Ընթացիկ PIN կոդը սխալ է։');
      }
      if (!/^\d{4}$/.test(nextPin)) {
        throw new Error('Նոր PIN կոդը պետք է լինի 4 թվանշան։');
      }
      const salt = generateSalt();
      const pinHash = await hashPinWithSalt(nextPin, salt);
      persistConfig({
        ...config,
        pinHash,
        salt,
      });
    },
    [config, persistConfig, verifyPin]
  );

  const disablePinLock = useCallback(
    async (currentPin: string) => {
      if (config.enabled && !(await verifyPin(currentPin))) {
        throw new Error('PIN կոդը սխալ է։');
      }
      persistConfig(DEFAULT_CONFIG);
      setIsLocked(false);
      setFailedAttempts(0);
      setLockoutUntil(null);
    },
    [config.enabled, persistConfig, verifyPin]
  );

  const toggleAutoLockOnHide = useCallback(() => {
    if (!config.enabled) return;
    persistConfig({
      ...config,
      autoLockOnHide: !config.autoLockOnHide,
    });
  }, [config, persistConfig]);

  const enrollBiometrics = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!isBiometricsSupported || !window.navigator?.credentials?.create) {
      return {
        ok: false,
        error: 'Կենսաչափական ապակողպումը հասանելի չէ այս սարքում։',
      };
    }
    try {
      const challenge = new Uint8Array(32);
      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(challenge);
      window.crypto.getRandomValues(userId);

      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Անձնական Օգնական' },
          user: {
            id: userId,
            name: 'local-owner',
            displayName: 'Անձնական Օգնական',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 45_000,
        },
      })) as PublicKeyCredential | null;

      if (!cred) {
        return { ok: false, error: 'Չհաջողվեց միացնել կենսաչափական բանալին։' };
      }

      const credId = arrayBufferToBase64Url(cred.rawId);
      persistConfig({
        ...config,
        webAuthnCredentialId: credId,
      });
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Սարքը մերժեց կամ չաջակցեց կենսաչափական գրանցումը։',
      };
    }
  }, [config, isBiometricsSupported, persistConfig]);

  const removeBiometrics = useCallback(() => {
    persistConfig({
      ...config,
      webAuthnCredentialId: undefined,
    });
  }, [config, persistConfig]);

  const unlockWithBiometrics = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!config.webAuthnCredentialId || !window.navigator?.credentials?.get) {
      return { ok: false, error: 'Կենսաչափական մուտքը կարգավորված չէ։' };
    }
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const credBytes = base64UrlToUint8Array(config.webAuthnCredentialId);
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              type: 'public-key',
              id: credBytes.buffer as ArrayBuffer,
            },
          ],
          userVerification: 'required',
          timeout: 45_000,
        },
      });
      if (!assertion) {
        return { ok: false, error: 'Կենսաչափական ստուգումը չավարտվեց։' };
      }
      setFailedAttempts(0);
      setLockoutUntil(null);
      setIsLocked(false);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Կենսաչափական ապակողպումը չհաջողվեց․ օգտագործեք PIN կոդը։',
      };
    }
  }, [config.webAuthnCredentialId]);

  return {
    isEnabled: config.enabled,
    isLocked,
    autoLockOnHide: config.autoLockOnHide,
    isBiometricsSupported,
    hasBiometrics: Boolean(config.webAuthnCredentialId),
    failedAttempts,
    lockoutUntil,
    lockNow,
    unlockWithPin,
    unlockWithBiometrics,
    enablePinLock,
    changePin,
    disablePinLock,
    toggleAutoLockOnHide,
    enrollBiometrics,
    removeBiometrics,
  };
}
