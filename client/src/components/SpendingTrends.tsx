import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { usd, usdCompact } from '../format';
import { colorFor, chartColorFor, capitalize, CHART_CATEGORY_ORDER } from '../categories';
import { niceTicks } from '../chart';
import { useLang, useTheme } from '../prefs';

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
  const { theme } = useTheme();
  const trends = useQuery(api.trends.get, { lang });

  if (!trends) return null;
  const { months, categories, plan } = trends;

  // Draw in the fixed palette order, not by size: a category keeps its colour
  // and its slot in every group, so month-to-month comparison is by position as
  // well as by hue. Anything outside the known set is appended, still stable.
  const series = [...categories].sort((a, b) => {
    const ai = CHART_CATEGORY_ORDER.indexOf(a.category);
    const bi = CHART_CATEGORY_ORDER.indexOf(b.category);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  // One shared y-scale across every bar — the whole point of grouping is that
  // a tall bar in March means the same as a tall bar in August.
  const peak = Math.max(1, ...series.flatMap((c) => c.byMonth));
  const { axisMax, ticks } = niceTicks(peak);

  return (
    <section className="panel">
      <h2>{t('Spending trends')}</h2>
      <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>
        {t('How each category has moved over recent months, from your logged transactions.')}
      </p>

      {categories.length === 0 ? (
        <p className="muted">{t('Not enough transaction history yet to show a trend.')}</p>
      ) : (
        <>
          <div className="grouped-chart">
            <div className="grouped-yaxis">
              {[...ticks].reverse().map((v) => (
                <span key={v} className="grouped-tick">
                  {usdCompact(v)}
                </span>
              ))}
            </div>
            <div className="grouped-plot">
              {/* Gridlines sit behind the bars and stay recessive. */}
              <div className="grouped-grid">
                {[...ticks].reverse().map((v) => (
                  <span key={v} className="grouped-gridline" />
                ))}
              </div>
              <div className="grouped-months">
                {months.map((m, mi) => (
                  <div className="grouped-month" key={m}>
                    <div className="grouped-bars">
                      {series.map((c) => {
                        const v = c.byMonth[mi] ?? 0;
                        return (
                          <span
                            key={c.category}
                            className="grouped-bar"
                            style={{
                              height: `${(v / axisMax) * 100}%`,
                              // No floor on an empty month — a 2px stub would
                              // read as "a little was spent" when none was.
                              minHeight: v > 0 ? 2 : 0,
                              background: chartColorFor(c.category, theme),
                            }}
                            title={`${t(capitalize(c.category))} · ${monthLabel(m, lang)}: ${usd(v)}`}
                          />
                        );
                      })}
                    </div>
                    <span className="grouped-month-label">{monthLabel(m, lang)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend doubles as the table view: identity is never colour alone,
              and it keeps the Latest / vs-avg figures the rows used to show. */}
          <ul className="grouped-legend">
            {series.map((c) => (
              <li key={c.category}>
                <span
                  className="legend-swatch"
                  style={{ background: chartColorFor(c.category, theme) }}
                />
                <span className="legend-name">{t(capitalize(c.category))}</span>
                <span className="legend-latest">{usd(c.latest)}</span>
                <DeltaBadge direction={c.direction} delta={c.delta} t={t} />
              </li>
            ))}
          </ul>
        </>
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
