import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Account, Id } from '../types';
import { usd } from '../format';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL, isInvestmentType } from '../accountTypes';
import { capitalize } from '../categories';
import { useLang } from '../prefs';
import ConnectBank from './ConnectBank';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;

export default function Accounts({ accounts }: { accounts: Account[] }) {
  const { t } = useLang();
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);
  const invested = accounts.filter((a) => a.contributed != null);
  const invValue = invested.reduce((s, a) => s + a.balance, 0);
  const invCost = invested.reduce((s, a) => s + (a.contributed ?? 0), 0);
  const gain = invValue - invCost;
  const gainPct = invCost > 0 ? gain / invCost : 0;

  return (
    <div className="grid">
      <section className="cards">
        <Stat label={t('Net worth')} value={usd(netWorth)} accent="gold" />
        <Stat label={t('Invested (cost basis)')} value={usd(invCost)} accent="slate" />
        <Stat label={t('Investment value')} value={usd(invValue)} accent="green" />
        <Stat
          label={t('Total gain')}
          value={`${usd(gain)} (${pct(gainPct)})`}
          accent={gain >= 0 ? 'green' : 'red'}
        />
      </section>

      <ConnectBank />

      <AddAccount />

      <section className="panel">
        <h2>{t('Your accounts')}</h2>
        <ul className="srclist">
          {accounts.map((a) => (
            <AccountRow key={a._id} account={a} />
          ))}
          {accounts.length === 0 && <li className="muted">{t('No accounts yet.')}</li>}
        </ul>
        <p className="muted small" style={{ marginTop: 12 }}>
          {t(
            'All balances count toward net worth. Add a “total contributed” to an investment to track its gain.'
          )}
        </p>
      </section>
    </div>
  );
}

function AddAccount() {
  const { t } = useLang();
  const addAccount = useMutation(api.accounts.add);
  const [name, setName] = useState('');
  const [type, setType] = useState('brokerage');
  const [balance, setBalance] = useState('');
  const [contributed, setContributed] = useState('');

  const showContributed = isInvestmentType(type);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || isNaN(Number(balance))) return;
    addAccount({
      name,
      type,
      balance: Number(balance),
      contributed: showContributed && contributed !== '' ? Number(contributed) : undefined,
    });
    setName('');
    setBalance('');
    setContributed('');
  }

  return (
    <section className="panel">
      <h2>{t('Add account')}</h2>
      <form className="row-form" onSubmit={submit}>
        <input placeholder={t('Name (e.g. Fidelity)')} value={name} onChange={(e) => setName(e.target.value)} required />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {ACCOUNT_TYPES.map((at) => (
            <option key={at.value} value={at.value}>
              {t(at.label)}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          placeholder={t('Current value')}
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder={showContributed ? t('Total contributed') : 'n/a'}
          value={contributed}
          onChange={(e) => setContributed(e.target.value)}
          disabled={!showContributed}
        />
        <button type="submit">{t('Add')}</button>
      </form>
    </section>
  );
}

function AccountRow({ account }: { account: Account }) {
  const { t } = useLang();
  const updateAccount = useMutation(api.accounts.update);
  const removeAccount = useMutation(api.accounts.remove);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [balance, setBalance] = useState(String(account.balance));
  const [contributed, setContributed] = useState(
    account.contributed != null ? String(account.contributed) : ''
  );

  const showContributed = isInvestmentType(type);

  function startEdit() {
    setName(account.name);
    setType(account.type);
    setBalance(String(account.balance));
    setContributed(account.contributed != null ? String(account.contributed) : '');
    setEditing(true);
  }
  function save() {
    if (!name || isNaN(Number(balance))) return;
    updateAccount({
      id: account._id as Id<'accounts'>,
      name,
      type,
      balance: Number(balance),
      contributed: showContributed && contributed !== '' ? Number(contributed) : undefined,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="src-edit">
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {ACCOUNT_TYPES.map((at) => (
            <option key={at.value} value={at.value}>
              {t(at.label)}
            </option>
          ))}
        </select>
        <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
        <input
          type="number"
          step="0.01"
          placeholder={showContributed ? t('Total contributed') : 'n/a'}
          value={contributed}
          onChange={(e) => setContributed(e.target.value)}
          disabled={!showContributed}
        />
        <span className="edit-actions">
          <button className="btn-save" onClick={save}>
            {t('Save')}
          </button>
          <button className="link-btn" title="Cancel" onClick={() => setEditing(false)}>
            ✕
          </button>
        </span>
      </li>
    );
  }

  const hasGain = account.contributed != null && account.contributed > 0;
  const gain = hasGain ? account.balance - (account.contributed ?? 0) : 0;
  const gainPct = hasGain ? gain / (account.contributed ?? 1) : 0;

  return (
    <li>
      <span className={`pill ${account.type}`}>
        {t(ACCOUNT_TYPE_LABEL[account.type] ?? capitalize(account.type))}
      </span>
      <span className="src-label">{account.name}</span>
      {hasGain ? (
        <span className={`src-detail ${gain >= 0 ? 'pos' : 'neg'}`}>
          {usd(gain)} ({pct(gainPct)})
        </span>
      ) : (
        <span className="src-detail muted">—</span>
      )}
      <span className="src-monthly">{usd(account.balance)}</span>
      <button className="link-btn" title="Edit" onClick={startEdit}>
        ✎
      </button>
      <button className="link-btn" title="Remove" onClick={() => removeAccount({ id: account._id })}>
        ✕
      </button>
    </li>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`stat-card ${accent}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
