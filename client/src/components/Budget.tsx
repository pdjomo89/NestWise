import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { FREQUENCIES, FREQUENCY_LABEL, toMonthly, Frequency } from '../../convex/frequency';
import { Budget as BudgetData, IncomeSource, Person, RecurringExpense, Id } from '../types';
import { usd } from '../format';
import { colorFor, capitalize } from '../categories';
import { useLang } from '../prefs';

const EXPENSE_CATEGORIES = ['housing', 'food', 'bills', 'transport', 'savings', 'general'];
const PERSON_COLORS = ['#6366f1', '#06b6d4', '#ec4899', '#f59e0b'];
const personColor = (i: number) => PERSON_COLORS[i % PERSON_COLORS.length];

export default function Budget() {
  const { t, lang } = useLang();
  const budget = useQuery(api.budget.get, { lang });
  const people = useQuery(api.people.list);
  const sources = useQuery(api.income.list);
  const recurring = useQuery(api.recurring.list);

  if (!budget || !people || !sources || !recurring) {
    return <p className="muted">{t('Loading…')}</p>;
  }

  return (
    <div className="grid">
      <Summary budget={budget} />
      <Partners budget={budget} people={people} />
      <IncomeSources people={people} sources={sources} />
      <RecurringExpenses recurring={recurring} oneOff={budget.oneOffThisMonth} />
    </div>
  );
}

function Summary({ budget }: { budget: BudgetData }) {
  const { t } = useLang();
  return (
    <section className="cards">
      <Stat label={t('Monthly income')} value={usd(budget.monthlyIncome)} accent="green" />
      <Stat label={t('Monthly expenses')} value={usd(budget.monthlyExpenses)} accent="red" />
      <Stat
        label={t('Monthly surplus')}
        value={usd(budget.surplus)}
        accent={budget.surplus >= 0 ? 'green' : 'red'}
      />
      <Stat
        label={t('Savings rate')}
        value={`${(budget.savingsRate * 100).toFixed(0)}%`}
        accent={budget.savingsRate >= 0.2 ? 'green' : 'slate'}
      />
    </section>
  );
}

function Partners({ budget, people }: { budget: BudgetData; people: Person[] }) {
  const { t } = useLang();
  const addPerson = useMutation(api.people.add);
  const renamePerson = useMutation(api.people.rename);
  const removePerson = useMutation(api.people.remove);
  const [newName, setNewName] = useState('');

  const max = Math.max(1, ...budget.perPerson.map((p) => p.monthly));

  return (
    <section className="panel">
      <h2>{t('Household income')}</h2>
      <ul className="account-list">
        {budget.perPerson.map((p, i) => (
          <li key={p.personId ?? 'unassigned'}>
            <span className="dot" style={{ background: personColor(i) }} />
            <span className="acct-name">{p.name}</span>
            <div className="bar-track" style={{ flex: 1, maxWidth: 200 }}>
              <div
                className="bar-fill"
                style={{ width: `${(p.monthly / max) * 100}%`, background: personColor(i) }}
              />
            </div>
            <span className="acct-balance">
              {usd(p.monthly)}/{t('mo')}
            </span>
          </li>
        ))}
      </ul>
      <p className="lead" style={{ marginTop: 12 }}>
        {t('Combined household income:')}{' '}
        <strong>
          {usd(budget.monthlyIncome)}/{t('mo')}
        </strong>
      </p>

      <h3 className="subhead">{t('Partners')}</h3>
      <ul className="partner-list">
        {people.map((person) => (
          <li key={person._id}>
            <input
              className="partner-name"
              defaultValue={person.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== person.name) renamePerson({ id: person._id, name });
              }}
            />
            <button
              className="link-btn"
              title="Remove partner"
              onClick={() => removePerson({ id: person._id })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (name) {
            addPerson({ name });
            setNewName('');
          }
        }}
      >
        <input
          placeholder={t('Add a partner…')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit">{t('Add')}</button>
      </form>
    </section>
  );
}

function IncomeSources({ people, sources }: { people: Person[]; sources: IncomeSource[] }) {
  const { t } = useLang();
  const addIncome = useMutation(api.income.add);
  const updateIncome = useMutation(api.income.update);
  const removeIncome = useMutation(api.income.remove);

  const [personId, setPersonId] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label || isNaN(Number(amount))) return;
    addIncome({
      personId: personId ? (personId as Id<'people'>) : undefined,
      label,
      amount: Number(amount),
      frequency,
    });
    setLabel('');
    setAmount('');
  }

  return (
    <section className="panel">
      <h2>{t('Income sources')}</h2>
      <form className="row-form" onSubmit={submit}>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">{t('Unassigned')}</option>
          {people.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        <input placeholder={t('Label (e.g. Salary)')} value={label} onChange={(e) => setLabel(e.target.value)} required />
        <input
          type="number"
          step="0.01"
          placeholder={t('Amount')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {t(FREQUENCY_LABEL[f])}
            </option>
          ))}
        </select>
        <button type="submit">{t('Add')}</button>
      </form>

      <ul className="srclist">
        {sources.map((s) => (
          <IncomeRow
            key={s._id}
            source={s}
            people={people}
            onUpdate={updateIncome}
            onRemove={removeIncome}
          />
        ))}
        {sources.length === 0 && <li className="muted">{t('No income sources yet.')}</li>}
      </ul>
    </section>
  );
}

