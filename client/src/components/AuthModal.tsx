import React, { useEffect, useState } from 'react';
import { X, Lock, Mail, User as UserIcon, Check, Eye, EyeOff, Sparkles, LogIn, UserPlus, Chrome } from 'lucide-react';
import { AuthUser } from '../types';
import { ModalShell } from './ui/ModalShell';
import { AccountIdentityCard, SignOutButton } from './AccountPanel';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onLogin: (identifier: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  onRegister: (data: { username: string; email: string; password: string; name: string; color: string }) => Promise<{ success: boolean; error?: string }>;
  onGuest?: (name: string, color: string) => Promise<{ success: boolean; error?: string }>;
  onContinueAsGuest?: (name?: string, color?: string) => Promise<{ success: boolean; error?: string }>;
  onGoogleLogin?: (options?: { email?: string; name?: string }) => Promise<{ success: boolean; error?: string; isDemo?: boolean; message?: string }>;
  onLogout: () => void;
}

const AVATAR_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#0f172a', // Slate
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  onRegister,
  onGuest,
  onContinueAsGuest,
  onGoogleLogin,
  onLogout,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'guest'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Clear credentials whenever the dialog closes so they are not left in memory
  // or shown again when the user reopens it.
  useEffect(() => {
    if (!isOpen) {
      setIdentifier('');
      setPassword('');
      setUsername('');
      setEmail('');
      setName('');
      setShowPassword(false);
      setError(null);
      setIsSubmitting(false);
      setIsGoogleLoading(false);
    }
  }, [isOpen]);

  const handleGoogleSignIn = async () => {
    if (!onGoogleLogin) return;
    setError(null);
    setIsGoogleLoading(true);
    const res = await onGoogleLogin();
    setIsGoogleLoading(false);
    if (!res.success) {
      setError(res.error || 'Google sign-in could not be completed.');
    } else {
      onClose();
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please fill in both username/email and password.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const res = await onLogin(identifier.trim(), password);
    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Login failed.');
    } else {
      onClose();
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 5) {
      setError('Password must be at least 5 characters long.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const res = await onRegister({
      username: username.trim(),
      email: email.trim(),
      password,
      name: name.trim() || username.trim(),
      color,
    });
    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Registration failed.');
    } else {
      onClose();
    }
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const guestFn = onContinueAsGuest || onGuest;
    if (!guestFn) {
      onClose();
      return;
    }
    const res = await guestFn(name.trim() || 'Guest Artist', color);
    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Could not start guest session.');
    } else {
      onClose();
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => {
        if (currentUser) onClose();
      }}
      closeOnBackdrop={Boolean(currentUser)}
      titleId="auth-modal-title"
      overlayId="auth-modal-overlay"
      dialogId="auth-modal-dialog"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              W
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-sm font-semibold text-slate-900 dark:text-white">
                {currentUser && !currentUser.isGuest ? 'Account Profile' : 'Whiteboard Authentication'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {currentUser && !currentUser.isGuest
                  ? `Signed in as @${currentUser.username}`
                  : 'Sign in to access your whiteboard rooms and collaborative canvas'}
              </p>
            </div>
          </div>
          {currentUser && (
            <button
              type="button"
              aria-label="Close account dialog"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* If already signed in with full account */}
        {currentUser && !currentUser.isGuest ? (
          <div className="p-6 space-y-5">
            <AccountIdentityCard
              user={currentUser}
              statusLabel="Active"
              density="comfortable"
            />

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Account Benefits</div>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-4">
                <li>Create and host custom named session rooms.</li>
                <li>Permanent room admin rights (kick users, revoke permissions).</li>
                <li>Access your created rooms anytime across browser sessions.</li>
              </ul>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <SignOutButton
                variant="outline"
                label="Sign Out"
                onSignOut={() => {
                  onLogout();
                  onClose();
                }}
              />
            </div>
          </div>
        ) : (
          /* Sign In / Register / Guest Tabs */
          <div className="p-6">
            {/* Tab switch */}
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-5">
              <button
                type="button"
                aria-pressed={tab === 'login'}
                onClick={() => {
                  setTab('login');
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  tab === 'login'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
              <button
                type="button"
                aria-pressed={tab === 'register'}
                onClick={() => {
                  setTab('register');
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  tab === 'register'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Register
              </button>
              <button
                type="button"
                aria-pressed={tab === 'guest'}
                onClick={() => {
                  setTab('guest');
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                  tab === 'guest'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Guest
              </button>
            </div>

            {error && (
              <div role="alert" className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
                {error}
              </div>
            )}

            {/* Google OAuth Quick Button */}
            {(tab === 'login' || tab === 'register') && onGoogleLogin && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading || isSubmitting}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer shadow-2xs"
                >
                  <Chrome className="w-4 h-4 text-blue-500" />
                  <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
                </button>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200/80 dark:border-slate-800"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase">
                    <span className="bg-white dark:bg-slate-900 px-2.5 text-slate-400 dark:text-slate-500 font-medium tracking-wider">
                      Or with credentials
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: LOGIN */}
            {tab === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="auth-login-identifier" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Username or Email</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id="auth-login-identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="e.g. alex or alex@example.com"
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-login-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id="auth-login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Signing in...' : 'Sign In to Account'}
                </button>
              </form>
            )}

            {/* TAB: REGISTER */}
            {tab === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <label htmlFor="auth-register-username" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
                  <input
                    id="auth-register-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. alex_design"
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="auth-register-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id="auth-register-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@domain.com"
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-register-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Display Name (Optional)</label>
                  <input
                    id="auth-register-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="auth-register-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id="auth-register-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 5 characters"
                      required
                      className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div id="auth-avatar-color-label" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Avatar Color</div>
                  <div role="group" aria-labelledby="auth-avatar-color-label" className="flex items-center gap-2">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        aria-label={`Use ${c} avatar color`}
                        aria-pressed={color === c}
                        onClick={() => setColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                          color === c ? 'ring-2 ring-blue-500 ring-offset-2 scale-110' : 'hover:scale-105'
                        }`}
                      >
                        {color === c && <Check className="w-3 h-3 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Creating account...' : 'Create Account & Sign In'}
                </button>
              </form>
            )}

            {/* TAB: GUEST */}
            {tab === 'guest' && (
              <form onSubmit={handleGuestSubmit} className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Join anonymously without an email or password. You can participate in whiteboards and voice chat right away.
                </p>

                <div>
                  <label htmlFor="auth-guest-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Guest Nickname</label>
                  <input
                    id="auth-guest-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Quick Sketcher"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <div id="auth-marker-color-label" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Marker Color</div>
                  <div role="group" aria-labelledby="auth-marker-color-label" className="flex items-center gap-2">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        aria-label={`Use ${c} avatar color`}
                        aria-pressed={color === c}
                        onClick={() => setColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                          color === c ? 'ring-2 ring-blue-500 ring-offset-2 scale-110' : 'hover:scale-105'
                        }`}
                      >
                        {color === c && <Check className="w-3 h-3 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 py-2.5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <span>{isSubmitting ? 'Joining...' : 'Continue as Guest'}</span>
                </button>
              </form>
            )}
          </div>
        )}
    </ModalShell>
  );
};
