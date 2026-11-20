import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  User,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  extractFirebaseErrorCode,
  formatFirebaseAuthError,
  isFirebaseConfigured,
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGooglePopup,
  signUpWithEmailPassword,
} from '../services/firebase';
import { UserAccount } from '../types/music';
import { computeInitials } from '../utils/avatarImage';
import { loadSavedAccounts } from '../utils/storage';
import { KlynLogo } from './KlynLogo';
import { PillTabItem, SpringPillTabs } from './SpringPillTabs';
import { UserAvatar } from './UserAvatar';

interface AuthGateScreenProps {
  onAuthenticate: (account: UserAccount) => void;
  onFirebaseAuthenticate: (
    firebaseUser: FirebaseUser,
    meta?: { name?: string; handle?: string; authProvider?: 'google' | 'email' },
  ) => Promise<void>;
}

type AuthMode = 'signup' | 'login' | 'reset';

const AUTH_TABS: PillTabItem<'signup' | 'login'>[] = [
  { id: 'login', label: 'Log In' },
  { id: 'signup', label: 'Sign Up' },
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
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResetCooldown((sec) => (sec <= 1 ? 0 : sec - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resetCooldown]);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsGoogleLoading(true);
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

  const handleSendPasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (resetCooldown > 0) return;
    setErrorMsg(null);
    setResetSuccessMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter the email address associated with your account.');
      return;
    }

    setIsResetLoading(true);
    try {
      await sendPasswordReset(cleanEmail);
      setResetSuccessMsg(`Password reset link sent to ${cleanEmail}. Check your inbox and spam folder.`);
      setResetCooldown(45);
    } catch (err) {
      const code = extractFirebaseErrorCode(err);
      if (code === 'auth/user-not-found') {
        setResetSuccessMsg(`If an account exists for ${cleanEmail}, a reset link has been sent.`);
        setResetCooldown(45);
      } else {
        setErrorMsg(formatFirebaseAuthError(err, 'reset'));
      }
    } finally {
      setIsResetLoading(false);
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
        favoriteGenres: ['Trap', 'R&B', 'Hip-Hop'],
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
      favoriteGenres: ['Trap', 'R&B', 'Hip-Hop'],
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
        authenticateLocallyFallback(cleanEmail, cleanName, handle);
      } else {
        setErrorMsg(formatFirebaseAuthError(err, 'email'));
      }
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center overflow-y-auto bg-[#000000] px-4 py-8 text-white">
      <div className="w-full max-w-[390px] rounded-[28px] border border-white/12 bg-[#000000] p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <KlynLogo size={54} />
          <h1 className="font-display mt-3.5 text-3xl font-bold tracking-tight text-white">
            KLYN
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-white/55">
            {mode === 'reset'
              ? 'Reset your password'
              : mode === 'signup'
                ? 'Create your account'
                : 'Sign in to continue'}
          </p>
        </div>

        {mode === 'reset' ? (
          <form onSubmit={handleSendPasswordReset} className="mt-6 space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black px-3.5 py-3">
              <KeyRound className="h-4.5 w-4.5 shrink-0 text-white/75" />
              <p className="text-xs text-white/70 leading-relaxed">
                Enter your account email and we will send a password reset link.
              </p>
            </div>

            <div>
              <label htmlFor="reset-email" className="block text-xs font-medium text-white/65 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="you@klyn.audio"
                  className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:border-white/45 focus:outline-none"
                />
              </div>
            </div>

            {errorMsg && (
              <p
                role="alert"
                className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200"
              >
                {errorMsg}
              </p>
            )}

            {resetSuccessMsg && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-200"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{resetSuccessMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isResetLoading || resetCooldown > 0}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-55"
            >
              {isResetLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending Reset Link…</span>
                </>
              ) : resetCooldown > 0 ? (
                <span>Resend Link in {resetCooldown}s</span>
              ) : (
                <span>{resetSuccessMsg ? 'Resend Link' : 'Send Reset Link'}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setResetSuccessMsg(null);
              }}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-black px-5 py-2.5 text-xs font-semibold text-white/85 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Log In</span>
            </button>
          </form>
        ) : (
          <>
            <div className="mt-5">
              <SpringPillTabs
                items={AUTH_TABS}
                activeId={mode}
                onChange={(next) => {
                  setMode(next);
                  setErrorMsg(null);
                }}
                variant="equal"
                size="sm"
                ariaLabel="Authentication mode"
                className="w-full border border-white/15 bg-black p-1"
              />
            </div>

            {mode === 'login' && savedAccounts.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-medium text-white/50">Saved profile</p>
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
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/15 bg-black px-3.5 py-2.5 text-left hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        name={acc.name}
                        initials={acc.initials}
                        avatarUrl={acc.avatarUrl}
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
                    <label htmlFor="auth-name" className="block text-xs font-medium text-white/65 mb-1.5">
                      Display Name
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                      <input
                        id="auth-name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black pl-10 pr-3 text-sm text-white placeholder:text-white/35 focus:border-white/45 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-handle" className="block text-xs font-medium text-white/65 mb-1.5">
                      Handle
                    </label>
                    <input
                      id="auth-handle"
                      type="text"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="@handle"
                      className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black px-3.5 text-sm text-white placeholder:text-white/35 focus:border-white/45 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-white/65 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@klyn.audio"
                    className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:border-white/45 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="auth-password" className="block text-xs font-medium text-white/65">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setErrorMsg(null);
                        setResetSuccessMsg(null);
                      }}
                      className="text-xs font-semibold text-white/75 hover:text-white transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:border-white/45 focus:outline-none"
                  />
                </div>
              </div>

              {errorMsg && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-200"
                >
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={isEmailLoading || isGoogleLoading}
                className="mt-1 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              >
                {isEmailLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{mode === 'signup' ? 'Creating account…' : 'Signing in…'}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <span className="h-[1px] flex-1 bg-white/12" />
              <span className="text-[11px] font-medium text-white/40">or</span>
              <span className="h-[1px] flex-1 bg-white/12" />
            </div>

            <button
              type="button"
              disabled={isGoogleLoading || isEmailLoading}
              onClick={handleGoogleSignIn}
              className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06] active:scale-[0.99] transition-colors disabled:opacity-60"
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
          </>
        )}
      </div>
    </div>
  );
};
