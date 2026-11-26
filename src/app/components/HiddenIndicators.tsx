/** Affichage générique des indicateurs cachés (visibles du seul titulaire du rôle ou de son conjoint). */
import type { HiddenIndicator } from '../api/types.ts';
import { humanize } from '../lib/format.ts';
import { HIDDEN_TITLE } from '../lib/labels.ts';
import { Card } from './ui.tsx';

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-soft">—</span>;
  if (typeof value === 'boolean') return <span className={value ? 'font-semibold text-ember-600' : 'text-moss-700'}>{value ? 'Oui' : 'Non'}</span>;
  if (typeof value === 'number') return <span className="tabular-nums font-semibold">{Number.isInteger(value) ? value : value.toFixed(2)}</span>;
  if (typeof value === 'string') return <span>{value}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-soft">aucun</span>;
    if (value.every((v) => typeof v !== 'object' || v === null)) return <span>{value.join(', ')}</span>;
    const keys = Array.from(new Set(value.flatMap((v) => Object.keys(v as object))));
    return (
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-max text-xs">
          <thead>
            <tr className="text-left text-ink-soft">
              {keys.map((k) => (
                <th key={k} className="py-1 pr-3 font-semibold">
                  {humanize(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.map((row, i) => (
              <tr key={i} className="border-t border-parchment-200">
                {keys.map((k) => (
                  <td key={k} className="py-1 pr-3 align-top">
                    <Value value={(row as Record<string, unknown>)[k]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <dl className="mt-1 grid gap-x-3 gap-y-1 border-l-2 border-parchment-200 pl-3 text-xs">
      {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
        <div key={k} className="flex flex-wrap justify-between gap-2">
          <dt className="text-ink-soft">{humanize(k)}</dt>
          <dd>
            <Value value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function HiddenIndicators({ rows }: { rows: HiddenIndicator[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.role_code} title={`🔒 ${HIDDEN_TITLE[row.role_code] ?? humanize(row.role_code)}`} subtitle="Indicateurs cachés — visibles de vous seul" tone="river">
          <dl className="space-y-2 text-sm">
            {Object.entries(row.payload).map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-ink">{humanize(k)}</dt>
                <dd className="text-ink">
                  <Value value={v} />
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}
