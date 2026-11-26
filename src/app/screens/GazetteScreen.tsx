/** Écran 5 — La Gazette (édition quotidienne du Maître du Jeu) et La Taverne (chat en temps réel). */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GazetteEdition, TavernMessage } from '../api/types.ts';
import { navigate, useRoute } from '../lib/router.ts';
import { useUnread } from '../state/UnreadContext.tsx';
import { Avatar, Badge, Button, Card, Empty, SectionTitle, Tabs, TextArea, cx } from '../components/ui.tsx';
import { dateLong, relative, timeShort } from '../lib/format.ts';
import { CHANNEL_LABEL } from '../lib/labels.ts';
import { useData, useGame, useNow } from '../state/GameContext.tsx';

type Tab = 'gazette' | 'taverne';

/** Liens des notifications : #/gazette/taverne, #/gazette/agora, #/gazette/chuchotements (V4.3). */
const CHANNEL_OF_PARAM: Record<string, TavernMessage['channel']> = { taverne: 'village_square', agora: 'agora_hall', chuchotements: 'whisper' };
const PARAM_OF_CHANNEL: Record<TavernMessage['channel'], string> = { village_square: 'taverne', agora_hall: 'agora', whisper: 'chuchotements' };

function Dot({ n }: { n: number }) {
  return n > 0 ? <span className="ml-1.5 inline-block min-w-4 rounded-full bg-ember-600 px-1 text-center text-[10px] leading-4 text-white">{n}</span> : null;
}

