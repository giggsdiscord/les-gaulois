/** Écran d'accueil : grille des 7 fondateurs + 3 places, puis code PIN à 4 chiffres. */
import { useEffect, useState } from 'react';
import type { LoginCard } from '../api/types.ts';
import { Avatar, Button, Spinner, cx } from '../components/ui.tsx';
import { useGame } from '../state/GameContext.tsx';

function PinPad({ value, onChange, onSubmit, busy }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean }) {
  const press = (d: string) => value.length < 4 && onChange(value + d);
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-5 flex justify-center gap-3" aria-label={`${value.length} chiffre(s) saisi(s)`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('h-4 w-4 rounded-full border-2 border-wood-600', i < value.length && 'bg-wood-600')} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl bg-white text-2xl font-semibold text-ink shadow-sm active:bg-parchment-200">
            {d}
          </button>
        ))}
        <button onClick={() => onChange(value.slice(0, -1))} className="h-16 rounded-2xl text-sm font-semibold text-ink-soft active:bg-parchment-200" aria-label="Effacer">
          Effacer
        </button>
        <button onClick={() => press('0')} className="h-16 rounded-2xl bg-white text-2xl font-semibold text-ink shadow-sm active:bg-parchment-200">
          0
        </button>
        <button
          onClick={onSubmit}
          disabled={value.length !== 4 || busy}
          className="h-16 rounded-2xl bg-wood-600 text-sm font-bold text-parchment-50 disabled:opacity-40"
          aria-label="Valider le code"
        >
          {busy ? <Spinner /> : 'Entrer'}
        </button>
      </div>
    </div>
  );
}

export function LoginScreen() {
  const { api, signIn } = useGame();
  const [cards, setCards] = useState<LoginCard[] | null>(null);
  const [selected, setSelected] = useState<LoginCard | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.listLoginCards().then(setCards).catch((e: unknown) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [api]);

  useEffect(() => {
    if (pin.length !== 4 || !selected || busy) return;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function submit() {
    if (!selected || pin.length !== 4) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = await api.login(selected.id, pin);
      if (!token) {
        setMessage('Code PIN incorrect.');
        setPin('');
      } else {
        await signIn(token);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="parchment min-h-screen">
      <header className="wood-bar px-5 pb-8 pt-10 text-parchment-50">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-parchment-300">Pyrénées de Lleida · 30 ha · 295 000 €</p>
          <h1 className="mt-2 font-serif text-4xl leading-tight">Les Gaulois</h1>
          <p className="mt-1 text-parchment-200">Simulation coopérative de village & Micro-État</p>
        </div>
      </header>
      <main className="mx-auto -mt-5 max-w-3xl px-4 pb-10">
        {api.mode === 'demo' && (
          <div className="mb-4 rounded-2xl border border-gold-500/40 bg-gold-100 px-4 py-3 text-sm text-wood-700">
            <strong>Mode démo local</strong> : la partie tourne dans ce navigateur. Code PIN de tous les personnages : <strong>0000</strong>.
          </div>
        )}
        {!selected ? (
          <>
            <h2 className="mb-3 font-serif text-xl">Qui êtes-vous ?</h2>
            {!cards && !message && <Spinner />}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cards?.map((c) => (
                <button
                  key={c.id}
                  disabled={!c.is_active_slot}
                  onClick={() => {
                    setSelected(c);
                    setPin('');
                    setMessage(null);
                  }}
                  className={cx(
                    'flex min-h-32 flex-col items-start gap-2 rounded-2xl border p-3 text-left shadow-sm transition-transform',
                    c.is_active_slot ? 'border-parchment-200 bg-white active:scale-[0.98]' : 'border-dashed border-parchment-300 bg-parchment-100/60 opacity-70',
                  )}
                >
                  <Avatar emoji={c.avatar_emoji} color={c.avatar_color} />
                  <span>
                    <span className="block font-semibold text-ink">{c.display_name}</span>
                    <span className="block text-xs text-ink-soft">{c.is_active_slot ? c.character_name : 'Place à pourvoir'}</span>
                  </span>
                  <span className="text-xs leading-snug text-ink-soft line-clamp-2">{c.role_title}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-3xl bg-white/70 p-5 shadow-sm">
            <button onClick={() => setSelected(null)} className="mb-4 text-sm font-semibold text-wood-600">
              ← Changer de personnage
            </button>
            <div className="mb-5 flex items-center gap-3">
              <Avatar emoji={selected.avatar_emoji} color={selected.avatar_color} size="lg" />
              <div>
                <p className="font-serif text-2xl">{selected.display_name}</p>
                <p className="text-sm text-ink-soft">
                  {selected.character_name} · {selected.role_title}
                </p>
              </div>
            </div>
            <PinPad value={pin} onChange={setPin} onSubmit={() => void submit()} busy={busy} />
          </div>
        )}
        {message && <p className="mt-4 rounded-xl bg-ember-100 px-4 py-3 text-sm font-medium text-ember-600">{message}</p>}
        {!selected && (
          <Button variant="ghost" className="mt-6" onClick={() => window.location.reload()}>
            Actualiser
          </Button>
        )}
      </main>
    </div>
  );
}
