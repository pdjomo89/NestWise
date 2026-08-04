import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../convex/_generated/api';
import { setLocale, setCurrency } from './format';

type Theme = 'dark' | 'light';
type Lang = 'en' | 'fr';
type Currency = string;

// Display currencies offered in Settings (formatting only — no conversion).
export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
];

// French translations, keyed by the English source string. Anything missing
// falls back to English, so partial coverage degrades gracefully.
const FR: Record<string, string> = {
  // Header / chrome
  'Track finances · plan retirement · save smarter':
    'Suivez vos finances · planifiez la retraite · économisez',
  'NestWise · educational projections only, not financial advice':
    'NestWise · projections éducatives uniquement, pas un conseil financier',
  'Loading…': 'Chargement…',
  // Tabs
  Dashboard: 'Tableau de bord',
  Transactions: 'Transactions',
  Accounts: 'Comptes',
  Budget: 'Budget',
  Retirement: 'Retraite',
  Advice: 'Conseils',
  Coach: 'Coach',
  // Coach tab
  'Your financial coach': 'Votre coach financier',
  'Add your income, accounts and bills and the coach will grade where you stand, then tell you the single highest-impact move to make next.':
    'Ajoutez vos revenus, comptes et factures : le coach évaluera votre situation et vous indiquera l’action la plus utile à faire ensuite.',
  'Add accounts': 'Ajouter des comptes',
  'Financial health': 'Santé financière',
  since: 'depuis le',
  'Graded on cash flow, emergency fund, debt, retirement and spending discipline — weighted by how much each one moves your future.':
    'Évalué sur la trésorerie, le fonds d’urgence, la dette, la retraite et la discipline de dépenses — pondéré selon l’impact de chacun sur votre avenir.',
  'areas tracked. Your score appears once the coach can see enough of the picture — the moves below are what it needs.':
    'domaines suivis. Votre score apparaîtra dès que le coach en verra assez — les actions ci-dessous sont ce qu’il lui manque.',
  'Your next moves': 'Vos prochaines actions',
  'Ranked by how many points each would win back.':
    'Classées selon le nombre de points que chacune rapporterait.',
  'Go to': 'Aller à',
  'Where you stand': 'Où vous en êtes',
  'not tracked': 'non suivi',
  'Areas we can’t measure yet are left out of the score rather than counted as zero.':
    'Les domaines encore impossibles à mesurer sont exclus du score plutôt que comptés comme zéro.',
  'Your progress': 'Votre progression',
  points: 'points',
  // Common
  Add: 'Ajouter',
  'Adding…': 'Ajout…',
  Save: 'Enregistrer',
  Cancel: 'Annuler',
  // Dashboard cards / sections
  'Net worth': 'Valeur nette',
  'Monthly income': 'Revenu mensuel',
  'Monthly expenses': 'Dépenses mensuelles',
  'Monthly net': 'Solde mensuel',
  'No accounts yet.': 'Aucun compte.',
  'Monthly spending by category': 'Dépenses mensuelles par catégorie',
  'Recurring expenses plus this month’s one-off transactions.':
    'Dépenses récurrentes plus les transactions ponctuelles de ce mois-ci.',
  'No expenses recorded.': 'Aucune dépense enregistrée.',
  'Retirement outlook': 'Perspective de retraite',
  'Set up your plan in the Retirement tab to see your projected nest egg here.':
    'Configurez votre plan dans l’onglet Retraite pour voir votre épargne projetée ici.',
  // Surplus panel
  'On track': 'Sur la bonne voie',
  'Needs attention': 'À surveiller',
  Shortfall: 'Déficit',
  'Set up your budget': 'Configurez votre budget',
  Surplus: 'Excédent',
  'No household income yet': 'Aucun revenu du ménage pour l’instant',
  income: 'de revenu',
  expenses: 'de dépenses',
  saved: 'épargné',
  'Manage income & expenses in the Budget tab →':
    'Gérez les revenus et dépenses dans l’onglet Budget →',
  'Projected nest egg at': 'Épargne projetée à',
  "In today's dollars": "En dollars d'aujourd'hui",
  'Years to retirement': 'Années avant la retraite',
  'Sustainable income': 'Revenu viable',
  mo: 'mois',
  'net worth': 'valeur nette',
  'Live from your current figures — adjust assumptions in the Retirement tab.':
    'Calculé en direct depuis vos chiffres actuels — ajustez les hypothèses dans l’onglet Retraite.',
  // Transactions
  'Add transaction': 'Ajouter une transaction',
  Description: 'Description',
  'Amount (− for expense)': 'Montant (− pour dépense)',
  'No account': 'Aucun compte',
  History: 'Historique',
  Date: 'Date',
  Category: 'Catégorie',
  Amount: 'Montant',
  'No transactions yet.': 'Aucune transaction.',
  'Date range': 'Plage de dates',
  Clear: 'Effacer',
  'Filters the Transactions tab — your data isn’t changed.':
    'Filtre l’onglet Transactions — vos données ne sont pas modifiées.',
  'Filtered by date': 'Filtré par date',
  // Accounts
  'Invested (cost basis)': 'Investi (coût de base)',
  'Investment value': 'Valeur des placements',
  'Total gain': 'Gain total',
  'Add account': 'Ajouter un compte',
  'Name (e.g. Fidelity)': 'Nom (ex. Fidelity)',
  'Current value': 'Valeur actuelle',
  'Amount owed': 'Montant dû',
  'Credit card debt': 'Dette de carte de crédit',
  'Total contributed': 'Total contribué',
  'Your accounts': 'Vos comptes',
  'All balances count toward net worth. Add a “total contributed” to an investment to track its gain.':
    'Tous les soldes comptent dans la valeur nette. Ajoutez un « total contribué » à un placement pour suivre son gain.',
  // Budget
  'Monthly surplus': 'Excédent mensuel',
  'Savings rate': "Taux d'épargne",
  'Household income': 'Revenu du ménage',
  'Combined household income:': 'Revenu combiné du ménage :',
  Partners: 'Partenaires',
  'Add a partner…': 'Ajouter un partenaire…',
  'Income sources': 'Sources de revenu',
  'Label (e.g. Salary)': 'Libellé (ex. Salaire)',
  // Types of income (the picker on an income source)
  'Type of income': 'Type de revenu',
  'Detail (optional)': 'Détail (facultatif)',
  Salary: 'Salaire',
  'Hourly wages': 'Salaire horaire',
  'Bonus / commission': 'Prime / commission',
  'Self-employed / freelance': 'Indépendant / freelance',
  'Business income': 'Revenu d’entreprise',
  'Rental income': 'Revenu locatif',
  'Investments / dividends': 'Placements / dividendes',
  'Pension / retirement': 'Pension / retraite',
  'Benefits / support': 'Prestations / aides',
  'Other income': 'Autre revenu',
  Unassigned: 'Non attribué',
  'No income sources yet.': 'Aucune source de revenu.',
  'Recurring expenses': 'Dépenses récurrentes',
  'Label (e.g. Rent)': 'Libellé (ex. Loyer)',
  'No recurring expenses yet.': 'Aucune dépense récurrente.',
  Plus: 'Plus',
  'in one-off transactions logged this month, included in your monthly expenses above.':
    'en transactions ponctuelles enregistrées ce mois-ci, incluses dans vos dépenses mensuelles ci-dessus.',
  // Spending trends + savings plan
  'Spending trends': 'Tendances des dépenses',
  'How each category has moved over recent months, from your logged transactions.':
    'Évolution de chaque catégorie sur les derniers mois, d’après vos transactions enregistrées.',
  'Not enough transaction history yet to show a trend.':
    'Pas encore assez d’historique de transactions pour afficher une tendance.',
  Latest: 'Dernier',
  'vs avg': 'vs moy.',
  new: 'nouveau',
  flat: 'stable',
  'Savings plan': 'Plan d’épargne',
  'No categories are running above their usual level — spending looks steady.':
    'Aucune catégorie au-dessus de son niveau habituel — les dépenses semblent stables.',
  Trim: 'Réduire de',
  about: 'environ',
  'of income': 'du revenu',
  'Targets bring each rising category back to its own recent average.':
    'Les objectifs ramènent chaque catégorie en hausse à sa propre moyenne récente.',
  'Potential monthly savings': 'Économies mensuelles potentielles',
  'Trim your spending': 'Réduisez vos dépenses',
  'These categories are running above their recent average — see Spending trends on the Dashboard for the month-by-month view.':
    'Ces catégories dépassent leur moyenne récente — consultez les Tendances des dépenses sur le tableau de bord pour la vue mois par mois.',
  // Category names (stored as lowercase keys, shown capitalized)
  Income: 'Revenu',
  Housing: 'Logement',
  Food: 'Alimentation',
  Bills: 'Factures',
  Transport: 'Transport',
  Savings: 'Épargne',
  Entertainment: 'Divertissement',
  Shopping: 'Achats',
  Health: 'Santé',
  General: 'Général',
  // Account type labels (Savings reuses the category entry above)
  Checking: 'Compte courant',
  'Credit card': 'Carte de crédit',
  'Retirement (401k/IRA)': 'Retraite (401k/IRA)',
  'Brokerage / Stocks': 'Courtage / Actions',
  Crypto: 'Crypto',
  'Real estate': 'Immobilier',
  Other: 'Autre',
  // Frequencies
  Weekly: 'Hebdomadaire',
  'Every 2 weeks': 'Toutes les 2 semaines',
  'Twice a month': 'Deux fois par mois',
  Monthly: 'Mensuel',
  Annually: 'Annuel',
  // Retirement
  'Retirement planner': 'Planificateur de retraite',
  'Track a plan for each person (e.g. you and your spouse). Saving stores every field — the dashboard outlook uses the combined household total.':
    'Suivez un plan par personne (ex. vous et votre conjoint). L’enregistrement conserve chaque champ — la perspective du tableau de bord utilise le total combiné du ménage.',
  '+ Add plan': '+ Ajouter un plan',
  'Combined household': 'Ménage combiné',
  'Combined nest egg': 'Épargne combinée',
  'Combined sustainable income': 'Revenu viable combiné',
  'Sum across all plans. The dashboard outlook shows this combined total.':
    'Somme de tous les plans. La perspective du tableau de bord affiche ce total combiné.',
  'Plan name': 'Nom du plan',
  'Remove plan': 'Supprimer le plan',
  'Projected nest egg': 'Épargne projetée',
  You: 'Vous',
  Spouse: 'Conjoint',
  plans: 'plans',
  contributed: 'cotisés',
  'Current age': 'Âge actuel',
  'Retirement age': 'Âge de la retraite',
  'Current savings ($)': 'Épargne actuelle ($)',
  'Monthly contribution ($)': 'Cotisation mensuelle ($)',
  'Annual return (%)': 'Rendement annuel (%)',
  'Inflation (%)': 'Inflation (%)',
  'Save & project': 'Enregistrer et projeter',
  'Projecting…': 'Projection…',
  'Nest egg at retirement': 'Épargne à la retraite',
  'Total contributed (label)': 'Total contribué',
  'Investment growth': 'Croissance des placements',
  'Sustainable retirement income': 'Revenu de retraite viable',
  yr: 'an',
  'Using the 4% rule, you could withdraw about':
    'Avec la règle des 4 %, vous pourriez retirer environ',
  'without depleting your savings.': 'sans épuiser votre épargne.',
  'Current savings and contribution are live from your net worth and budget surplus. Projecting saves your age & return assumptions; the dashboard outlook always recomputes from your current figures.':
    'L’épargne actuelle et la cotisation proviennent en direct de votre valeur nette et de votre excédent budgétaire. La projection enregistre vos hypothèses d’âge et de rendement ; la perspective du tableau de bord se recalcule toujours selon vos chiffres actuels.',
  'Growth over time': 'Croissance au fil du temps',
  Balance: 'Solde',
  Growth: 'Croissance',
  'Projected balance by age': 'Solde projeté par âge',
  // Advice
  'Your monthly money': 'Votre argent mensuel',
  'Pre-filled from your household budget — adjust any figure to explore.':
    'Pré-rempli depuis votre budget du ménage — ajustez un chiffre pour explorer.',
  'Monthly income ($)': 'Revenu mensuel ($)',
  'Monthly expenses ($)': 'Dépenses mensuelles ($)',
  '6-month emergency target': "Objectif d'urgence de 6 mois",
  // Settings
  Settings: 'Paramètres',
  Appearance: 'Apparence',
  Language: 'Langue',
  Currency: 'Devise',
  'Display only — amounts are not converted.':
    'Affichage uniquement — les montants ne sont pas convertis.',
  Data: 'Données',
  'Reset to sample data': 'Réinitialiser aux données d’exemple',
  'Reset…': 'Réinitialiser…',
  'Erase & reset': 'Effacer et réinitialiser',
  'This replaces all your accounts, transactions and budget with the sample dataset.':
    'Cela remplace tous vos comptes, transactions et budget par le jeu de données d’exemple.',
  'Done — sample data restored.': 'Terminé — données d’exemple restaurées.',
  'Replace everything with the original demo dataset. Your settings are kept.':
    'Remplace tout par le jeu de données de démonstration d’origine. Vos paramètres sont conservés.',
  Dark: 'Sombre',
  Light: 'Clair',
  English: 'English',
  'Preferences sync across your devices.':
    'Les préférences se synchronisent sur tous vos appareils.',
  'Back to app': 'Retour à l’application',
  Account: 'Compte',
  'Display name': 'Nom affiché',
  'e.g. Ada': 'ex. Ada',
  'Used to greet you on the dashboard. Leave it blank to go by your email.':
    'Sert à vous accueillir sur le tableau de bord. Laissez vide pour utiliser votre e-mail.',
  'Saved.': 'Enregistré.',
  'Signed in': 'Connecté',
  'Sign out': 'Se déconnecter',
  // Billing / NestWise Pro
  'NestWise Pro': 'NestWise Pro',
  Pro: 'Pro',
  'Upgrade to unlock the parts of NestWise that do the work for you.':
    'Passez à Pro pour débloquer les fonctions qui travaillent pour vous.',
  'Link your banks and import transactions automatically':
    'Reliez vos banques et importez vos transactions automatiquement',
  'Keep a retirement plan for every person in your household':
    'Gardez un plan de retraite pour chaque personne du foyer',
  'Everything else in NestWise, forever': 'Tout le reste de NestWise, pour toujours',
  'Monthly plan': 'Forfait mensuel',
  'Annual plan': 'Forfait annuel',
  Annual: 'Annuel',
  Subscribe: 'S’abonner',
  // Greetings (sign-in screen + dashboard)
  'here’s where your money stands today.': 'voici où en sont vos finances aujourd’hui.',
  'Good morning': 'Bonjour',
  'Good afternoon': 'Bon après-midi',
  'Good evening': 'Bonsoir',
  'Welcome back': 'Content de vous revoir',
  'Create your account': 'Créez votre compte',
  'Welcome to NestWise — a few details and your money gets a lot clearer.':
    'Bienvenue sur NestWise — quelques informations et vos finances deviennent bien plus claires.',
  'Good to see you again. Everything is right where you left it.':
    'Ravi de vous revoir. Tout est exactement là où vous l’avez laissé.',
  // Welcome step (post sign-up)
  'Welcome to NestWise': 'Bienvenue sur NestWise',
  'Start with': 'Commencez avec',
  'No charge until': 'Aucun prélèvement avant le',
  'Unlock automatic bank sync and household retirement planning.':
    'Débloquez la synchronisation bancaire automatique et la planification de retraite du ménage.',
  'Maybe later': 'Plus tard',
  'You can upgrade any time from Settings. Cancel during the trial and you pay nothing.':
    'Vous pouvez passer à Pro à tout moment depuis les Paramètres. Résiliez pendant l’essai et vous ne payez rien.',
  'You can upgrade any time from Settings.':
    'Vous pouvez passer à Pro à tout moment depuis les Paramètres.',
  // Free trial
  Trial: 'Essai',
  'Free trial': 'Essai gratuit',
  'Start free trial': 'Commencer l’essai gratuit',
  // Whole phrases, so the past participle agrees with the count.
  'month free': 'mois offert',
  'months free': 'mois offerts',
  'days free': 'jours offerts',
  then: 'puis',
  'Free until': 'Gratuit jusqu’au',
  'your first payment is taken then.': 'votre premier paiement sera prélevé à cette date.',
  'You’re on a free trial.': 'Vous êtes en essai gratuit.',
  'Your trial ends on': 'Votre essai se termine le',
  'You won’t be charged.': 'Vous ne serez pas débité.',
  'Your trial is ending and you won’t be charged.':
    'Votre essai se termine et vous ne serez pas débité.',
  'Payments are handled by Stripe. You won’t be charged until the trial ends, and cancelling before then costs nothing. Prices are shown in your local currency, with the payment methods common in your country.':
    'Les paiements sont gérés par Stripe. Vous ne serez débité qu’à la fin de l’essai, et résilier avant ne coûte rien. Les prix s’affichent dans votre devise locale, avec les moyens de paiement courants dans votre pays.',
  // Badge on the yearly card, e.g. "17% off". Not the `Save` key above — that
  // one is the form button ("Enregistrer").
  off: 'de réduction',
  month: 'mois',
  year: 'an',
  'Manage billing': 'Gérer l’abonnement',
  'Working…': 'En cours…',
  'Renews on': 'Renouvellement le',
  'Pro ends on': 'Pro se termine le',
  'Pro ends at the end of this billing period.':
    'Pro se termine à la fin de cette période de facturation.',
  'Your subscription is active.': 'Votre abonnement est actif.',
  'Your last payment failed. Update your card to keep Pro.':
    'Votre dernier paiement a échoué. Mettez à jour votre carte pour conserver Pro.',
  'Change your card, switch plans, download invoices or cancel in the billing portal.':
    'Changez de carte, changez de forfait, téléchargez vos factures ou résiliez dans le portail de facturation.',
  'Checkout cancelled — you have not been charged.':
    'Paiement annulé — vous n’avez pas été débité.',
  'You’re on NestWise Pro — thank you!': 'Vous êtes sur NestWise Pro — merci !',
  'No plans are configured yet — add your Stripe price ids to finish setup.':
    'Aucun forfait configuré — ajoutez vos identifiants de prix Stripe pour terminer la configuration.',
  'Payments are handled by Stripe. You’ll see the price in your local currency and the payment methods common in your country. Cancel anytime.':
    'Les paiements sont gérés par Stripe. Le prix s’affiche dans votre devise locale, avec les moyens de paiement courants dans votre pays. Résiliez à tout moment.',
};

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}>({ theme: 'dark', setTheme: () => {}, toggleTheme: () => {} });
const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (s: string) => string;
}>({ lang: 'en', setLang: () => {}, toggleLang: () => {}, t: (s) => s });
const CurrencyContext = createContext<{ currency: Currency; setCurrency: (c: Currency) => void }>({
  currency: 'USD',
  setCurrency: () => {},
});
// View-only date filter for the Transactions list. Empty string = unbounded on
// that end. Lives device-local (localStorage) — it's a display preference, not
// data, so it doesn't sync to Convex.
const DateRangeContext = createContext<{
  from: string;
  to: string;
  setFrom: (d: string) => void;
  setTo: (d: string) => void;
  clear: () => void;
}>({ from: '', to: '', setFrom: () => {}, setTo: () => {}, clear: () => {} });

