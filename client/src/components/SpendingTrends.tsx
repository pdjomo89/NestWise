import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { usd } from '../format';
import { colorFor, capitalize } from '../categories';
import { useLang } from '../prefs';

// Short month labels for the trend axis, indexed by calendar month (0-11).
const MONTH_LABELS: Record<'en' | 'fr', string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
};
// A month key is "YYYY-MM"; take the month part → short label.
const monthLabel = (key: string, lang: 'en' | 'fr') =>
  MONTH_LABELS[lang][Number(key.slice(5, 7)) - 1] ?? key;

// Month-over-month category trends plus an auto savings plan. Rendered as a
// Dashboard section below the single-month spending chart.
export default function SpendingTrends() {
  const { t, lang } = useLang();
  const trends = useQuery(api.trends.get, { lang });

  if (!trends) return null;
  const { months, categories, plan } = trends;

  return (
    <section className="panel">
      <h2>{t('Spending trends')}</h2>
      <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>
        {t('How each category has moved over recent months, from your logged transactions.')}
      </p>

      {categories.length === 0 ? (
        <p className="muted">{t('Not enough transaction history yet to show a trend.')}</p>
      ) : (
        <div className="trend-table">
          <div className="trend-row trend-head">
            <span className="trend-cat" />
            <span className="trend-bars">
              {months.map((m) => (
                <span key={m} className="trend-month">
                  {monthLabel(m, lang)}
                </span>
              ))}
            </span>
            <span className="trend-latest">{t('Latest')}</span>
            <span className="trend-delta">{t('vs avg')}</span>
          </div>

          {categories.map((c) => {
            const max = Math.max(...c.byMonth, 1);
            return (
              <div className="trend-row" key={c.category}>
                <span className="trend-cat" style={{ color: colorFor(c.category) }}>
                  {t(capitalize(c.category))}
                </span>
                <span className="trend-bars">
                  {c.byMonth.map((v, i) => (
                    <span
                      className="trend-bar-cell"
                      key={i}
                      title={`${monthLabel(months[i], lang)}: ${usd(v)}`}
                    >
                      <span
                        className="trend-bar"
                        style={{
                          height: `${(v / max) * 100}%`,
                          background: colorFor(c.category),
                          opacity: i === c.byMonth.length - 1 ? 1 : 0.45,
                        }}
                      />
                    </span>
                  ))}
                </span>
                <span className="trend-latest">{usd(c.latest)}</span>
                <DeltaBadge direction={c.direction} delta={c.delta} t={t} />
              </div>
            );
          })}
        </div>
      )}

      <SavingsPlan plan={plan} t={t} />
    </section>
  );
}

function DeltaBadge({
  direction,
  delta,
  t,
}: {
  direction: string;
  delta: number;
  t: (s: string) => string;
}) {
  if (direction === 'new') return <span className="trend-delta badge-new">{t('new')}</span>;
  if (direction === 'flat') return <span className="trend-delta badge-flat">{t('flat')}</span>;
  const up = direction === 'up';
  return (
    <span className={`trend-delta ${up ? 'badge-up' : 'badge-down'}`}>
      {up ? '↑' : '↓'} {usd(Math.abs(delta))}
    </span>
  );
}

function SavingsPlan({
  plan,
  t,
}: {
  plan: { items: { category: string; from: number; to: number; save: number }[]; totalMonthly: number; incomeShare: number };
  t: (s: string) => string;
}) {
  if (plan.items.length === 0) {
    return (
      <div className="save-plan">
        <h3>{t('Savings plan')}</h3>
        <p className="muted small">
          {t('No categories are running above their usual level — spending looks steady.')}
        </p>
      </div>
    );
  }

  const sharePct = Math.round(plan.incomeShare * 100);
  return (
    <div className="save-plan">
      <h3>{t('Savings plan')}</h3>
      <p className="save-headline">
        {t('Trim')} <strong>{usd(plan.totalMonthly)}</strong>/{t('mo')}
        {sharePct > 0 && (
          <span className="muted small">
            {' '}
            · {t('about')} {sharePct}% {t('of income')}
          </span>
        )}
      </p>
      <ul className="save-list">
        {plan.items.map((it) => (
          <li key={it.category}>
            <span className="save-cat" style={{ color: colorFor(it.category) }}>
              {t(capitalize(it.category))}
            </span>
            <span className="muted small">
              {usd(it.from)} → {usd(it.to)}
            </span>
            <span className="save-amt">−{usd(it.save)}/{t('mo')}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        {t('Targets bring each rising category back to its own recent average.')}
      </p>
    </div>
  );
}
