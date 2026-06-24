import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getProfile, isProActive } from '../lib/profile';
import { useLang } from '../lib/lang';
import { SplashScreen } from './SplashScreen';

interface Props {
  children: ReactNode;
}

type LoginMode = 'magic' | 'otp';
type OtpStep = 'email' | 'code';

export function AuthGate({ children }: Props) {
  const { user, loading, signInWithMagicLink, signInWithOtpCode, verifyOtpCode, signOut } = useAuth();
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<OtpStep>('email');
  const [sent, setSent] = useState(false);
  const [proActive, setProActive] = useState(false);

  useEffect(() => {
    if (!user) { setProActive(false); return; }
    getProfile(user.id).then((profile) => {
      setProActive(profile ? isProActive(profile) : false);
    });
  }, [user?.id]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<LoginMode>('magic');
  const [splashDismissed, setSplashDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem('one8_splash_dismissed') === '1'; } catch { return false; }
  });

  function handleSplashDismiss() {
    try { sessionStorage.setItem('one8_splash_dismissed', '1'); } catch { /* ignore */ }
    setSplashDismissed(true);
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <p style={styles.muted}>{t.loading}</p>
      </div>
    );
  }

  if (!user && !splashDismissed) {
    return <SplashScreen onDismiss={handleSplashDismiss} />;
  }

  if (!user) {
    async function handleMagicLink(e: React.FormEvent) {
      e.preventDefault();
      if (!email.trim()) return;
      setSubmitting(true);
      setError(null);
      const { error: err } = await signInWithMagicLink(email.trim());
      setSubmitting(false);
      if (err) setError(err);
      else setSent(true);
    }

    async function handleSendOtp(e: React.FormEvent) {
      e.preventDefault();
      if (!email.trim()) return;
      setSubmitting(true);
      setError(null);
      const { error: err } = await signInWithOtpCode(email.trim());
      setSubmitting(false);
      if (err) {
        setError(err);
      } else {
        setOtpStep('code');
        setOtpCode('');
      }
    }

    async function handleVerifyOtp(e: React.FormEvent) {
      e.preventDefault();
      if (!email.trim() || !otpCode.trim()) return;
      setSubmitting(true);
      setError(null);
      const { error: err } = await verifyOtpCode(email.trim(), otpCode.trim());
      setSubmitting(false);
      if (err) setError(t.authInvalidCode);
    }

    async function handleResendOtp() {
      setSubmitting(true);
      setError(null);
      const { error: err } = await signInWithOtpCode(email.trim());
      setSubmitting(false);
      if (err) setError(err);
      else setOtpCode('');
    }

    function switchMode(next: LoginMode) {
      setMode(next);
      setError(null);
      setSent(false);
      setOtpStep('email');
      setOtpCode('');
    }

    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <h1 style={styles.title}>ONE EIGHT</h1>
          <p style={styles.tagline}>
            {t.authTagline}
          </p>

          {/* Tab switcher */}
          <div style={styles.tabs}>
            <button
              type="button"
              style={{ ...styles.tab, ...(mode === 'magic' ? styles.tabActive : {}) }}
              onClick={() => switchMode('magic')}
            >
              {t.authMagicLink}
            </button>
            <button
              type="button"
              style={{ ...styles.tab, ...(mode === 'otp' ? styles.tabActive : {}) }}
              onClick={() => switchMode('otp')}
            >
              {t.authOtpLogin}
            </button>
          </div>

          {/* Magic Link form */}
          {mode === 'magic' && (
            sent ? (
              <p style={styles.info}>
                {t.authEmailSent}
              </p>
            ) : (
              <form onSubmit={handleMagicLink} style={styles.form}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  style={styles.input}
                  autoFocus
                />
                {error && <p style={styles.error}>{error}</p>}
                <button type="submit" disabled={submitting} style={styles.button}>
                  {submitting ? t.authSending : t.authSendMagicLink}
                </button>
              </form>
            )
          )}

          {/* OTP Email Code form */}
          {mode === 'otp' && (
            <div>
              <p style={styles.hint}>{t.authCodeLoginHint}</p>
              {otpStep === 'email' ? (
                <form onSubmit={handleSendOtp} style={styles.form}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    style={styles.input}
                    autoFocus
                  />
                  {error && <p style={styles.error}>{error}</p>}
                  <button type="submit" disabled={submitting} style={styles.button}>
                    {submitting ? t.authSending : t.authSendLoginCode}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} style={styles.form}>
                  <p style={styles.info}>{t.authCodeSent}</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder={t.authEnterLoginCode}
                    required
                    style={styles.input}
                    autoFocus
                    autoComplete="one-time-code"
                  />
                  {error && <p style={styles.error}>{error}</p>}
                  <button type="submit" disabled={submitting} style={styles.button}>
                    {submitting ? t.authLoggingIn : t.authVerifyLoginCode}
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={submitting}
                    style={styles.resendBtn}
                  >
                    {t.authResendCode}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Legal links */}
          <div style={styles.legalLinks}>
            <a href="/pricing.html" style={styles.legalLink}>Pricing</a>
            <a href="/terms.html" style={styles.legalLink}>Terms</a>
            <a href="/privacy.html" style={styles.legalLink}>Privacy</a>
            <a href="/refund.html" style={styles.legalLink}>Refund</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={styles.signOutBar}>
        <span style={styles.emailLabel}>{user.email}</span>
        {proActive && (
          <span style={styles.proBadge}>PRO</span>
        )}
        <button type="button" onClick={signOut} style={styles.signOutBtn}>
          Sign out
        </button>
      </div>
      {children}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#fff',
  },
  card: {
    textAlign: 'center',
    padding: '2rem',
    maxWidth: 360,
    width: '100%',
  },
  title: {
    fontFamily: "'Archivo', 'Inter', system-ui, sans-serif",
    fontSize: '1.5rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    marginBottom: '1.5rem',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #e0e0e0',
    marginBottom: '1.25rem',
  },
  tab: {
    flex: 1,
    padding: '0.5rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '0.85rem',
    color: '#888',
    transition: 'all 0.15s',
  },
  tabActive: {
    color: '#111',
    borderBottom: '2px solid #111',
    fontWeight: 600,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  input: {
    padding: '0.6rem 0.8rem',
    fontSize: '1rem',
    border: '1px solid #ccc',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    padding: '0.65rem',
    fontSize: '0.95rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  error: {
    color: '#c00',
    fontSize: '0.8rem',
    margin: 0,
  },
  info: {
    color: '#333',
    lineHeight: 1.7,
  },
  muted: {
    color: '#999',
  },
  signOutBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '0.4rem 1rem',
    background: '#f5f5f5',
    borderBottom: '1px solid #e0e0e0',
    fontSize: '0.78rem',
    width: '100%',
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },
  emailLabel: {
    color: '#555',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    minWidth: 0,
    flex: 1,
    textAlign: 'right' as const,
  },
  proBadge: {
    display: 'inline-block',
    background: '#111',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    padding: '2px 7px',
    borderRadius: '3px',
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
  },
  signOutBtn: {
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '0.2rem 0.6rem',
    cursor: 'pointer',
    fontSize: '0.78rem',
  },
  legalLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    marginTop: '1.5rem',
    flexWrap: 'wrap' as const,
  },
  legalLink: {
    fontSize: '0.72rem',
    color: '#aaa',
    textDecoration: 'none',
  },
  tagline: {
    fontSize: '0.82rem',
    color: '#888',
    lineHeight: 1.6,
    marginBottom: '1.25rem',
    marginTop: '-0.5rem',
    whiteSpace: 'pre-line' as const,
  },
  hint: {
    fontSize: '0.75rem',
    color: '#888',
    lineHeight: 1.6,
    marginBottom: '0.75rem',
    textAlign: 'left' as const,
  },
  resendBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8rem',
    color: '#555',
    textDecoration: 'underline',
    padding: '0.25rem 0',
    alignSelf: 'center' as const,
  },
};