function IncomeRow({
  source,
  people,
  onUpdate,
  onRemove,
}: {
  source: IncomeSource;
  people: Person[];
  onUpdate: (a: {
    id: Id<'incomeSources'>;
    personId?: Id<'people'>;
    label: string;
    amount: number;
    frequency: Frequency;
  }) => void;
  onRemove: (a: { id: Id<'incomeSources'> }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [personId, setPersonId] = useState<string>(source.personId ?? '');
  const [label, setLabel] = useState(source.label);
  const [amount, setAmount] = useState(String(source.amount));
  const [frequency, setFrequency] = useState<Frequency>(source.frequency);
  const { t } = useLang();

  const idx = people.findIndex((p) => p._id === source.personId);
  const ownerName = idx >= 0 ? people[idx].name : t('Unassigned');
  const ownerColor = idx >= 0 ? personColor(idx) : '#64748b';

  function startEdit() {
    setPersonId(source.personId ?? '');
    setLabel(source.label);
    setAmount(String(source.amount));
    setFrequency(source.frequency);
    setEditing(true);
  }
  function save() {
    if (!label || isNaN(Number(amount))) return;
    onUpdate({
      id: source._id,
      personId: personId ? (personId as Id<'people'>) : undefined,
      label,
      amount: Number(amount),
      frequency,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="src-edit">
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">{t('Unassigned')}</option>
          {people.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {t(FREQUENCY_LABEL[f])}
            </option>
          ))}
        </select>
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

  return (
    <li>
      <span className="dot" style={{ background: ownerColor }} />
      <span className="src-owner">{ownerName}</span>
      <span className="src-label">{source.label}</span>
      <span className="src-detail muted">
        {usd(source.amount)} · {t(FREQUENCY_LABEL[source.frequency])}
      </span>
      <span className="src-monthly">
        {usd(toMonthly(source.amount, source.frequency))}/{t('mo')}
      </span>
      <button className="link-btn" title="Edit" onClick={startEdit}>
        ✎
      </button>
      <button className="link-btn" title="Remove" onClick={() => onRemove({ id: source._id })}>
        ✕
      </button>
    </li>
  );
}

function RecurringExpenses({
  recurring,
  oneOff,
}: {
  recurring: RecurringExpense[];
  oneOff: number;
}) {
  const { t } = useLang();
  const addExpense = useMutation(api.recurring.add);
  const updateExpense = useMutation(api.recurring.update);
  const removeExpense = useMutation(api.recurring.remove);

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('general');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label || isNaN(Number(amount))) return;
    addExpense({ label, category, amount: Number(amount), frequency });
    setLabel('');
    setAmount('');
  }

  return (
    <section className="panel">
      <h2>{t('Recurring expenses')}</h2>
      <form className="row-form" onSubmit={submit}>
        <input placeholder={t('Label (e.g. Rent)')} value={label} onChange={(e) => setLabel(e.target.value)} required />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(capitalize(c))}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          placeholder={t('Amount')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {t(FREQUENCY_LABEL[f])}
            </option>
          ))}
        </select>
        <button type="submit">{t('Add')}</button>
      </form>

      <ul className="srclist">
        {recurring.map((r) => (
          <ExpenseRow key={r._id} expense={r} onUpdate={updateExpense} onRemove={removeExpense} />
        ))}
        {recurring.length === 0 && <li className="muted">{t('No recurring expenses yet.')}</li>}
      </ul>
      <p className="muted small" style={{ marginTop: 12 }}>
        {t('Plus')} <strong>{usd(oneOff)}</strong>{' '}
        {t('in one-off transactions logged this month, included in your monthly expenses above.')}
      </p>
    </section>
  );
}

function ExpenseRow({
  expense,
  onUpdate,
  onRemove,
}: {
  expense: RecurringExpense;
  onUpdate: (a: {
    id: Id<'recurringExpenses'>;
    label: string;
    category: string;
    amount: number;
    frequency: Frequency;
  }) => void;
  onRemove: (a: { id: Id<'recurringExpenses'> }) => void;
}) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(expense.label);
  const [category, setCategory] = useState(expense.category);
  const [amount, setAmount] = useState(String(expense.amount));
  const [frequency, setFrequency] = useState<Frequency>(expense.frequency);

  function startEdit() {
    setLabel(expense.label);
    setCategory(expense.category);
    setAmount(String(expense.amount));
    setFrequency(expense.frequency);
    setEditing(true);
  }
  function save() {
    if (!label || isNaN(Number(amount))) return;
    onUpdate({ id: expense._id, label, category, amount: Number(amount), frequency });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="src-edit">
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(capitalize(c))}
            </option>
          ))}
        </select>
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {t(FREQUENCY_LABEL[f])}
            </option>
          ))}
        </select>
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

  return (
    <li>
      <span
        className="pill cat"
        style={{ color: colorFor(expense.category), background: `${colorFor(expense.category)}22` }}
      >
        {t(capitalize(expense.category))}
      </span>
      <span className="src-label">{expense.label}</span>
      <span className="src-detail muted">
        {usd(expense.amount)} · {t(FREQUENCY_LABEL[expense.frequency])}
      </span>
      <span className="src-monthly">
        {usd(toMonthly(expense.amount, expense.frequency))}/{t('mo')}
      </span>
      <button className="link-btn" title="Edit" onClick={startEdit}>
        ✎
      </button>
      <button className="link-btn" title="Remove" onClick={() => onRemove({ id: expense._id })}>
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
