import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function useUnreadCount(userId: string | null): [number, () => void] {
  const [count, setCount] = useState(0);

  async function refresh() {
    if (!userId) { setCount(0); return; }
    const { data, error } = await supabase
      .from('admin_messages')
      .select('read_by')
      .or(`target.eq.all,target.eq.${userId}`);
    if (!error && data) {
      const unread = data.filter(
        (m: { read_by: string[] }) => !m.read_by.includes(userId)
      ).length;
      setCount(unread);
    }
  }

  return [count, refresh];
}
