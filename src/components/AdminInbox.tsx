/**
 * AdminInbox.tsx — 運営からのメッセージ受信箱
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AdminMessage {
  id: string;
  title: string;
  body: string;
  target: string;
  read_by: string[];
  created_at: string;
}

interface Props {
  userId: string;
  userConfirmedAt?: string | null; // email_confirmed_at — filter messages sent after this date
  onClose: () => void;
  onUnreadChange?: () => void;
}

export function AdminInbox({ userId, userConfirmedAt, onClose, onUnreadChange }: Props) {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    let query = supabase
      .from('admin_messages')
      .select('*')
      .order('created_at', { ascending: false });

    // Only show messages created after the user confirmed their email
    if (userConfirmedAt) {
      query = query.gte('created_at', userConfirmedAt);
    }

    const { data, error } = await query;
    if (!error && data) {
      setMessages(data as AdminMessage[]);
      onUnreadChange?.();
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]);

  async function handleExpand(msg: AdminMessage) {
    setExpanded(expanded === msg.id ? null : msg.id);
    if (!msg.read_by.includes(userId)) {
      await supabase.rpc('mark_admin_message_read', { p_message_id: msg.id });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, read_by: [...m.read_by, userId] } : m
        )
      );
      onUnreadChange?.();
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>INBOX</span>
          <button type="button" onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {loading && <p style={s.muted}>Loading…</p>}
        {!loading && messages.length === 0 && (
          <p style={s.muted}>No messages</p>
        )}

        <div style={s.list}>
          {messages.map((msg) => {
            const isRead = msg.read_by.includes(userId);
            const isOpen = expanded === msg.id;
            return (
              <div
                key={msg.id}
                style={{ ...s.item, ...(isRead ? {} : s.itemUnread) }}
                onClick={() => handleExpand(msg)}
              >
                <div style={s.itemHeader}>
                  {!isRead && <span style={s.dot} />}
                  <span style={{ ...s.itemTitle, fontWeight: isRead ? 400 : 700 }}>
                    {msg.title}
                  </span>
                  <span style={s.itemDate}>
                    {new Date(msg.created_at).toLocaleDateString('ja-JP')}
                  </span>
                </div>
                {isOpen && (
                  <div style={s.body}>{msg.body}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── スタイル ─────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 400,
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: '1.25rem',
    width: '92%',
    maxWidth: 420,
    maxHeight: '80vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontWeight: 700,
    fontSize: '1rem',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    color: '#555',
  },
  muted: {
    color: '#aaa',
    fontSize: '0.85rem',
    textAlign: 'center',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  item: {
    border: '1px solid #eee',
    borderRadius: 8,
    padding: '0.75rem',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  itemUnread: {
    background: '#fafafa',
    borderColor: '#ddd',
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#e53',
    flexShrink: 0,
  },
  itemTitle: {
    flex: 1,
    fontSize: '0.88rem',
    color: '#111',
  },
  itemDate: {
    fontSize: '0.72rem',
    color: '#aaa',
    flexShrink: 0,
  },
  body: {
    marginTop: '0.6rem',
    fontSize: '0.82rem',
    color: '#444',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    borderTop: '1px solid #f0f0f0',
    paddingTop: '0.5rem',
  },
};
