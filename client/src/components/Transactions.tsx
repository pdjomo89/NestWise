import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Account, Transaction, Id } from '../types';
import { usdCents } from '../format';
import { colorFor, capitalize } from '../categories';
import { useLang, useDateRange } from '../prefs';

const CATEGORIES = ['income', 'housing', 'food', 'bills', 'transport', 'savings', 'general'];

export default function Transactions({
  transactions,
  accounts,
}: {
  transactions: Transaction[];
  accounts: Account[];
}) {
  const { t } = useLang();
  const { from, to } = useDateRange();
  const addTransaction = useMutation(api.transactions.add);
  const updateTransaction = useMutation(api.transactions.update);
  const removeTransaction = useMutation(api.transactions.remove);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('general');
  const [accountId, setAccountId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await addTransaction({
        description,
        amount: Number(amount),
        category,
        accountId: accountId ? (accountId as Id<'accounts'>) : undefined,
      });
      setDescription('');
      setAmount('');
      setCategory('general');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Transaction dates are ISO 'YYYY-MM-DD' strings, so string comparison is a
  // correct date comparison. An empty bound means open-ended on that side.
  const filterActive = Boolean(from || to);
  const visible = transactions.filter(
    (tr) => (!from || tr.date >= from) && (!to || tr.date <= to)
  );

  return (
    <div className="grid">
      <section className="panel">
        <h2>{t('Add transaction')}</h2>
        <form className="txn-form" onSubmit={submit}>
          <input
            placeholder={t('Description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <input
            type="number"
            step="0.01"
            placeholder={t('Amount (− for expense)')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(capitalize(c))}
              </option>
            ))}
          </select>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('No account')}</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy}>
            {busy ? t('Adding…') : t('Add')}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="panel">
        <h2>{t('History')}</h2>
        {filterActive && (
          <p className="muted small" style={{ marginTop: -8, marginBottom: 12 }}>
            {t('Filtered by date')} · {from || '…'} – {to || '…'} · {visible.length}/
            {transactions.length}
          </p>
        )}
        <table className="txn-table">
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('Description')}</th>
              <th>{t('Category')}</th>
              <th className="num">{t('Amount')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((tr) => (
              <TransactionRow
                key={tr._id}
                txn={tr}
                onUpdate={updateTransaction}
                onRemove={removeTransaction}
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  {t('No transactions yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function TransactionRow({
  txn,
  onUpdate,
  onRemove,
}: {
  txn: Transaction;
  onUpdate: (a: {
    id: Id<'transactions'>;
    accountId?: Id<'accounts'>;
    description: string;
    category: string;
    amount: number;
    date: string;
  }) => void;
  onRemove: (a: { id: Id<'transactions'> }) => void;
}) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(txn.date);
  const [description, setDescription] = useState(txn.description);
  const [category, setCategory] = useState(txn.category);
  const [amount, setAmount] = useState(String(txn.amount));

  function startEdit() {
    setDate(txn.date);
    setDescription(txn.description);
    setCategory(txn.category);
    setAmount(String(txn.amount));
    setEditing(true);
  }
  function save() {
    if (!description || isNaN(Number(amount))) return;
    onUpdate({
      id: txn._id,
      accountId: txn.accountId, // preserved; not edited inline
      description,
      category,
      amount: Number(amount),
      date,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="txn-edit">
        <td>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </td>
        <td>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </td>
        <td>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(capitalize(c))}
              </option>
            ))}
          </select>
        </td>
        <td className="num">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </td>
        <td>
          <div className="row-actions">
            <button className="btn-save" onClick={save}>
              {t('Save')}
            </button>
            <button className="link-btn" title="Cancel" onClick={() => setEditing(false)}>
              ✕
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{txn.date}</td>
      <td>{txn.description}</td>
      <td>
        <span
          className="pill cat"
          style={{ color: colorFor(txn.category), background: `${colorFor(txn.category)}22` }}
        >
          {t(capitalize(txn.category))}
        </span>
      </td>
      <td className={`num ${txn.amount < 0 ? 'neg' : 'pos'}`}>{usdCents(txn.amount)}</td>
      <td>
        <div className="row-actions">
          <button className="link-btn" title="Edit" onClick={startEdit}>
            ✎
          </button>
          <button className="link-btn" title="Remove" onClick={() => onRemove({ id: txn._id })}>
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}
