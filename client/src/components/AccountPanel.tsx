import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { AuthUser } from '../types';
import { USER_PROFILE_PALETTE } from '../constants/palettes';
import { ColorSwatches } from './ui/ColorSwatches';
import { ModalShell } from './ui/ModalShell';
import { ThemeToggle } from './ui/ThemeToggle';
import type { ThemeMode } from '../hooks/useTheme';

export interface AccountIdentityCardProps {
  user: Pick<AuthUser, 'name' | 'color' | 'username' | 'email'>;
  statusLabel?: string;
  density?: 'compact' | 'comfortable';
  action?: React.ReactNode;
  className?: string;
}

/**
 * Shared signed-in account summary card used across profile and auth dialogs.
 */
export const AccountIdentityCard: React.FC<AccountIdentityCardProps> = ({
  user,
  statusLabel = 'Signed In',
  density = 'comfortable',
  action,
  className = '',
}) => {
  const isCompact = density === 'compact';

  return (
    <div
      className={`rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center ${
        isCompact ? 'p-3.5 justify-between gap-3' : 'p-4 gap-3.5'
      } ${className}`.trim()}
    >
      <div className={`flex items-center min-w-0 ${isCompact ? 'gap-3' : 'gap-3.5 flex-1'}`}>
        <div
          className={`rounded-full flex items-center justify-center text-white font-bold shadow-xs shrink-0 ${
            isCompact ? 'w-10 h-10 text-sm' : 'w-12 h-12 text-base'
          }`}
          style={{ backgroundColor: user.color || '#3b82f6' }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`flex items-center ${isCompact ? 'gap-1.5' : 'gap-2'}`}>
            <span
              className={`text-slate-900 dark:text-white truncate font-semibold ${
                isCompact ? 'text-xs' : 'text-sm'
              }`}
            >
              {user.name}
            </span>
            <span
              className={`bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-full shrink-0 ${
                isCompact
                  ? 'px-1.5 py-0.2 text-[9px] font-semibold'
                  : 'px-2 py-0.5 text-[10px] font-medium'
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <p
            className={`truncate ${
              isCompact
                ? 'text-[11px] text-slate-400 dark:text-slate-500'
                : 'text-xs text-slate-500 dark:text-slate-400'
            }`}
          >
            @{user.username}
          </p>
          <p
            className={`truncate ${
              isCompact
                ? 'text-[10px] text-slate-500 dark:text-slate-400'
                : 'text-xs text-slate-400 dark:text-slate-500'
            }`}
          >
            {user.email}
          </p>
        </div>
      </div>
      {action}
    </div>
  );
};

export interface SignOutButtonProps {
  onSignOut: () => void;
  variant?: 'icon' | 'footer' | 'outline';
  label?: string;
  id?: string;
  title?: string;
  ariaLabel?: string;
  className?: string;
}

const SIGN_OUT_VARIANT_CLASSES: Record<NonNullable<SignOutButtonProps['variant']>, string> = {
  icon: 'p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer shrink-0',
  footer:
    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer',
  outline:
    'flex-1 px-4 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5',
};

/**
 * Shared sign-out trigger supporting icon-only, footer, and full outline variants.
 */
export const SignOutButton: React.FC<SignOutButtonProps> = ({
  onSignOut,
  variant = 'outline',
  label = 'Sign Out',
  id,
  title,
  ariaLabel,
  className = '',
}) => (
  <button
    id={id}
    type="button"
    aria-label={ariaLabel ?? (variant === 'icon' ? label : undefined)}
    title={title}
    onClick={onSignOut}
    className={`${SIGN_OUT_VARIANT_CLASSES[variant]} ${className}`.trim()}
  >
    <LogOut className={variant === 'footer' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
    {variant !== 'icon' && <span>{label}</span>}
  </button>
);

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: { id: string; name: string; color: string };
  authUser: AuthUser | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onUpdateUserName: (name: string) => void;
  onUpdateUserColor: (color: string) => void;
  onOpenAuthModal: () => void;
  onLogout: () => void;
}

/**
 * Shared profile, display-identity, color, and account-status dialog.
 */
export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  authUser,
  theme,
  onToggleTheme,
  onUpdateUserName,
  onUpdateUserColor,
  onOpenAuthModal,
  onLogout,
}) => {
  const [tempName, setTempName] = useState(currentUser.name);

  useEffect(() => {
    if (isOpen) {
      setTempName(currentUser.name);
    }
  }, [isOpen, currentUser.name]);

  const handleSignOut = () => {
    onLogout();
    onClose();
  };

  const isSignedInAccount = Boolean(authUser && !authUser.isGuest);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      titleId="profile-modal-title"
      overlayClassName="z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      panelClassName="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
            W
          </div>
          <h3 id="profile-modal-title" className="font-bold text-slate-900 dark:text-white text-base">
            Profile & Identity
          </h3>
        </div>
        <ThemeToggle variant="compact-icon" theme={theme} onToggle={onToggleTheme} />
      </div>

      {/* Account Status Card */}
      {isSignedInAccount && authUser ? (
        <AccountIdentityCard
          user={authUser}
          statusLabel="Signed In"
          density="compact"
          className="mb-4"
          action={
            <SignOutButton
              id="modal-signout-btn"
              variant="icon"
              ariaLabel="Sign out"
              title="Sign Out"
              onSignOut={handleSignOut}
            />
          }
        />
      ) : (
        <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/60 flex items-center justify-between">
          <div className="text-xs text-blue-700 dark:text-blue-300">
            <p className="font-semibold">Guest Session</p>
            <p className="text-[11px] text-blue-600/80 dark:text-blue-400">Save rooms by signing in</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAuthModal();
            }}
            className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            Sign In
          </button>
        </div>
      )}

      {/* Display Name Input */}
      <div className="mb-4">
        <label htmlFor="profile-display-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          Display Name
        </label>
        <input
          id="profile-display-name"
          type="text"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          maxLength={20}
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          placeholder="e.g. Alex Doe"
        />
      </div>

      {/* Cursor / Avatar Color */}
      <div className="mb-5">
        <div id="profile-color-label" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          Cursor & Avatar Color
        </div>
        <ColorSwatches
          colors={USER_PROFILE_PALETTE}
          selectedColor={currentUser.color}
          onSelect={onUpdateUserColor}
          size="md"
          ringTone="slate"
          ariaLabelledBy="profile-color-label"
          ariaLabelPrefix="Use "
          ariaLabelSuffix=" cursor and avatar color"
          className="gap-2"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        {isSignedInAccount ? (
          <SignOutButton variant="footer" label="Log Out" onSignOut={handleSignOut} />
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (tempName.trim()) {
                onUpdateUserName(tempName.trim());
              }
              onClose();
            }}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm cursor-pointer transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
