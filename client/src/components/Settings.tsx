import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';
import { useCurrency, useLang, useTheme, CURRENCIES } from '../prefs';

export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);
  const resetToSample = useMutation(api.seed.resetToSample);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  async function reset() {
    await resetToSample({});
    setConfirming(false);
    setDone(true);
  }

  return (
    <div className="grid">
      <section className="panel settings">
        <h2>{t('Settings')}</h2>

        <div className="settings-row">
          <span className="settings-label">{t('Appearance')}</span>
          <div className="segmented">
            <button
              className={theme === 'dark' ? 'seg active' : 'seg'}
              onClick={() => setTheme('dark')}
            >
              🌙 {t('Dark')}
            </button>
            <button
              className={theme === 'light' ? 'seg active' : 'seg'}
              onClick={() => setTheme('light')}
            >
              ☀️ {t('Light')}
            </button>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">{t('Language')}</span>
          <div className="segmented">
            <button
              className={lang === 'en' ? 'seg active' : 'seg'}
              onClick={() => setLang('en')}
            >
              🇬🇧 {t('English')}
            </button>
            <button
              className={lang === 'fr' ? 'seg active' : 'seg'}
              onClick={() => setLang('fr')}
            >
              🇫🇷 Français
            </button>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">{t('Currency')}</span>
          <select
            className="settings-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.label}
              </option>
            ))}
          </select>
        </div>
        <p className="muted small">{t('Display only — amounts are not converted.')}</p>

        <p className="muted small" style={{ marginTop: 16 }}>
          {t('Preferences sync across your devices.')}
        </p>
      </section>

      <section className="panel settings">
        <h2>{t('Data')}</h2>
        <div className="settings-row">
          <span className="settings-label">{t('Reset to sample data')}</span>
          {confirming ? (
            <div className="row-actions">
              <button className="btn-danger" onClick={reset}>
                {t('Erase & reset')}
              </button>
              <button className="toggle-btn" onClick={() => setConfirming(false)}>
                {t('Cancel')}
              </button>
            </div>
          ) : (
            <button
              className="toggle-btn"
              onClick={() => {
                setDone(false);
                setConfirming(true);
              }}
            >
              {t('Reset…')}
            </button>
          )}
        </div>
        <p className="muted small">
          {confirming
            ? t('This replaces all your accounts, transactions and budget with the sample dataset.')
            : done
            ? t('Done — sample data restored.')
            : t('Replace everything with the original demo dataset. Your settings are kept.')}
        </p>
      </section>

      <section className="panel settings">
        <h2>{t('Account')}</h2>
        <div className="settings-row">
          <span className="settings-label">
            {user?.email ? user.email : t('Signed in')}
          </span>
          <button className="toggle-btn" onClick={() => void signOut()}>
            {t('Sign out')}
          </button>
        </div>
      </section>
    </div>
  );
}
