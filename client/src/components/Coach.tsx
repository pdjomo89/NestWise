import { useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { capitalize } from '../categories';
import { useLang } from '../prefs';

// The improvement coach. Everything shown here is computed server-side from the
// household's real data (convex/coach.ts) — this component only draws it, and
// records one snapshot per visit so the progress chart has history to show.
export default function Coach({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t, lang } = useLang();
  const coach = useQuery(api.coach.get, { lang });
  const history = useQuery(api.coach.history);
  const record = useMutation(api.coach.recordToday);

  // One write per mount, once there's something worth recording. The ref guards
  // against the effect re-running when the query result updates.
  const recorded = useRef(false);
  useEffect(() => {
    if (!recorded.current && coach?.ready && coach.graded) {
      recorded.current = true;
      void record({});
    }
  }, [coach?.ready, coach?.graded, record]);

  if (coach === undefined) return <p className="muted">{t('Loading…')}</p>;

  if (!coach.ready) {
    return (
      <div className="grid">
        <section className="panel">
          <h2>{t('Your financial coach')}</h2>
          <p className="lead">
            {t('Add your income, accounts and bills and the coach will grade where you stand, then tell you the single highest-impact move to make next.')}
          </p>
          <div className="row-actions" style={{ marginTop: 14 }}>
            <button type="submit" onClick={() => onNavigate('budget')}>
              {t('Set up your budget')}
            </button>
            <button className="toggle-btn" onClick={() => onNavigate('accounts')}>
              {t('Add accounts')}
            </button>
          </div>
        </section>
      </div>
    );
  }

  // Yesterday-or-earlier reference point, so "since" never compares today to
  // today. `history` includes the snapshot this visit just wrote.
  const past = (history ?? []).filter((h) => h.date < new Date().toISOString().slice(0, 10));
  const previous = past.length ? past[past.length - 1] : null;
  const delta = previous ? coach.score - previous.score : null;

  return (
    <div className="grid">
      <section className="panel coach-hero">
        <ScoreRing score={coach.graded ? coach.score : null} grade={coach.grade} />
        <div className="coach-hero-text">
          <h2>{t('Financial health')}</h2>
          <p className={`coach-band ${coach.graded ? '' : 'pending'}`}>{coach.band}</p>
          {coach.graded && delta !== null && previous && (
            <p className={`coach-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {delta > 0 ? '+' : ''}
              {delta} {t('since')} {formatDay(previous.date, lang)}
            </p>
          )}
          <p className="muted small">
            {coach.graded
              ? t('Graded on cash flow, emergency fund, debt, retirement and spending discipline — weighted by how much each one moves your future.')
              : `${coach.tracked}/${coach.trackedTotal} ${t('areas tracked. Your score appears once the coach can see enough of the picture — the moves below are what it needs.')}`}
          </p>
        </div>
      </section>

      {coach.moves.length > 0 && (
        <section className="panel">
          <h2>{t('Your next moves')}</h2>
          <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>
            {t('Ranked by how many points each would win back.')}
          </p>
          <ol className="move-list">
            {coach.moves.map((m, i) => (
              <li key={i} className="move">
                <span className="move-rank">{i + 1}</span>
                <div className="move-body">
                  <div className="move-head">
                    <strong>{m.title}</strong>
                    <span className="move-points">+{Math.round(m.points)}</span>
                  </div>
                  <p>{m.detail}</p>
                  {m.tab && (
                    <button className="link-btn" onClick={() => onNavigate(m.tab as string)}>
                      {t('Go to')} {t(capitalize(m.tab))} →
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="panel">
        <h2>{t('Where you stand')}</h2>
        <ul className="pillar-list">
          {coach.pillars.map((p) => (
            <li key={p.key} className={`pillar ${p.status}`}>
              <div className="pillar-head">
                <span className="pillar-label">{p.label}</span>
                <span className="pillar-score">
                  {p.status === 'unknown' ? t('not tracked') : `${Math.round(p.score)}/100`}
                </span>
              </div>
              <div className="pillar-track">
                <div className="pillar-bar" style={{ width: `${Math.max(2, p.score)}%` }} />
              </div>
              <p className="pillar-headline">{p.headline}</p>
              <p className="muted small">{p.detail}</p>
            </li>
          ))}
        </ul>
        <p className="muted small">
          {t('Areas we can’t measure yet are left out of the score rather than counted as zero.')}
        </p>
      </section>

      {(history?.length ?? 0) > 1 && <Progress history={history!} lang={lang} />}
    </div>
  );
}

// Donut gauge. Stroke-dasharray on a circle is enough here — no chart library,
// and it scales cleanly in both themes.
// `score === null` means there isn't enough measured to grade — the ring stays
// empty and shows a dash rather than implying a number we don't stand behind.
function ScoreRing({ score, grade }: { score: number | null; grade: string }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const filled = score === null ? 0 : (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const color =
    score === null
      ? 'var(--border)'
      : score >= 85
      ? 'var(--green)'
      : score >= 55
      ? 'var(--brand-gold)'
      : 'var(--red)';

  return (
    <svg
      className="score-ring"
      viewBox="0 0 128 128"
      role="img"
      aria-label={score === null ? 'Not enough data to score' : `Score ${score} of 100`}
    >
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
      {score !== null && (
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform="rotate(-90 64 64)"
        />
      )}
      <text x="64" y={score === null ? 74 : 60} className="score-num" textAnchor="middle">
        {score === null ? '—' : score}
      </text>
      {score !== null && (
        <text x="64" y="82" className="score-grade" textAnchor="middle">
          {grade}
        </text>
      )}
    </svg>
  );
}

// Score over time. One point per day the coach was opened, so the line is a
// record of visits rather than a continuous series — drawn as an even-spaced
// polyline for that reason.
function Progress({ history, lang }: { history: { date: string; score: number }[]; lang: string }) {
  const { t } = useLang();
  const w = 600;
  const h = 120;
  const pad = 10;
  const points = history.map((p, i) => {
    const x = pad + (i / Math.max(1, history.length - 1)) * (w - pad * 2);
    const y = h - pad - (p.score / 100) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first = history[0];
  const last = history[history.length - 1];
  const change = last.score - first.score;

  return (
    <section className="panel">
      <h2>{t('Your progress')}</h2>
      <svg className="coach-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--brand-green)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((pt, i) => {
          const [x, y] = pt.split(',');
          return <circle key={i} cx={x} cy={y} r="3" fill="var(--brand-green)" />;
        })}
      </svg>
      <p className="muted small">
        {formatDay(first.date, lang)} → {formatDay(last.date, lang)} ·{' '}
        {change > 0 ? '+' : ''}
        {change} {t('points')}
      </p>
    </section>
  );
}

function formatDay(iso: string, lang: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
