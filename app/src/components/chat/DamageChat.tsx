import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';
import { Send, Loader2, MessageSquare } from 'lucide-react';

interface ChatMessage {
  id: string;
  message: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  is_mine: boolean;
}

interface Props {
  damageId: string;
  title?: string;
  accent?: 'blue' | 'orange';
}

export function DamageChat({ damageId, title = 'Chat zum Schaden', accent = 'blue' }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['damage-chat', damageId],
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('damage_comments')
        .select('id, message, created_at, user_id, user:users!user_id ( full_name )')
        .eq('damage_id', damageId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        message: string;
        created_at: string;
        user_id: string | null;
        user: { full_name: string } | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        message: r.message,
        created_at: r.created_at,
        user_id: r.user_id,
        user_name: r.user?.full_name ?? null,
        is_mine: r.user_id === profile?.id,
      }));
    },
  });

  async function handleSend() {
    if (!text.trim() || !profile) return;
    setSending(true);
    try {
      const { error } = await supabase.from('damage_comments').insert({
        damage_id: damageId,
        user_id: profile.id,
        message: text.trim(),
      } as never);
      if (error) throw error;
      setText('');
      await qc.invalidateQueries({ queryKey: ['damage-chat', damageId] });
      await qc.invalidateQueries({ queryKey: ['damage-detail', damageId] });
      await qc.invalidateQueries({ queryKey: ['dashboard-activity'] });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[DamageChat] send failed:', e);
      alert(`Senden fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  const ownBubble = accent === 'orange' ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white';

  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-4 py-2.5">
        <div className="flex items-center gap-2 font-medium">
          <MessageSquare className={`h-4 w-4 ${accent === 'orange' ? 'text-orange-600' : 'text-blue-600'}`} />
          {title}
          <span className="text-xs font-normal text-muted-foreground">({messages.length})</span>
        </div>
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {isLoading && <div className="text-center text-xs text-muted-foreground">Lade …</div>}
        {!isLoading && messages.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            Noch keine Nachrichten. Schreib die erste!
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.is_mine ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 ${
                m.is_mine ? ownBubble : 'bg-slate-100 text-slate-900'
              }`}
            >
              {m.message}
            </div>
            <div className={`mt-0.5 px-2 text-[10px] text-muted-foreground ${m.is_mine ? 'text-right' : ''}`}>
              {m.user_name ?? '—'} ·{' '}
              {new Date(m.created_at).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder="Nachricht … (Enter = senden, Shift+Enter = neue Zeile)"
            className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-50 ${
              accent === 'orange' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