export const useTheme = () => useContext(ThemeContext);
export const useLang = () => useContext(LangContext);
export const useCurrency = () => useContext(CurrencyContext);
export const useDateRange = () => useContext(DateRangeContext);

export function PrefsProvider({ children }: { children: ReactNode }) {
  // localStorage seeds the initial value so there's no flash before Convex loads.
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem('nw-theme') as Theme) || 'dark'
  );
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem('nw-lang') as Lang) || 'en'
  );
  const [currency, setCurrencyState] = useState<Currency>(
    () => localStorage.getItem('nw-currency') || 'USD'
  );
  const [dateFrom, setDateFrom] = useState(() => localStorage.getItem('nw-txn-from') || '');
  const [dateTo, setDateTo] = useState(() => localStorage.getItem('nw-txn-to') || '');

  // Convex is the durable, cross-device store — but only for signed-in users.
  // Signed out (on the sign-in page) we stay on localStorage only.
  const { isAuthenticated } = useConvexAuth();
  const serverPrefs = useQuery(api.preferences.get);
  const savePrefs = useMutation(api.preferences.set);
  const persist = (p: { theme: Theme; lang: Lang; currency: Currency }) => {
    if (isAuthenticated) void savePrefs(p);
  };

  // Keep the formatter's locale + currency in sync, synchronously.
  setLocale(lang === 'fr' ? 'fr-FR' : 'en-US');
  setCurrency(currency);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nw-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('nw-lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('nw-currency', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem('nw-txn-from', dateFrom);
    localStorage.setItem('nw-txn-to', dateTo);
  }, [dateFrom, dateTo]);

  // On load (once signed in): adopt server prefs (e.g. changed on another
  // device); if none exist yet, migrate the current local prefs up to the server.
  useEffect(() => {
    if (!isAuthenticated) return; // signed out → localStorage only
    if (serverPrefs === undefined) return; // still loading
    if (serverPrefs === null) {
      persist({ theme, lang, currency });
    } else {
      setThemeState(serverPrefs.theme);
      setLangState(serverPrefs.lang);
      if (serverPrefs.currency) setCurrencyState(serverPrefs.currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPrefs, isAuthenticated]);

  const applyTheme = (th: Theme) => {
    setThemeState(th);
    persist({ theme: th, lang, currency });
  };
  const applyLang = (l: Lang) => {
    setLangState(l);
    persist({ theme, lang: l, currency });
  };
  const applyCurrency = (c: Currency) => {
    setCurrencyState(c);
    persist({ theme, lang, currency: c });
  };

  const t = (s: string) => (lang === 'fr' ? FR[s] ?? s : s);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: applyTheme,
        toggleTheme: () => applyTheme(theme === 'dark' ? 'light' : 'dark'),
      }}
    >
      <LangContext.Provider
        value={{
          lang,
          setLang: applyLang,
          toggleLang: () => applyLang(lang === 'en' ? 'fr' : 'en'),
          t,
        }}
      >
        <CurrencyContext.Provider value={{ currency, setCurrency: applyCurrency }}>
          <DateRangeContext.Provider
            value={{
              from: dateFrom,
              to: dateTo,
              setFrom: setDateFrom,
              setTo: setDateTo,
              clear: () => {
                setDateFrom('');
                setDateTo('');
              },
            }}
          >
            {children}
          </DateRangeContext.Provider>
        </CurrencyContext.Provider>
      </LangContext.Provider>
    </ThemeContext.Provider>
  );
}
