/**
 * OnlineLobby.tsx — オンライン対戦モード選択UI
 *
 * 4モード:
 *   1. フレンドマッチ  — 従来の鍵付ルーム（Create / Join）
 *   2. ランダムマッチ  — ランダムマッチング
 *   3. 公式戦          — Coming Soon（サブスク限定・レーティング変動）
 *   4. 大会            — Coming Soon（運営発行キーで入室）
 */
import { useEffect, useRef, useState } from 'react';
import { createOnlineGame, joinOnlineGame, joinOrCreateRandomGame } from '../lib/onlineGame';
import { useLang } from '../lib/lang';

interface Props {
  userId: string;
  onGameReady: (gameId: string, color: 'black' | 'white', roomCode?: string) => void;
  onCancel: () => void;
}

type Mode = 'select' | 'friend' | 'random' | 'ranked' | 'tournament';
type FriendTab = 'create' | 'join';

export function OnlineLobby({ userId, onGameReady, onCancel }: Props) {
  const { t } = useLang();
  const [mode, setMode] = useState<Mode>('select');

  function handleBack() {
    setMode('select');
  }

  return (
    <div style={styles.overlay} onClick={mode === 'select' ? onCancel : undefined}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          {mode !== 'select' ? (
            <button type="button" onClick={handleBack} style={styles.backBtn}>←</button>
          ) : (
            <span style={{ width: 28 }} />
          )}
          <span style={styles.title}>{t.onlinePlay}</span>
          <button type="button" onClick={onCancel} style={styles.closeBtn}>✕</button>
        </div>

        {mode === 'select' && (
          <ModeSelect onSelect={setMode} />
        )}
        {mode === 'friend' && (
          <FriendMatch userId={userId} onGameReady={onGameReady} />
        )}
        {mode === 'random' && (
          <RandomMatch userId={userId} onGameReady={onGameReady} onCancel={handleBack} />
        )}
        {mode === 'ranked' && (
          <ComingSoon label={t.onlineRanked} desc={t.onlineRankedDesc} />
        )}
        {mode === 'tournament' && (
          <ComingSoon label={t.onlineTournament} desc={t.onlineTournamentDesc} />
        )}
      </div>
    </div>
  );
}

// ── モード選択画面 ─────────────────────────────────────────────────────────────

function ModeSelect({ onSelect }: { onSelect: (m: Mode) => void }) {
  const { t } = useLang();

  const modes: { key: Mode; label: string; desc: string; soon?: boolean }[] = [
    { key: 'friend',     label: t.onlineFriendMatch,  desc: t.onlineFriendMatchDesc },
    { key: 'random',     label: t.onlineRandomMatch,  desc: t.onlineRandomMatchDesc },
    { key: 'ranked',     label: t.onlineRanked,       desc: t.onlineRankedDesc,      soon: true },
    { key: 'tournament', label: t.onlineTournament,   desc: t.onlineTournamentDesc,  soon: true },
  ];

  return (
    <div style={styles.modeList}>
      {modes.map(({ key, label, desc, soon }) => (
        <button
          key={key}
          type="button"
          style={{ ...styles.modeBtn, ...(soon ? styles.modeBtnSoon : {}) }}
          onClick={() => onSelect(key)}
          disabled={soon}
        >
          <span style={styles.modeBtnLabel}>{label}</span>
          <span style={styles.modeBtnDesc}>{desc}</span>
          {soon && <span style={styles.soonBadge}>{t.onlineComingSoon}</span>}
        </button>
      ))}
    </div>
  );
}

// ── フレンドマッチ ────────────────────────────────────────────────────────────

function FriendMatch({
  userId,
  onGameReady,
}: {
  userId: string;
  onGameReady: Props['onGameReady'];
}) {
  const { t } = useLang();
  const [tab, setTab] = useState<FriendTab>('create');
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
      onGameReady(result.gameId, 'black', result.roomCode);
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
    <div>
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
  );
}

