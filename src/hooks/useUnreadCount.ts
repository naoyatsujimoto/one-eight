import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function useUnreadCount(
  userId: string | null,
  confirmedAt?: string | null,
): [number, () => void] {
  const [count, setCount] = useState(0);

  async function refresh() {
    if (!userId) { setCount(0); return; }
    let query = supabase
      .from('admin_messages')
      .select('read_by')
      .or(`target.eq.all,target.eq.${userId}`);

    // Only count messages sent after the user confirmed their email
    if (confirmedAt) {
      query = query.gte('created_at', confirmedAt);
    }

    const { data, error } = await query;
    if (!error && data) {
      const unread = data.filter(
        (m: { read_by: string[] }) => !m.read_by.includes(userId)
      ).length;
      setCount(unread);
    }
  }

  return [count, refresh];
}
