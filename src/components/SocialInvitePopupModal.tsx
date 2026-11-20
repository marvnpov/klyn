import React from 'react';
import { BellRing, Check, Disc3, Radio, Sparkles, X } from 'lucide-react';
import { PendingInvitePopup, UserAccount } from '../types/music';
import { CoverArt } from './CoverArt';
import { UserAvatar } from './UserAvatar';

interface SocialInvitePopupModalProps {
  invite: PendingInvitePopup | null;
  currentUser: UserAccount;
  onAccept: (invite: PendingInvitePopup) => void;
  onDecline: (invite: PendingInvitePopup) => void;
  onDismiss: () => void;
}

export const SocialInvitePopupModal: React.FC<SocialInvitePopupModalProps> = ({
  invite,
  currentUser,
  onAccept,
  onDecline,
  onDismiss,
}) => {
  if (!invite) return null;

  const isBlend = invite.type === 'blend';
  const friendFirst = invite.friend.name.split(' ')[0];

  return (
    <div
      className="fixed inset-0 z-[78] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-md"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isBlend ? 'Blend Invitation Notification' : 'Listen Party Invitation Notification'}
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated relative w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 text-white shadow-2xl"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full opacity-35 blur-3xl"
          style={{ background: invite.friend.accentColor }}
        />

        {/* Top Bar */}
        <div className="relative z-10 flex items-center justify-between pb-4 border-b border-white/10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-white/85">
            <BellRing className="h-4 w-4 text-white" />
            <span>
              {isBlend ? 'Blend Pop-Up Sent' : 'Listen Party Pop-Up Sent'} · {invite.sentAtLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close invitation pop-up"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/75 hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Visual Identity Lockup */}
        <div className="relative z-10 mt-5 flex items-center gap-4">
          <div className="flex items-center -space-x-3 shrink-0">
            <UserAvatar
              name={currentUser.name}
              initials={currentUser.initials}
              avatarUrl={currentUser.avatarUrl}
              avatarStyle={currentUser.avatarStyle}
              accentColor={currentUser.accentColor}
              sizeClass="h-12 w-12"
              textClass="text-xs"
              className="border-2 border-[#1b1b1f] shadow-lg"
            />
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full font-display text-xs font-bold text-white border-2 border-[#1b1b1f] shadow-lg"
              style={{ background: invite.friend.accentColor }}
            >
              {invite.friend.initials}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
              Incoming Pop-Up on {friendFirst}&apos;s Device
            </p>
            <h3 className="font-display mt-0.5 text-lg font-bold text-white leading-snug">
              {isBlend
                ? `${currentUser.name.split(' ')[0]} wants to Klyn AI Blend`
                : `${currentUser.name.split(' ')[0]} started a Listen Party`}
            </h3>
          </div>
        </div>

        {/* Invite Payload Details */}
        {isBlend ? (
          <div className="relative z-10 mt-4 rounded-2xl bg-white/[0.06] border border-white/12 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Klyn AI Taste Match</span>
              </span>
              <span className="text-sm font-bold text-white tabular-nums">
                {invite.matchPct}% Sync
              </span>
            </div>
            <p className="text-xs leading-relaxed text-white/65">
              Accepting invokes <strong className="text-white">Klyn AI</strong> to match both
              listeners&apos; libraries and immediately save a tailored Blend playlist into{' '}
              <strong className="text-white">both {currentUser.name.split(' ')[0]}&apos;s and {friendFirst}&apos;s</strong>{' '}
              libraries.
            </p>
          </div>
        ) : (
          <div className="relative z-10 mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/12 p-3">
            <CoverArt
              src={invite.track.coverUrl}
              alt={invite.track.title}
              fallbackGradient={invite.track.fallbackGradient}
              className="h-14 w-14 shrink-0 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/55">
                <Radio className="h-3 w-3" />
                <span>Synced Room Track</span>
              </p>
              <p className="truncate text-sm font-semibold text-white">{invite.track.title}</p>
              <p className="truncate text-xs text-white/60">
                {invite.track.artist} · Either user can switch songs
              </p>
            </div>
          </div>
        )}

        {/* Friend Response Controls (Accept / Decline) */}
        <div className="relative z-10 mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onDecline(invite)}
            className="liquid-glass flex items-center justify-center gap-1.5 rounded-full py-2.5 px-4 text-xs sm:text-sm font-semibold text-white/80 hover:bg-white/12 transition-colors"
          >
            <X className="h-4 w-4" />
            <span>Decline</span>
          </button>

          <button
            type="button"
            onClick={() => onAccept(invite)}
            className="flex items-center justify-center gap-1.5 rounded-full bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-black shadow-lg transition-transform hover:scale-[1.01] active:scale-95"
          >
            {isBlend ? <Disc3 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            <span>{isBlend ? 'Accept Blend' : 'Accept & Join'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