// ── ランダムマッチ ────────────────────────────────────────────────────────────

function RandomMatch({
  userId,
  onGameReady,
  onCancel,
}: {
  userId: string;
  onGameReady: Props['onGameReady'];
  onCancel: () => void;
}) {
  const { t } = useLang();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  async function handleSearch() {
    cancelled.current = false;
    setSearching(true);
    setError(null);
    const result = await joinOrCreateRandomGame(userId);
    if (cancelled.current) return;
    setSearching(false);
    if ('error' in result) {
      setError(result.error);
    } else {
      onGameReady(result.gameId, result.color, result.roomCode);
    }
  }

  function handleCancel() {
    cancelled.current = true;
    setSearching(false);
    onCancel();
  }

  // 画面表示時に自動で検索開始
  useEffect(() => {
    handleSearch();
    return () => { cancelled.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ ...styles.body, alignItems: 'center', textAlign: 'center', paddingTop: '1.5rem' }}>
      {searching ? (
        <>
          <div style={styles.spinner} />
          <p style={{ ...styles.desc, marginTop: '1rem' }}>{t.onlineRandomSearching}</p>
          <button type="button" style={{ ...styles.primaryBtn, marginTop: '0.5rem', background: '#888' }} onClick={handleCancel}>
            {t.onlineRandomCancel}
          </button>
        </>
      ) : error ? (
        <>
          <p style={styles.error}>{error}</p>
          <button type="button" style={styles.primaryBtn} onClick={handleSearch}>Retry</button>
        </>
      ) : null}
    </div>
  );
}

// ── Coming Soon ───────────────────────────────────────────────────────────────

function ComingSoon({ label, desc }: { label: string; desc: string }) {
  const { t } = useLang();
  return (
    <div style={{ ...styles.body, alignItems: 'center', textAlign: 'center', paddingTop: '1.5rem' }}>
      <span style={{ fontSize: '2rem' }}>🔒</span>
      <p style={{ fontWeight: 700, fontSize: '1rem', margin: '0.5rem 0 0.25rem' }}>{label}</p>
      <p style={{ ...styles.desc, marginBottom: '0.75rem' }}>{desc}</p>
      <span style={styles.soonBadge}>{t.onlineComingSoon}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    width: 28,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.1rem',
    cursor: 'pointer',
    color: '#555',
    width: 28,
    textAlign: 'left' as const,
    padding: 0,
  },
  // モード選択
  modeList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.6rem',
  },
  modeBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: '0.2rem',
    padding: '0.85rem 1rem',
    background: '#f5f5f5',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left' as const,
    position: 'relative' as const,
  },
  modeBtnSoon: {
    opacity: 0.6,
    cursor: 'default',
  },
  modeBtnLabel: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: '#111',
  },
  modeBtnDesc: {
    fontSize: '0.78rem',
    color: '#666',
  },
  soonBadge: {
    display: 'inline-block',
    marginTop: '0.2rem',
    padding: '0.1rem 0.5rem',
    background: '#e0e0e0',
    borderRadius: 4,
    fontSize: '0.7rem',
    color: '#555',
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  // フレンドマッチ
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
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  desc: {
    fontSize: '0.85rem',
    color: '#555',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  codeInput: {
    padding: '0.7rem',
    fontSize: '1.4rem',
    letterSpacing: '0.3em',
    textAlign: 'center' as const,
    border: '1px solid #ccc',
    borderRadius: 6,
    fontFamily: 'monospace',
    textTransform: 'uppercase' as const,
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
    flexDirection: 'column' as const,
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
    textTransform: 'uppercase' as const,
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
    textAlign: 'center' as const,
    margin: 0,
  },
  error: {
    color: '#c00',
    fontSize: '0.8rem',
    marginTop: '0.5rem',
  },
  // ランダムマッチ
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #e0e0e0',
    borderTop: '3px solid #111',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
