import React, { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { PantryInfo, PantryMember, WasteEvent } from '../types/inventory';
import { getNotificationPermissionState } from '../utils/notifications';
import { WasteAnalyticsSection } from './WasteAnalyticsSection';

interface HouseholdSheetModalProps {
  isOpen: boolean;
  isCloudSynced: boolean;
  anonymousDisabledHint: boolean;
  isAnonymousUser: boolean;
  userDisplayName: string;
  userEmail: string | null;
  currentUid: string | null;
  pantry: PantryInfo | null;
  personalPantryId: string | null;
  members: PantryMember[];
  wasteHistory: WasteEvent[];
  remindersEnabled: boolean;
  onClose: () => void;
  onOpenAuth: (tab: 'login' | 'signup') => void;
  onSignOut: () => Promise<void>;
  onJoinByCode: (code: string) => Promise<void>;
  onSwitchToPersonal: () => Promise<void>;
  onRegenerateCode: () => Promise<void>;
  onRenamePantry: (newName: string) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onLeavePantry: () => Promise<void>;
  onToggleReminders: () => Promise<void>;
  onTestNotification: () => void;
}

export const HouseholdSheetModal: React.FC<HouseholdSheetModalProps> = ({
  isOpen,
  isCloudSynced,
  anonymousDisabledHint,
  isAnonymousUser,
  userDisplayName,
  userEmail,
  currentUid,
  pantry,
  personalPantryId,
  members,
  wasteHistory,
  remindersEnabled,
  onClose,
  onOpenAuth,
  onSignOut,
  onJoinByCode,
  onSwitchToPersonal,
  onRegenerateCode,
  onRenamePantry,
  onRemoveMember,
  onLeavePantry,
  onToggleReminders,
  onTestNotification,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [pantryNameDraft, setPantryNameDraft] = useState(pantry?.name || '');
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'ok'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) return;
    setPantryNameDraft(pantry?.name || 'My Pantry');
    setFeedback(null);
  }, [isOpen, pantry?.name]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isOwner = Boolean(pantry && currentUid && pantry.ownerId === currentUid);
  const isSharedActive = Boolean(
    pantry && personalPantryId && pantry.id !== personalPantryId
  );
  const notifState = getNotificationPermissionState();

  const handleCopyCode = async () => {
    if (!pantry?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(pantry.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setFeedback({ type: 'ok', text: `Invite code: ${pantry.inviteCode}` });
    }
  };

  const runAction = async (key: string, fn: () => Promise<void>, okMsg?: string) => {
    setBusyAction(key);
    setFeedback(null);
    try {
      await fn();
      if (okMsg) setFeedback({ type: 'ok', text: okMsg });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="household-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-zinc-200/80 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-zinc-300" aria-hidden="true" />
        </div>

        <div className="flex items-center justify-between px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-zinc-100">
          <div>
            <h2
              id="household-modal-title"
              className="font-display text-lg sm:text-xl font-bold text-zinc-900 tracking-tight"
            >
              Account, Household &amp; Alerts
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Saved user data, shared pantry codes, and 3-day push notifications
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close household settings"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {feedback && (
            <div
              role="status"
              className={`rounded-xl px-3.5 py-2.5 text-xs sm:text-sm border ${
                feedback.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* 1. Account Status & Sign Up / Log In */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-zinc-500" />
                <span>Account &amp; Saved Data</span>
              </h3>
              <span className="text-xs text-zinc-500">
                {!isCloudSynced
                  ? 'Local Guest Mode'
                  : isAnonymousUser
                  ? 'Anonymous Guest'
                  : 'Account Active'}
              </span>
            </div>

            <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/70 p-4 space-y-3">
              {!isCloudSynced || isAnonymousUser ? (
                <>
                  <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                    Sign up or log in so your pantry items, shopping list, and waste history stay saved whenever you return.
                  </p>
                  {anonymousDisabledHint && !isCloudSynced && (
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      Tip: Enable <strong>Anonymous</strong> or <strong>Email/Password</strong> under Authentication &gt; Sign-in method in Firebase Console if needed; Google Sign-In is ready immediately.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAuth('signup');
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Sign Up</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAuth('login');
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-800 text-sm font-semibold hover:bg-zinc-100 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Log In</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 truncate">
                      {userDisplayName}
                    </div>
                    {userEmail && (
                      <div className="text-xs text-zinc-500 truncate">{userEmail}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === 'signout'}
                    onClick={() =>
                      void runAction('signout', onSignOut, 'Signed out to Guest Mode.')
                    }
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-100 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 2. Push Notifications (Within 3 Days + 9:00 AM) */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900 inline-flex items-center gap-2">
              <Bell className="w-4 h-4 text-zinc-500" />
              <span>Push Notifications (3-Day Alerts)</span>
            </h3>
            <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900">
                    Expiring Within 3 Days Alerts
                  </div>
                  <div className="text-xs text-zinc-500">
                    Notifies you with the exact item name whenever an item is ≤3 days from expiring
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={remindersEnabled}
                  aria-label="Toggle 3-day push notifications"
                  onClick={() => void onToggleReminders()}
                  className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-150 cursor-pointer ${
                    remindersEnabled ? 'bg-zinc-900' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition duration-150 ${
                      remindersEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200/70 text-xs">
                <span className="text-zinc-500">
                  Browser status:{' '}
                  <strong className="font-medium text-zinc-800 capitalize">
                    {notifState}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={onTestNotification}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-zinc-200 font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                >
                  Send Alert Now
                </button>
              </div>
            </div>
          </section>

          {/* 3. Household Pantry Sharing & Roles */}
          {isCloudSynced && pantry && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 inline-flex items-center gap-2">
                  <Users className="w-4 h-4 text-zinc-500" />
                  <span>Household Pantry</span>
                </h3>
                <span className="text-xs font-medium text-zinc-600">
                  Role: {isOwner ? 'Owner' : 'Member'}
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 space-y-4">
                {isOwner ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={pantryNameDraft}
                      onChange={(e) => setPantryNameDraft(e.target.value)}
                      maxLength={60}
                      aria-label="Pantry name"
                      className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-medium text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={
                        busyAction === 'rename' ||
                        !pantryNameDraft.trim() ||
                        pantryNameDraft.trim() === pantry.name
                      }
                      onClick={() =>
                        void runAction(
                          'rename',
                          () => onRenamePantry(pantryNameDraft),
                          'Pantry name updated.'
                        )
                      }
                      className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-medium disabled:opacity-40 cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-900">
                      {pantry.name}
                    </div>
                    {isSharedActive && personalPantryId && (
                      <button
                        type="button"
                        onClick={() => void runAction('switch', onSwitchToPersonal)}
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-900 underline underline-offset-2 cursor-pointer"
                      >
                        Switch to Personal
                      </button>
                    )}
                  </div>
                )}

                <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium text-zinc-500">
                      6-Digit Household Invite Code
                    </div>
                    <div className="mt-0.5 font-mono tabular-nums text-lg font-bold tracking-widest text-zinc-900">
                      {pantry.inviteCode}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyCode()}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-100 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        disabled={busyAction === 'regen'}
                        onClick={() =>
                          void runAction(
                            'regen',
                            onRegenerateCode,
                            'New 6-digit invite code generated.'
                          )
                        }
                        title="Generate new invite code"
                        aria-label="Regenerate 6-digit invite code"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-zinc-500 mb-2">
                    Members ({members.length})
                  </div>
                  <div className="divide-y divide-zinc-100 border border-zinc-200/80 rounded-xl overflow-hidden">
                    {members.map((member) => {
                      const isSelf = member.uid === currentUid;
                      return (
                        <div
                          key={member.uid}
                          className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white text-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-900 truncate">
                              {member.displayName}
                              {isSelf ? ' (You)' : ''}
                            </div>
                            <div className="text-xs text-zinc-500 capitalize">
                              {member.role}
                            </div>
                          </div>

                          {isOwner && !isSelf && (
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(
                                  `remove-${member.uid}`,
                                  () => onRemoveMember(member.uid),
                                  `Removed ${member.displayName}.`
                                )
                              }
                              aria-label={`Remove ${member.displayName}`}
                              className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}

                          {!isOwner && isSelf && isSharedActive && (
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(
                                  'leave',
                                  onLeavePantry,
                                  'Left shared pantry.'
                                )
                              }
                              className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                            >
                              Leave
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100">
                  <label
                    htmlFor="join-code-input"
                    className="block text-xs font-medium text-zinc-700 mb-1.5 inline-flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Join a roommate or family pantry</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="join-code-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit code"
                      className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-mono tabular-nums tracking-widest text-zinc-900 placeholder:tracking-normal placeholder:font-sans placeholder:text-zinc-400 focus:bg-white focus:border-zinc-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={joinCode.length !== 6 || busyAction === 'join'}
                      onClick={() =>
                        void runAction(
                          'join',
                          async () => {
                            await onJoinByCode(joinCode);
                            setJoinCode('');
                          },
                          'Joined household pantry!'
                        )
                      }
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs sm:text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap cursor-pointer"
                    >
                      {busyAction === 'join' ? 'Joining...' : 'Join Pantry'}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 4. Waste Analytics (30-Day Recharts Bar Chart) */}
          <WasteAnalyticsSection wasteHistory={wasteHistory} />
        </div>
      </div>
    </div>
  );
};
