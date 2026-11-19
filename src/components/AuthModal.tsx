import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User, X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  initialTab?: 'login' | 'signup';
  isGuestDataPresent: boolean;
  onClose: () => void;
  onGoogleAuth: () => Promise<void>;
  onAppleAuth: () => Promise<void>;
  onGithubAuth: () => Promise<void>;
  onMicrosoftAuth: () => Promise<void>;
  onEmailSignUp: (data: { name: string; email: string; password: string }) => Promise<void>;
  onEmailLogIn: (data: { email: string; password: string }) => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialTab = 'signup',
  isGuestDataPresent,
  onClose,
  onGoogleAuth,
  onAppleAuth,
  onGithubAuth,
  onMicrosoftAuth,
  onEmailSignUp,
  onEmailLogIn,
}) => {
  const [tab, setTab] = useState<'login' | 'signup'>(initialTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | 'github' | 'microsoft' | 'email' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setError('');
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGoogle = async () => {
    setBusy('google');
    setError('');
    try {
      await onGoogleAuth();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleApple = async () => {
    setBusy('apple');
    setError('');
    try {
      await onAppleAuth();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apple sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleGithub = async () => {
    setBusy('github');
    setError('');
    try {
      await onGithubAuth();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GitHub sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleMicrosoft = async () => {
    setBusy('microsoft');
    setError('');
    try {
      await onMicrosoftAuth();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microsoft sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (tab === 'signup' && !name.trim()) {
      setError('Please enter your name.');
      return;
    }

    setBusy('email');
    try {
      if (tab === 'signup') {
        await onEmailSignUp({ name: name.trim(), email: cleanEmail, password });
      } else {
        await onEmailLogIn({ email: cleanEmail, password });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-zinc-200/80 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-zinc-300" aria-hidden="true" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-zinc-100">
          <div>
            <h2
              id="auth-modal-title"
              className="font-display text-lg sm:text-xl font-bold text-zinc-900 tracking-tight"
            >
              {tab === 'signup' ? 'Create Your Pantry Account' : 'Welcome Back'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isGuestDataPresent
                ? 'Your current pantry items will be saved to your account.'
                : 'Sign in to access your saved inventory and alerts.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {/* Segmented Log In / Sign Up Switcher */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'signup'}
              onClick={() => {
                setTab('signup');
                setError('');
              }}
              className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                tab === 'signup'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Sign Up
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              onClick={() => {
                setTab('login');
                setError('');
              }}
              className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                tab === 'login'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Log In
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs sm:text-sm text-red-700 leading-relaxed"
            >
              {error}
            </div>
          )}

          {/* One-Click OAuth Provider Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleGoogle()}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-zinc-300 text-zinc-900 text-xs sm:text-sm font-semibold hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              {busy === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.09.73-2.48 1.16-4.22 1.16-3.25 0-6-2.19-6.98-5.14H1.01v3.14C3.02 21.14 7.21 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.02 14.01c-.25-.73-.39-1.52-.39-2.33s.14-1.6.39-2.33V6.21H1.01C.37 7.49 0 8.92 0 10.68s.37 3.19 1.01 4.47l4.01-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.8 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.19 15.3 0 12 0 7.21 0 3.02 2.86 1.01 7.01l4.01 3.14c.98-2.95 3.73-5.4 6.98-5.4Z"
                  />
                </svg>
              )}
              <span>Google</span>
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleApple()}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-950 text-white text-xs sm:text-sm font-semibold hover:bg-zinc-900 active:scale-[0.99] disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              {busy === 'apple' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43Zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45Z" />
                </svg>
              )}
              <span>Apple</span>
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleGithub()}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#24292F] border border-[#24292F] text-white text-xs sm:text-sm font-semibold hover:bg-[#1b1f23] active:scale-[0.99] disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              {busy === 'github' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
                  />
                </svg>
              )}
              <span>GitHub</span>
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleMicrosoft()}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-zinc-300 text-zinc-900 text-xs sm:text-sm font-semibold hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              {busy === 'microsoft' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
                  <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
                  <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
                  <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
                </svg>
              )}
              <span>Microsoft</span>
            </button>
          </div>

          <div className="relative flex items-center py-0.5">
            <div className="flex-grow border-t border-zinc-200" />
            <span className="shrink mx-3 text-xs text-zinc-400">or with email</span>
            <div className="flex-grow border-t border-zinc-200" />
          </div>

          {/* Email & Password Form */}
          <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3.5">
            {tab === 'signup' && (
              <div>
                <label
                  htmlFor="auth-name-input"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  Full name
                </label>
                <div className="relative">
                  <User
                    className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-name-input"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    maxLength={60}
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email-input"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="auth-email-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  maxLength={120}
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password-input"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full min-h-[44px] pl-10 pr-11 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-800 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy !== null}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {busy === 'email' && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{tab === 'signup' ? 'Create Account' : 'Log In'}</span>
            </button>
          </form>

          <div className="flex items-start gap-2 text-[11px] text-zinc-500 leading-relaxed pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Your pantry items, shopping list, and expiry alerts stay saved to your account every time you log back in.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
