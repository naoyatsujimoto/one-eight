import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface Props {
  children: ReactNode;
}

export function AuthGate({ children }: Props) {
  const { user, loading, signInWithMagicLink, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div style={styles.center}>
        <p style={styles.muted}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      if (!email.trim()) return;
      setSubmitting(true);
      setError(null);
      const { error: err } = await signInWithMagicLink(email.trim());
      setSubmitting(false);
      if (err) {
        setError(err);
      } else {
        setSent(true);
      }
    }

    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <h1 style={styles.title}>ONE EIGHT</h1>
          {sent ? (
            <p style={styles.info}>
              ✉️ メールを送信しました。<br />
              受信ボックスのリンクをクリックしてください。
            </p>
          ) : (
            <form onSubmit={handleSubmit} style={styles.form}>
              <p style={styles.label}>メールアドレスでログイン</p>
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
                {submitting ? '送信中…' : 'Magic Link を送信'}
              </button>
            </form>
          )}
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
    fontFamily: 'Georgia, serif',
    fontSize: '2rem',
    letterSpacing: '0.15em',
    marginBottom: '1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  label: {
    fontSize: '0.85rem',
    color: '#555',
    margin: 0,
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
  },
  emailLabel: {
    color: '#555',
  },
  signOutBtn: {
    background: 'none',
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: '0.2rem 0.6rem',
    cursor: 'pointer',
    fontSize: '0.78rem',
  },
};
