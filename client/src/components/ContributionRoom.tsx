import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { usd } from '../format';
import { useLang } from '../prefs';
import { errorMessage } from '../errors';
import { ROOM_PLANS, REFERENCE_YEAR, type RoomPlan } from '../canada';

// How much room is left in each registered plan this year.
//
// Canada only — the whole concept (and every number behind it) is CRA-specific.
// The panel never claims to know anyone's real room: it seeds each plan with
// the statutory annual limit and says, plainly, where the true figure lives.
export default function ContributionRoom() {
  const { t } = useLang();
  const year = new Date().getFullYear();
  const rows = useQuery(api.contributionRoom.list, { year });
  const setRoom = useMutation(api.contributionRoom.set);
  const [error, setError] = useState<string | null>(null);

  if (rows === undefined) {
    return (
      <section className="panel">
        <h2>{t('Contribution room')}</h2>
        <p className="muted">{t('Loading…')}</p>
      </section>
    );
  }

  const byKind = new Map(rows.map((r) => [r.kind, r]));
  const totalRemaining = ROOM_PLANS.reduce((sum, p) => {
    const row = byKind.get(p.kind);
    return sum + (row ? Math.max(0, row.limit - row.used) : 0);
  }, 0);

  async function save(plan: RoomPlan, limit: number, used: number) {
    setError(null);
    try {
      await setRoom({ kind: plan.kind, year, limit, used });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="panel">
      <h2>
        {t('Contribution room')} · {year}
      </h2>
      <p className="muted small" style={{ marginTop: -8 }}>
        {t(
          'How much you can still put into each registered plan this year. Enter your real room from your CRA Notice of Assessment or CRA My Account — it carries forward from every year you didn’t use in full, so it is usually well above the annual limit.'
        )}
      </p>

      {error && <div className="banner error">{error}</div>}

      <div className="room-list">
        {ROOM_PLANS.map((plan) => (
          <RoomRow
            key={plan.kind}
            plan={plan}
            row={byKind.get(plan.kind) ?? null}
            onSave={(limit, used) => save(plan, limit, used)}
          />
        ))}
      </div>

      {totalRemaining > 0 && (
        <p className="muted small">
          {`${t('Room still available across all plans:')} ${usd(totalRemaining)}.`}
        </p>
      )}
      <p className="muted small">
        {`${t('Starting amounts are')} ${REFERENCE_YEAR} ${t(
          'figures and are indexed each year — check the current limit before you rely on it.'
        )}`}
      </p>
    </section>
  );
}

function RoomRow({
  plan,
  row,
  onSave,
}: {
  plan: RoomPlan;
  row: { limit: number; used: number } | null;
  onSave: (limit: number, used: number) => void;
}) {
  const { t } = useLang();
  // Seed an untouched plan from the statutory limit so the row is usable
  // immediately; nothing is written until the user edits it.
  const [limit, setLimit] = useState(String(row?.limit ?? plan.annualLimit));
  const [used, setUsed] = useState(String(row?.used ?? 0));

  const limitNum = Math.max(0, Number(limit) || 0);
  const usedNum = Math.max(0, Number(used) || 0);
  const remaining = limitNum - usedNum;
  const pct = limitNum > 0 ? Math.min(100, (usedNum / limitNum) * 100) : 0;
  const over = remaining < 0;

  const commit = () => onSave(limitNum, usedNum);

  return (
    <div className={`room-row${over ? ' over' : ''}`}>
      <div className="room-head">
        <span className="room-name">{t(plan.label)}</span>
        <span className={`room-remaining${over ? ' over' : ''}`}>
          {over
            ? `${usd(Math.abs(remaining))} ${t('over')}`
            : `${usd(remaining)} ${t('left')}`}
        </span>
      </div>

      <div className="room-meter" role="presentation">
        <div className={`room-meter-fill${over ? ' over' : ''}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="room-inputs">
        <label className="field">
          <span>{t('Your room')}</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={commit}
          />
        </label>
        <label className="field">
          <span>{t('Contributed this year')}</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={used}
            onChange={(e) => setUsed(e.target.value)}
            onBlur={commit}
          />
        </label>
      </div>

      <p className="muted small room-note">
        {over
          ? t(
              'Over-contributing is penalised monthly until you take the excess out — check this against your CRA account.'
            )
          : `${t(plan.basis)}. ${t(plan.note)}`}
      </p>
    </div>
  );
}
