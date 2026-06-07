# NestWise

Track personal finances, plan for retirement, and get savings advice.

A React + [Convex](https://convex.dev) app:

- **client/src/** — React + Vite + TypeScript UI (dashboard, transactions, retirement planner)
- **client/convex/** — Convex backend: schema, queries, and mutations. The React
  client talks to these directly with reactive `useQuery`/`useMutation` hooks, so
  the UI updates live whenever data changes — no REST layer.

## Getting started

```bash
npm run install:all   # install root + client deps
npm start             # run Convex (local backend) and Vite together
```

`npm start` provisions a **local, anonymous Convex deployment** the first time
(no account needed — it downloads a backend binary and writes `VITE_CONVEX_URL`
to `client/.env.local`). Then open http://localhost:5173.

Seed the sample data once (with `convex dev` running):

```bash
npm --prefix client exec convex run seed:seedSampleData
```

To link the local deployment to a Convex Cloud account later: `npx convex login`.

### Useful scripts

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm start`        | Run Convex backend + web together              |
| `npm run convex`   | Run only the Convex dev backend                |
| `npm run client`   | Run only the Vite dev server                   |
| `npm run build`    | Type-check (against generated Convex types) + build |

## Backend (Convex functions)

| Function                          | Kind     | Purpose                                  |
| --------------------------------- | -------- | ---------------------------------------- |
| `summary:get`                     | query    | Net worth, income, expenses, by-category |
| `accounts:list` / `add` / `remove`| q / mut  | Manage accounts                          |
| `transactions:list` / `add` / `remove` | q / mut | Manage transactions                 |
| `planning:projectRetirement`      | query    | Compound-interest retirement projection  |
| `planning:savingsAdvice`          | query    | Rule-of-thumb savings advice             |
| `people:list` / `add` / `rename` / `remove` | q / mut | Household members (partners)    |
| `income:list` / `add` / `remove`  | q / mut  | Recurring income sources (per person, with frequency) |
| `recurring:list` / `add` / `remove` | q / mut | Recurring/fixed expenses               |
| `budget:get`                      | query    | Household budget: combined + per-partner income vs. monthly expenses |
| `seed:seedSampleData` / `seedHousehold` | mutation | One-time sample data seeds          |

Schema lives in `client/convex/schema.ts`. Local deployment state is stored
under `~/.convex/` and is gitignored.

> Educational projections only — not financial advice.