/** Vrai quand l'onglet du navigateur est affiché (on ne marque pas « lu » en arrière-plan). */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/** Rendu Markdown minimal (paragraphes, titres, listes, gras, italique) sans HTML brut. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function Markdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*] /, ''))}</li>
              ))}
            </ul>
          );
        }
        const heading = /^(#{1,3}) (.*)$/.exec(block);
        if (heading) return <h4 key={i} className="pt-1 font-serif text-lg">{inline(heading[2]!)}</h4>;
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </div>
  );
}

function Edition({ e, latest }: { e: GazetteEdition; latest?: boolean }) {
  return (
    <article className={cx('parchment rounded-2xl border border-parchment-300 p-4 shadow-sm', latest && 'border-wood-500/40')}>
      <header className="mb-3 border-b-2 border-double border-ink/40 pb-2 text-center">
        <p className="font-serif text-xs uppercase tracking-[0.3em] text-ink-soft">La Gazette des Gaulois</p>
        <p className="text-xs text-ink-soft">
          {dateLong(e.edition_date)} · {e.generated_by === 'ai' ? 'plume du Maître du Jeu' : 'édition de secours'}
        </p>
      </header>
      <h2 className="mb-3 text-center font-serif text-2xl leading-tight">{e.headline}</h2>
      <div className="text-sm leading-relaxed">
        <Markdown source={e.body_markdown} />
      </div>
      {e.sections.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {e.sections.map((s) => (
            <section key={s.title} className="rounded-xl bg-parchment-100/80 p-3">
              <h3 className="mb-1 font-serif text-base">{s.title}</h3>
              <ul className="list-disc space-y-1 pl-4 text-sm">
                {s.items.map((it, j) => (
                  <li key={j}>{inline(it)}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

function Gazette() {
  const data = useData();
  const now = useNow(60_000);
  const { counts, markSeen } = useUnread();
  const visible = usePageVisible();
  useEffect(() => {
    if (visible) markSeen('gazette');
  }, [visible, counts?.gazette, markSeen]);
  const [archive, setArchive] = useState(false);
  const [latest, ...older] = data.gazette;
  const events = data.events.filter((e) => e.visibility === 'public').slice(0, 30);
  const v = data.village;
  return (
    <div className="space-y-4">
      {latest ? <Edition e={latest} latest /> : <Empty>La première édition paraîtra cette nuit.</Empty>}
      <Card title="Le monde réel autour du hameau">
        <p className="text-sm">
          🌦️ {v.real_weather_summary} — {Math.round(v.real_temp_min_c)}° / {Math.round(v.real_temp_c)}°C{v.real_precip_mm > 0 ? `, ${v.real_precip_mm} mm` : ''}
          {v.real_snow_cm > 0 ? `, ${v.real_snow_cm} cm de neige` : ''}
        </p>
        {v.real_news_headline && <p className="mt-1 text-sm text-ink-soft">📰 {v.real_news_headline}</p>}
      </Card>
      <SectionTitle>Fil des événements</SectionTitle>
      {events.length === 0 ? (
        <Empty>Rien à signaler.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-parchment-200">
            {events.map((e) => (
              <li key={e.id} className="py-2">
                <p className="text-sm font-semibold leading-snug">{e.title}</p>
                {e.body && <p className="text-sm text-ink-soft">{e.body}</p>}
                <p className="text-xs text-ink-soft">{relative(e.created_at, now)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {older.length > 0 && (
        <>
          <Button variant="ghost" className="w-full" onClick={() => setArchive(!archive)}>
            {archive ? 'Masquer les archives' : `Archives (${older.length} éditions)`}
          </Button>
          {archive && older.map((e) => <Edition key={e.id} e={e} />)}
        </>
      )}
    </div>
  );
}

function Tavern({ initialChannel }: { initialChannel: TavernMessage['channel'] }) {
  const data = useData();
  const { api, toast } = useGame();
  const now = useNow(30_000);
  const { counts, markSeen } = useUnread();
  const visible = usePageVisible();
  const [channel, setChannelState] = useState<TavernMessage['channel']>(initialChannel);
  const setChannel = (c: TavernMessage['channel']) => {
    setChannelState(c);
    navigate('gazette', PARAM_OF_CHANNEL[c]);
  };
  useEffect(() => setChannelState(initialChannel), [initialChannel]);
  const [messages, setMessages] = useState<TavernMessage[]>([]);
  const [text, setText] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await api.loadTavern(channel));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  }, [api, channel, toast]);

  useEffect(() => {
    void load();
    let timer: number | undefined;
    const unsubscribe = api.subscribe((table) => {
      if (table !== 'tavern_messages') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 250);
    });
    // Les chuchotements protégés par la RLS ne sont pas diffusés en temps réel : relecture périodique.
    const poll = window.setInterval(() => void load(), channel === 'whisper' ? 15_000 : 60_000);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [api, channel, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Salon affiché = lu (et de nouveau lu à chaque message arrivé pendant qu'on le regarde)
  const unreadHere = counts?.[channel] ?? 0;
  useEffect(() => {
    if (visible) markSeen(channel);
  }, [visible, channel, unreadHere, messages.length, markSeen]);

  const others = data.players.filter((p) => p.is_active_slot && p.id !== data.me.id);
  const send = async () => {
    const content = text.trim();
    if (!content) return;
    if (channel === 'whisper' && recipients.length === 0) return toast('error', 'Choisissez au moins un destinataire.');
    setSending(true);
    try {
      await api.postMessage(channel, content, channel === 'whisper' ? recipients : undefined);
      setText('');
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };
  const author = (id: string | null) => data.players.find((p) => p.id === id);

  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {(['village_square', 'agora_hall', 'whisper'] as const).map((c) => (
          <button key={c} onClick={() => setChannel(c)} className={cx('shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold', channel === c ? 'bg-wood-700 text-parchment-50' : 'bg-parchment-200 text-ink')}>
            {CHANNEL_LABEL[c]}
            {c !== channel && <Dot n={counts?.[c] ?? 0} />}
          </button>
        ))}
      </div>
      <Card className="max-h-[55vh] min-h-64 overflow-y-auto">
        {messages.length === 0 ? (
          <Empty>Personne n'a encore pris la parole ici.</Empty>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              if (m.is_system_event) {
                return (
                  <li key={m.id} className="rounded-xl bg-gold-100 px-3 py-2 text-center text-sm">
                    {m.content}
                    <span className="block text-[11px] text-ink-soft">{timeShort(m.created_at)}</span>
                  </li>
                );
              }
              const a = author(m.sender_id);
              const mine = m.sender_id === data.me.id;
              return (
                <li key={m.id} className={cx('flex gap-2', mine && 'flex-row-reverse')}>
                  <Avatar emoji={a?.avatar_emoji ?? '🗣️'} color={a?.avatar_color ?? '#888'} size="sm" />
                  <div className={cx('max-w-[78%] rounded-2xl px-3 py-2 text-sm', mine ? 'bg-wood-700 text-parchment-50' : 'bg-parchment-100')}>
                    <p className={cx('text-[11px] font-semibold', mine ? 'text-parchment-200' : 'text-wood-700')}>
                      {a?.display_name ?? 'Inconnu'} · {relative(m.created_at, now)}
                      {m.channel === 'whisper' && m.recipient_ids && <> → {m.recipient_ids.map((id) => author(id)?.display_name ?? '?').join(', ')}</>}
                    </p>
                    <p className="whitespace-pre-line break-words">{m.content}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottom} />
      </Card>
      {channel === 'whisper' && (
        <div className="flex flex-wrap gap-1.5">
          {others.map((p) => {
            const on = recipients.includes(p.id);
            return (
              <button key={p.id} onClick={() => setRecipients(on ? recipients.filter((r) => r !== p.id) : [...recipients, p.id])} className={cx('rounded-full px-2.5 py-1 text-xs font-semibold', on ? 'bg-river-600 text-white' : 'bg-parchment-200')}>
                {p.avatar_emoji} {p.display_name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-end gap-2">
        <TextArea
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="min-h-11 flex-1"
          placeholder={channel === 'whisper' ? 'Message privé…' : 'Votre message…'}
        />
        <Button onClick={() => void send()} disabled={sending || !text.trim()}>
          Envoyer
        </Button>
      </div>
      {channel === 'agora_hall' && (
        <p className="text-xs text-ink-soft">
          <Badge tone="gold">Hall de l'Agora</Badge> Débats sur les scrutins en cours ; les votes se font dans l'onglet Agora.
        </p>
      )}
    </div>
  );
}

export function GazetteScreen() {
  const route = useRoute();
  const { counts } = useUnread();
  const linked = route.param ? CHANNEL_OF_PARAM[route.param] : undefined;
  const [tab, setTab] = useState<Tab>(linked ? 'taverne' : 'gazette');
  useEffect(() => {
    if (linked) setTab('taverne');
  }, [linked, route.param]);
  const tavernUnread = counts ? counts.village_square + counts.agora_hall + counts.whisper : 0;
  return (
    <div>
      <Tabs<Tab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          navigate('gazette', t === 'taverne' ? PARAM_OF_CHANNEL[linked ?? 'village_square'] : null);
        }}
        tabs={[
          { id: 'gazette', label: 'La Gazette', badge: tab === 'gazette' ? 0 : counts?.gazette ?? 0 },
          { id: 'taverne', label: 'La Taverne', badge: tab === 'taverne' ? 0 : tavernUnread },
        ]}
      />
      {tab === 'gazette' ? <Gazette /> : <Tavern initialChannel={linked ?? 'village_square'} />}
    </div>
  );
}
