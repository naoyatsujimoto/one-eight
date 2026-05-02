import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface Props {
  children: ReactNode;
}

type LoginMode = 'magic' | 'password';

export function AuthGate({ children }: Props) {
  const { user, loading, signInWithMagicLink, signInWithPassword, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<LoginMode>('magic');

  if (loading) {
    return (
      <div style={styles.center}>
        <p style={styles.muted}>Loading…</p>
      </div>
    );
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

    async function handlePassword(e: React.FormEvent) {
      e.preventDefault();
      if (!email.trim() || !password) return;
      setSubmitting(true);
      setError(null);
      const { error: err } = await signInWithPassword(email.trim(), password);
      setSubmitting(false);
      if (err) setError(err);
    }

    function switchMode(next: LoginMode) {
      setMode(next);
      setError(null);
      setSent(false);
      setPassword('');
    }

    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <h1 style={styles.title}>ONE EIGHT</h1>

          {/* Tab switcher */}
          <div style={styles.tabs}>
            <button
              type="button"
              style={{ ...styles.tab, ...(mode === 'magic' ? styles.tabActive : {}) }}
              onClick={() => switchMode('magic')}
            >
              Magic Link
            </button>
            <button
              type="button"
              style={{ ...styles.tab, ...(mode === 'password' ? styles.tabActive : {}) }}
              onClick={() => switchMode('password')}
            >
              Password Login
            </button>
          </div>

          {/* Magic Link form */}
          {mode === 'magic' && (
            sent ? (
              <p style={styles.info}>
                Email sent.<br />
                Click the link in your inbox to log in.
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
                  {submitting ? 'Sending…' : 'Send Magic Link'}
                </button>
              </form>
            )
          )}

          {/* Password form */}
          {mode === 'password' && (
            <form onSubmit={handlePassword} style={styles.form}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={styles.input}
                autoFocus
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                style={styles.input}
              />
              {error && <p style={styles.error}>{error}</p>}
              <button type="submit" disabled={submitting} style={styles.button}>
                {submitting ? 'Logging in…' : 'Log In'}
              </button>
            </form>
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
};
