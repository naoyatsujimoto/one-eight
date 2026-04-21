/**
 * OnlineLobby.tsx — オンライン対戦のルーム作成・入室UI
 */
import { useState } from 'react';
import { createOnlineGame, joinOnlineGame } from '../lib/onlineGame';
import { useLang } from '../lib/lang';

interface Props {
  userId: string;
  onGameReady: (gameId: string, color: 'black' | 'white') => void;
  onCancel: () => void;
}

type LobbyTab = 'create' | 'join';

export function OnlineLobby({ userId, onGameReady, onCancel }: Props) {
  const { t } = useLang();
  const [tab, setTab] = useState<LobbyTab>('create');
  const [roomCode, setRoomCode] = useState('');
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    const result = await createOnlineGame(userId);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
    } else {
      setCreatedRoomCode(result.roomCode);
      onGameReady(result.gameId, 'black');
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!roomCode.trim()) return;
    setLoading(true);
    setError(null);
    const result = await joinOnlineGame(roomCode.trim());
    setLoading(false);
    if ('error' in result) {
      const msg = result.error.includes('room_not_found')
        ? t.onlineRoomNotFound
        : result.error.includes('cannot_join_own_game')
          ? t.onlineCannotJoinOwn
          : result.error;
      setError(msg);
    } else {
      onGameReady(result.gameId, result.color);
    }
  }

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>{t.onlinePlay}</span>
          <button type="button" onClick={onCancel} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.tabs}>
          <button
            type="button"
            style={{ ...styles.tab, ...(tab === 'create' ? styles.tabActive : {}) }}
            onClick={() => { setTab('create'); setError(null); }}
          >
            {t.onlineCreate}
          </button>
          <button
            type="button"
            style={{ ...styles.tab, ...(tab === 'join' ? styles.tabActive : {}) }}
            onClick={() => { setTab('join'); setError(null); setCreatedRoomCode(null); }}
          >
            {t.onlineJoin}
          </button>
        </div>

        {tab === 'create' && (
          <div style={styles.body}>
            {!createdRoomCode ? (
              <>
                <p style={styles.desc}>{t.onlineCreateDesc}</p>
                <button
                  type="button"
                  style={styles.primaryBtn}
                  onClick={handleCreate}
                  disabled={loading}
                >
                  {loading ? t.onlineCreating : t.onlineCreateBtn}
                </button>
              </>
            ) : (
              <>
                <p style={styles.desc}>{t.onlineWaitingForOpponent}</p>
                <div style={styles.roomCodeBox}>
                  <span style={styles.roomCodeLabel}>{t.onlineRoomCode}</span>
                  <span style={styles.roomCode}>{createdRoomCode}</span>
                </div>
                <p style={styles.hint}>{t.onlineShareCode}</p>
              </>
            )}
          </div>
        )}

        {tab === 'join' && (
          <div style={styles.body}>
            <p style={styles.desc}>{t.onlineJoinDesc}</p>
            <form onSubmit={handleJoin} style={styles.form}>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
                maxLength={6}
                style={styles.codeInput}
                autoFocus
              />
              <button
                type="submit"
                style={styles.primaryBtn}
                disabled={loading || roomCode.length < 6}
              >
                {loading ? t.onlineJoining : t.onlineJoinBtn}
              </button>
            </form>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: '1.25rem',
    width: '90%',
    maxWidth: 380,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  title: {
    fontWeight: 700,
    fontSize: '1rem',
    letterSpacing: '0.05em',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    color: '#555',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #eee',
    marginBottom: '1rem',
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
  },
  tabActive: {
    color: '#111',
    borderBottom: '2px solid #111',
    fontWeight: 600,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  desc: {
    fontSize: '0.85rem',
    color: '#555',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  codeInput: {
    padding: '0.7rem',
    fontSize: '1.4rem',
    letterSpacing: '0.3em',
    textAlign: 'center',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  primaryBtn: {
    padding: '0.65rem',
    fontSize: '0.95rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  roomCodeBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '1rem',
    background: '#f5f5f5',
    borderRadius: 8,
  },
  roomCodeLabel: {
    fontSize: '0.72rem',
    color: '#888',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  roomCode: {
    fontSize: '2rem',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.3em',
    color: '#111',
  },
  hint: {
    fontSize: '0.78rem',
    color: '#999',
    textAlign: 'center',
    margin: 0,
  },
  error: {
    color: '#c00',
    fontSize: '0.8rem',
    marginTop: '0.5rem',
  },
};
