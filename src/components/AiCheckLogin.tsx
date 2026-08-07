import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function AiCheckLogin() {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 既に認証済みなら / へ
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/');
    });
  }, []);

  // noindex メタタグを動的に追加・削除
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: id.trim(),
      password,
    });
    setSubmitting(false);
    if (err) {
      setError('Invalid ID or password.');
    } else {
      window.location.replace('/');
    }
  }

  return (
    <div style={styles.center}>
      <div style={styles.card}>
        <h1 style={styles.title}>AI Inspection Access</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>ID</label>
          <input
            type="text"
            value={id}
            onChange={e => setId(e.target.value)}
            required
            autoComplete="username"
            style={styles.input}
            autoFocus
          />
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={submitting} style={styles.button}>
            {submitting ? 'Logging in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fff' },
  card: { textAlign: 'center', padding: '2rem', maxWidth: 320, width: '100%' },
  title: { fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', letterSpacing: '0.05em' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.6rem', textAlign: 'left' },
  label: { fontSize: '0.8rem', color: '#555', fontWeight: 600 },
  input: { padding: '0.6rem 0.8rem', fontSize: '1rem', border: '1px solid #ccc', borderRadius: 6, outline: 'none', width: '100%', boxSizing: 'border-box' },
  button: { padding: '0.65rem', fontSize: '0.95rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginTop: '0.25rem' },
  error: { color: '#c00', fontSize: '0.8rem', margin: 0 },
};
