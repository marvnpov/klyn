import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Lock, Mail, User } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  extractFirebaseErrorCode,
  formatFirebaseAuthError,
  isFirebaseConfigured,
  signInWithEmailPassword,
  signInWithGooglePopup,
  signUpWithEmailPassword,
} from '../services/firebase';
import { UserAccount } from '../types/music';
import { computeInitials } from '../utils/avatarImage';
import { loadSavedAccounts } from '../utils/storage';
import { BrandLogo } from './BrandLogo';
import { PillTabItem, SpringPillTabs } from './SpringPillTabs';
import { UserAvatar } from './UserAvatar';

interface AuthGateScreenProps {
  onAuthenticate: (account: UserAccount) => void;
  onFirebaseAuthenticate: (
    firebaseUser: FirebaseUser,
    meta?: { name?: string; handle?: string; authProvider?: 'google' | 'email' },
  ) => Promise<void>;
}

type AuthMode = 'signup' | 'login';

const AUTH_TABS: PillTabItem<AuthMode>[] = [
  { id: 'signup', label: 'Sign Up' },
  { id: 'login', label: 'Log In' },
];

export const AuthGateScreen: React.FC<AuthGateScreenProps> = ({
  onAuthenticate,
  onFirebaseAuthenticate,
}) => {
  const savedAccounts = loadSavedAccounts();
  const [mode, setMode] = useState<AuthMode>(savedAccounts.length > 0 ? 'login' : 'signup');

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState(savedAccounts[0]?.email ?? '');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [pulseBoost, setPulseBoost] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boostRef = useRef(0);

  useEffect(() => {
    boostRef.current = pulseBoost;
  }, [pulseBoost]);

  const triggerReactivePulse = () => {
    setPulseBoost(1);
    window.setTimeout(() => setPulseBoost(0), 420);
  };

  // Live animated harmonic frequency waves + vertical spectrum bars on #000000
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    let rafId = 0;
    let phase = 0;
    let smoothEnergy = 0.3;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const drawFrame = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const targetEnergy = boostRef.current > 0 ? 1.0 : 0.36;
      smoothEnergy += (targetEnergy - smoothEnergy) * 0.08;

      const barCount = Math.max(28, Math.min(64, Math.floor(w / 24)));
      const barSpacing = w / barCount;
      for (let i = 0; i < barCount; i++) {
        const norm = i / barCount;
        const centerWeight = Math.sin(norm * Math.PI);
        const harmonic =
          0.5 +
          0.32 * Math.sin(phase * 1.4 + i * 0.38) +
          0.18 * Math.cos(phase * 0.9 - i * 0.22);
        const barHeight = Math.max(
          8,
          (26 + smoothEnergy * 54) * centerWeight * Math.max(0.2, harmonic),
        );
        const x = i * barSpacing + barSpacing * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x, h - barHeight);
        ctx.strokeStyle =
          i % 3 === 0
            ? `rgba(194, 120, 56, ${0.12 + smoothEnergy * 0.14})`
            : i % 3 === 1
              ? `rgba(185, 56, 72, ${0.1 + smoothEnergy * 0.12})`
              : `rgba(255, 255, 255, ${0.07 + smoothEnergy * 0.09})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      const waveConfigs = [
        { amp: 32, freq: 0.0052, speed: 0.018, yRatio: 0.28, color: 'rgba(194, 120, 56, 0.38)' },
        { amp: 46, freq: 0.004, speed: -0.013, yRatio: 0.48, color: 'rgba(185, 56, 72, 0.32)' },
        { amp: 28, freq: 0.0068, speed: 0.022, yRatio: 0.66, color: 'rgba(43, 120, 184, 0.34)' },
        { amp: 20, freq: 0.0085, speed: -0.026, yRatio: 0.5, color: 'rgba(255, 255, 255, 0.16)' },
        { amp: 16, freq: 0.011, speed: 0.031, yRatio: 0.78, color: 'rgba(77, 148, 115, 0.24)' },
      ];

      waveConfigs.forEach((wave, idx) => {
        ctx.beginPath();
        const baseY = h * wave.yRatio;
        const dynamicAmp = wave.amp * (0.75 + smoothEnergy * 0.9);
        for (let x = 0; x <= w; x += 6) {
          const envelope = Math.sin((x / w) * Math.PI);
          const y =
            baseY +
            Math.sin(x * wave.freq + phase * (1 + idx * 0.2) * Math.sign(wave.speed)) *
              dynamicAmp *
              (0.45 + 0.55 * envelope) +
            Math.cos(x * wave.freq * 0.48 - phase * 0.72) * (dynamicAmp * 0.3);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = idx === 3 ? 1.2 : 1.85;
        ctx.stroke();
      });

      if (!prefersReducedMotion) {
        phase += 0.028 + smoothEnergy * 0.022;
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();
    return () => {
      window.removeEventListener('resize', resize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsGoogleLoading(true);
    triggerReactivePulse();
    try {
      const firebaseUser = await signInWithGooglePopup();
      await onFirebaseAuthenticate(firebaseUser, { authProvider: 'google' });
    } catch (err) {
      const code = extractFirebaseErrorCode(err);
      if (code) {
        console.warn('Google Sign-In failed with code:', code);
      }
      setErrorMsg(formatFirebaseAuthError(err, 'google'));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const authenticateLocallyFallback = (
    cleanEmail: string,
    cleanNameInput: string,
    rawHandleInput: string,
  ) => {
    if (mode === 'signup') {
      const rawHandle =
        rawHandleInput.trim() || cleanNameInput.toLowerCase().replace(/[^a-z0-9]+/g, '.');
      const formattedHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
      const account: UserAccount = {
        id: `usr-${Date.now()}`,
        authProvider: 'local',
        name: cleanNameInput,
        handle: formattedHandle,
        email: cleanEmail,
        initials: computeInitials(cleanNameInput),
        avatarStyle: 'monogram',
        accentColor: '#C27838',
        favoriteGenres: ['Electronic', 'Spatial', 'Alt-R&B'],
        hasCompletedOnboarding: false,
        createdAt: new Date().toISOString(),
      };
      onAuthenticate(account);
      return;
    }

    const matched = savedAccounts.find(
      (a) =>
        a.email.toLowerCase() === cleanEmail.toLowerCase() ||
        a.handle.toLowerCase() === cleanEmail.toLowerCase(),
    );

    if (matched) {
      onAuthenticate({
        ...matched,
        avatarStyle: matched.avatarStyle ?? 'monogram',
        accentColor: matched.accentColor ?? '#C27838',
        hasCompletedOnboarding: matched.hasCompletedOnboarding ?? false,
      });
      return;
    }

    const derivedName = cleanEmail.includes('@')
      ? cleanEmail
          .split('@')[0]
          .split(/[._-]+/)
          .filter(Boolean)
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' ') || 'Listener'
      : cleanEmail.replace(/^@/, '');

    const account: UserAccount = {
      id: `usr-${cleanEmail.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      authProvider: 'local',
      name: derivedName,
      handle: `@${derivedName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}`,
      email: cleanEmail.includes('@') ? cleanEmail : `${cleanEmail.replace(/^@/, '')}@klyn.audio`,
      initials: computeInitials(derivedName),
      avatarStyle: 'monogram',
      accentColor: '#C27838',
      favoriteGenres: ['Electronic', 'Spatial', 'Alt-R&B'],
      hasCompletedOnboarding: false,
      createdAt: new Date().toISOString(),
    };
    onAuthenticate(account);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    if (cleanPassword.length < 6) {
      setErrorMsg('Please enter a password of at least 6 characters.');
      return;
    }

    const cleanName = name.trim();
    if (mode === 'signup' && !cleanName) {
      setErrorMsg('Please enter your display name to create your klyn profile.');
      return;
    }

    // If user signs in locally using @handle without Firebase email format and matches saved local account
    if (mode === 'login' && !cleanEmail.includes('@')) {
      const localByHandle = savedAccounts.find(
        (a) => a.handle.toLowerCase() === cleanEmail.toLowerCase(),
      );
      if (localByHandle && !localByHandle.uid) {
        onAuthenticate({
          ...localByHandle,
          avatarStyle: localByHandle.avatarStyle ?? 'monogram',
          accentColor: localByHandle.accentColor ?? '#C27838',
          hasCompletedOnboarding: localByHandle.hasCompletedOnboarding ?? false,
        });
        return;
      }
      setErrorMsg('Enter your full email address to sign in to your klyn account.');
      return;
    }

    if (!isFirebaseConfigured) {
      authenticateLocallyFallback(cleanEmail, cleanName, handle);
      return;
    }

    setIsEmailLoading(true);
    triggerReactivePulse();
    try {
      if (mode === 'signup') {
        const rawHandle =
          handle.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '.');
        const formattedHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
        const firebaseUser = await signUpWithEmailPassword(
          cleanEmail,
          cleanPassword,
          cleanName,
        );
        await onFirebaseAuthenticate(firebaseUser, {
          name: cleanName,
          handle: formattedHandle,
          authProvider: 'email',
        });
      } else {
        const firebaseUser = await signInWithEmailPassword(cleanEmail, cleanPassword);
        await onFirebaseAuthenticate(firebaseUser, {
          authProvider: 'email',
        });
      }
    } catch (err) {
      const code = extractFirebaseErrorCode(err);
      const message = err instanceof Error ? err.message : '';

      if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/configuration-not-found' ||
        message.includes('operation-not-allowed') ||
        message.includes('configuration-not-found')
      ) {
        // Fallback cleanly to local profile if Email/Password isn't toggled in Firebase Console yet
        authenticateLocallyFallback(cleanEmail, cleanName, handle);
      } else {
        if (code) {
          console.warn('Email Sign-In failed with code:', code);
        }
        setErrorMsg(formatFirebaseAuthError(err, 'email'));
      }
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-y-auto bg-[#000000] px-4 py-8 text-white">
      {/* Multi-Layered Ambient Light Orbs */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="animate-orb-a absolute -left-28 top-[6%] h-[26rem] w-[26rem] rounded-full opacity-40 blur-[135px]"
          style={{ background: 'radial-gradient(circle, #C27838 0%, transparent 70%)' }}
        />
        <div
          className="animate-orb-b absolute -right-24 bottom-[8%] h-[30rem] w-[30rem] rounded-full opacity-35 blur-[145px]"
          style={{ background: 'radial-gradient(circle, #B93848 0%, transparent 70%)' }}
        />
        <div
          className="animate-orb-a absolute left-[55%] top-[18%] h-72 w-72 -translate-x-1/2 rounded-full opacity-28 blur-[120px]"
          style={{
            background: 'radial-gradient(circle, #2B78B8 0%, transparent 72%)',
            animationDelay: '-5s',
          }}
        />
      </div>

      {/* Live Harmonic Waves & Frequency Spectrum Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-95"
      />

      {/* Reactive Specular Halo */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed h-[440px] w-full max-w-lg rounded-full blur-[95px] transition-opacity duration-500 ${
          pulseBoost > 0 ? 'opacity-50' : 'opacity-26'
        }`}
        style={{
          background:
            'radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(194,120,56,0.24) 45%, transparent 75%)',
        }}
      />

      {/* Center Liquid Glass Auth Card */}
      <div className="liquid-glass-elevated relative z-10 my-auto w-full max-w-md rounded-[34px] border border-white/[0.16] p-6 sm:p-8 shadow-[0_28px_80px_rgba(0,0,0,0.88)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[34px]"
          style={{
            background:
              'linear-gradient(140deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.01) 36%, transparent 65%)',
          }}
        />

        <div className="relative z-10">
          <div className="flex flex-col items-center text-center">
            <BrandLogo className="h-14 w-14 rounded-2xl border border-white/20 shadow-[0_12px_32px_rgba(0,0,0,0.65)]" />
            <h1 className="font-display mt-3.5 text-3xl font-bold tracking-tight text-white">
              klyn
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-white/60">
              Lossless &amp; Spatial Audio · Cloud-synced library
            </p>
          </div>

          {/* Primary Google Sign-In with Firebase Auth */}
          <button
            type="button"
            disabled={isGoogleLoading}
            onClick={handleGoogleSignIn}
            className="mt-5 flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-full bg-white py-3 px-5 text-sm font-semibold text-black shadow-xl transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-65"
          >
            {isGoogleLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Signing in with Google…</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <div className="my-4 flex items-center gap-3">
            <span className="h-[1px] flex-1 bg-white/12" />
            <span className="text-[11px] font-medium text-white/45">or continue with profile</span>
            <span className="h-[1px] flex-1 bg-white/12" />
          </div>

          {/* Spring Mode Switcher */}
          <SpringPillTabs
            items={AUTH_TABS}
            activeId={mode}
            onChange={(next) => {
              setMode(next);
              setErrorMsg(null);
              triggerReactivePulse();
            }}
            variant="equal"
            size="sm"
            ariaLabel="Authentication mode"
            className="liquid-glass w-full p-1"
          />

          {/* Saved Profile One-Tap Sign-In */}
          {mode === 'login' && savedAccounts.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium text-white/50">Saved on this device</p>
              {savedAccounts.slice(0, 2).map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() =>
                    onAuthenticate({
                      ...acc,
                      avatarStyle: acc.avatarStyle ?? 'monogram',
                      accentColor: acc.accentColor ?? '#C27838',
                      hasCompletedOnboarding: acc.hasCompletedOnboarding ?? false,
                    })
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/[0.08] border border-white/15 px-3.5 py-2.5 text-left hover:bg-white/[0.14] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      name={acc.name}
                      initials={acc.initials}
                      avatarUrl={acc.avatarUrl}
                      avatarStyle={acc.avatarStyle}
                      accentColor={acc.accentColor}
                      sizeClass="h-9 w-9"
                      textClass="text-xs"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{acc.name}</p>
                      <p className="truncate text-xs text-white/55">{acc.email}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-white/75" />
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {mode === 'signup' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-white/65 mb-1">
                    Display Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                    <input
                      id="auth-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        triggerReactivePulse();
                      }}
                      placeholder="Marcus Vance"
                      className="w-full min-h-[42px] rounded-2xl bg-white/[0.07] border border-white/15 pl-10 pr-3 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-handle" className="block text-xs font-medium text-white/65 mb-1">
                    Handle
                  </label>
                  <input
                    id="auth-handle"
                    type="text"
                    value={handle}
                    onChange={(e) => {
                      setHandle(e.target.value);
                      triggerReactivePulse();
                    }}
                    placeholder="@marcus"
                    className="w-full min-h-[42px] rounded-2xl bg-white/[0.07] border border-white/15 px-3.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-white/65 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    triggerReactivePulse();
                  }}
                  placeholder="you@klyn.audio"
                  className="w-full min-h-[42px] rounded-2xl bg-white/[0.07] border border-white/15 pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-white/65 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    triggerReactivePulse();
                  }}
                  placeholder="At least 6 characters"
                  className="w-full min-h-[42px] rounded-2xl bg-white/[0.07] border border-white/15 pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                />
              </div>
            </div>

            {errorMsg && (
              <p
                role="alert"
                className="rounded-xl bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-xs text-rose-200"
              >
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={isEmailLoading || isGoogleLoading}
              className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-white/14 border border-white/22 py-2.5 px-5 text-sm font-semibold text-white transition-all hover:bg-white/20 active:scale-[0.98] disabled:opacity-65"
            >
              {isEmailLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{mode === 'signup' ? 'Creating account…' : 'Signing in…'}</span>
                </>
              ) : (
                <>
                  <span>{mode === 'signup' ? 'Continue to Setup' : 'Log In to klyn'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
