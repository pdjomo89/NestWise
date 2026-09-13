import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../convex/_generated/api';
import { setLocale, setCurrency } from './format';

type Theme = 'dark' | 'light';
type Lang = 'en' | 'fr';
type Currency = string;
type Country = 'CA' | 'US';

// Where the user files taxes. Drives which account types the pickers offer and
// which tax rules the retirement projection uses — not a display setting.
export const COUNTRIES: { code: Country; label: string }[] = [
  { code: 'CA', label: 'Canada' },
  { code: 'US', label: 'United States' },
];

// First-run guess, so a Canadian isn't shown 401(k)s before they find the
// setting. Region subtag of the browser locale, then the IANA timezone as a
// fallback (en-US is the default on plenty of Canadian machines).
function guessCountry(): Country {
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(tag).region;
      if (region === 'CA') return 'CA';
      if (region === 'US') return 'US';
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    if (/^America\/(Toronto|Montreal|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns|Moncton|Whitehorse|Yellowknife|Iqaluit)$/.test(tz))
      return 'CA';
  } catch {
    // Intl.Locale is missing on very old browsers — fall through to the default.
  }
  return 'US';
}

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
  'Total spending': 'Dépenses totales',
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
  'Earlier months': 'Mois précédents',
  'Later months': 'Mois suivants',
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
  // Country / region
  Country: 'Pays',
  Canada: 'Canada',
  'United States': 'États-Unis',
  'Sets which account types you can add (RRSP, TFSA, FHSA… in Canada) and the tax rules the retirement projection uses.':
    'Détermine les types de comptes disponibles (REER, CELI, CELIAPP… au Canada) et les règles fiscales utilisées par la projection de retraite.',
  // Account type groups
  Cash: 'Liquidités',
  'Registered & retirement': 'Comptes enregistrés et retraite',
  Investments: 'Placements',
  Property: 'Immobilier',
  Debt: 'Dettes',
  // Canadian registered accounts
  RRSP: 'REER',
  'Spousal RRSP': 'REER de conjoint',
  'Group RRSP': 'REER collectif',
  TFSA: 'CELI',
  FHSA: 'CELIAPP',
  RRIF: 'FERR',
  'LIRA / Locked-in RRSP': 'CRI / REER immobilisé',
  'LIF / LRIF / PRIF': 'FRV / FRRI',
  'Pension — defined benefit (RPP)': 'Régime de retraite — prestations déterminées (RPA)',
  'Pension — defined contribution (RPP)': 'Régime de retraite — cotisations déterminées (RPA)',
  DPSP: 'RPDB',
  'PRPP / VRSP': 'RPAC / RVER',
  RESP: 'REEE',
  RDSP: 'REEI',
  'Non-registered investment': 'Placement non enregistré',
  'Registered Retirement Savings Plan — deductible going in, taxed as income on withdrawal.':
    'Régime enregistré d’épargne-retraite — déductible à la cotisation, imposé comme revenu au retrait.',
  'You contribute and deduct; your spouse owns it and is taxed on withdrawal.':
    'Vous cotisez et déduisez; votre conjoint en est propriétaire et est imposé au retrait.',
  'Employer-run RRSP, often with a matching contribution.':
    'REER géré par l’employeur, souvent avec cotisation équivalente.',
  'Tax-Free Savings Account — no deduction going in, nothing taxed coming out.':
    'Compte d’épargne libre d’impôt — aucune déduction à la cotisation, aucun impôt au retrait.',
  'First Home Savings Account — deductible going in and tax-free out for a first home.':
    'Compte d’épargne libre d’impôt pour l’achat d’une première propriété — déductible à la cotisation et non imposable au retrait.',
  'What an RRSP becomes by the end of the year you turn 71. A minimum must be withdrawn each year.':
    'Ce que devient un REER au plus tard à la fin de l’année de vos 71 ans. Un retrait minimal est exigé chaque année.',
  'Pension money from a former employer. Locked in until a minimum age set by the pension’s jurisdiction.':
    'Somme de retraite d’un ancien employeur. Immobilisée jusqu’à l’âge minimal fixé par la législation applicable.',
  'The income stage of a LIRA, with both a yearly minimum and a maximum withdrawal.':
    'La phase de décaissement d’un CRI, avec un retrait minimal et maximal annuel.',
  'Employer pension promising a set income. Enter its commuted value if you know it.':
    'Régime d’employeur garantissant un revenu déterminé. Indiquez sa valeur de rachat si vous la connaissez.',
  'Employer pension where the balance, not the income, is what’s promised.':
    'Régime d’employeur où c’est le solde, et non le revenu, qui est déterminé.',
  'Deferred Profit Sharing Plan — employer-funded, taxed as income on withdrawal.':
    'Régime de participation différée aux bénéfices — financé par l’employeur, imposé comme revenu au retrait.',
  'Pooled plan for small employers and the self-employed (VRSP in Quebec).':
    'Régime collectif pour petits employeurs et travailleurs autonomes (RVER au Québec).',
  'Registered Education Savings Plan — for a child’s schooling, so it sits outside the retirement projection.':
    'Régime enregistré d’épargne-études — pour les études d’un enfant, donc exclu de la projection de retraite.',
  'Registered Disability Savings Plan, with government grants and bonds.':
    'Régime enregistré d’épargne-invalidité, avec subventions et bons du gouvernement.',
  'Ordinary investment account. Only the gain is taxed, and only half of a capital gain counts as income.':
    'Compte de placement ordinaire. Seul le gain est imposé, et seule la moitié d’un gain en capital compte comme revenu.',
  'Tax-deferred workplace or individual retirement account.':
    'Compte de retraite individuel ou d’employeur à imposition différée.',
  // Retirement planner — tax
  'How it’s taxed': 'Traitement fiscal',
  'Tax-deferred — RRSP, RRIF, LIRA, pension (%)':
    'À imposition différée — REER, FERR, CRI, régime de retraite (%)',
  'Tax-deferred — 401(k), IRA (%)': 'À imposition différée — 401(k), IRA (%)',
  'Tax-free — TFSA, FHSA (%)': 'Libre d’impôt — CELI, CELIAPP (%)',
  'Tax-free — Roth (%)': 'Libre d’impôt — Roth (%)',
  'Marginal tax rate in retirement (%)': 'Taux marginal d’imposition à la retraite (%)',
  'The remaining': 'Le reste, soit',
  'is treated as non-registered — only the gain is taxed, and only half of a capital gain counts as income.':
    'est traité comme non enregistré : seul le gain est imposé, et seule la moitié d’un gain en capital compte comme revenu.',
  'is treated as a taxable account — only the gain is taxed.':
    'est traité comme un compte imposable : seul le gain est imposé.',
  'Tax-deferred and tax-free add up to more than 100%.':
    'Les parts à imposition différée et libre d’impôt dépassent 100 %.',
  'Starting split taken from your accounts.': 'Répartition initiale tirée de vos comptes.',
  'After tax': 'Après impôt',
  'Combined after tax': 'Total du ménage après impôt',
  'Tax-deferred (RRSP/RRIF)': 'À imposition différée (REER/FERR)',
  'Tax-deferred (401k/IRA)': 'À imposition différée (401k/IRA)',
  'Tax-free (TFSA/FHSA)': 'Libre d’impôt (CELI/CELIAPP)',
  'Tax-free (Roth)': 'Libre d’impôt (Roth)',
  Taxable: 'Imposable',
  // Contribution room
  'Contribution room': 'Droits de cotisation',
  'How much you can still put into each registered plan this year. Enter your real room from your CRA Notice of Assessment or CRA My Account — it carries forward from every year you didn’t use in full, so it is usually well above the annual limit.':
    'Ce que vous pouvez encore verser dans chaque régime enregistré cette année. Inscrivez vos droits réels, tirés de votre avis de cotisation de l’ARC ou de Mon dossier — ils s’accumulent depuis chaque année non utilisée en entier et dépassent donc généralement la limite annuelle.',
  'Your room': 'Vos droits',
  'Contributed this year': 'Cotisé cette année',
  left: 'restants',
  over: 'en trop',
  'Room still available across all plans:': 'Droits encore disponibles, tous régimes confondus :',
  'Starting amounts are': 'Les montants de départ sont ceux de',
  'figures and are indexed each year — check the current limit before you rely on it.':
    'et sont indexés chaque année — vérifiez la limite courante avant de vous y fier.',
  'Over-contributing is penalised monthly until you take the excess out — check this against your CRA account.':
    'Une cotisation excédentaire est pénalisée chaque mois jusqu’à son retrait — vérifiez auprès de votre dossier de l’ARC.',
  '18% of last year’s earned income, up to the annual dollar limit':
    '18 % du revenu gagné de l’an dernier, jusqu’au plafond annuel',
  'Your real room is on your Notice of Assessment — it includes every year of unused room carried forward, minus any pension adjustment.':
    'Vos droits réels figurent sur votre avis de cotisation : ils incluent les droits inutilisés reportés, moins tout facteur d’équivalence.',
  'A flat amount each year since you turned 18': 'Un montant fixe chaque année depuis vos 18 ans',
  'Unused room carries forward, and anything you withdrew is added back on January 1 of the following year.':
    'Les droits inutilisés se reportent, et tout retrait est rajouté le 1er janvier de l’année suivante.',
  'A flat amount each year once the account is open':
    'Un montant fixe chaque année une fois le compte ouvert',
  'Carry-forward is capped, so the most you can contribute in one year is limited even after skipping a year.':
    'Le report est plafonné : le maximum versable en une année reste limité même après une année sautée.',
  'No annual cap, but the CESG grant matches 20% of the first $2,500 each year':
    'Aucun plafond annuel, mais la SCEE verse 20 % des premiers 2 500 $ chaque année',
  'Contributing about $2,500 a year captures the full $500 grant. The grant tops out at $7,200 per child.':
    'Cotiser environ 2 500 $ par an permet d’obtenir la subvention complète de 500 $. Elle plafonne à 7 200 $ par enfant.',
  'No annual cap; grants and bonds depend on family income':
    'Aucun plafond annuel; subventions et bons dépendent du revenu familial',
  'Contributions attract the Canada Disability Savings Grant, and low-income beneficiaries also receive the bond with no contribution at all.':
    'Les cotisations donnent droit à la Subvention canadienne pour l’épargne-invalidité, et les bénéficiaires à faible revenu reçoivent aussi le bon sans aucune cotisation.',
  // Government benefits
  'Government benefits': 'Prestations gouvernementales',
  'CPP / QPP': 'RPC / RRQ',
  OAS: 'SV',
  'at 65 ($/mo, today’s dollars)': 'à 65 ans ($/mois, en dollars d’aujourd’hui)',
  'OAS at 65 ($/mo, today’s dollars)': 'SV à 65 ans ($/mois, en dollars d’aujourd’hui)',
  Start: 'Commencer le',
  'at age': 'à l’âge de',
  'Start OAS at age': 'Commencer la SV à l’âge de',
  'from age': 'dès',
  'Taking it early permanently reduces it; deferring permanently increases it. Get your own estimate from your My Service Canada account — the amounts here are':
    'Un début anticipé réduit la prestation de façon permanente; la reporter l’augmente de façon permanente. Obtenez votre estimation dans Mon dossier Service Canada — les montants ici sont des moyennes de',
  'averages, not your entitlement.': ', pas votre droit réel.',
  'Your savings carry you alone for': 'Votre épargne vous soutient seule pendant',
  'years before benefits begin.': 'ans avant le début des prestations.',
  'At this income, OAS loses about': 'À ce revenu, la SV perd environ',
  'to the recovery tax. TFSA withdrawals don’t count toward it.':
    'à l’impôt de récupération. Les retraits du CELI n’y comptent pas.',
  // RRIF minimum withdrawals
  'RRIF minimum withdrawals': 'Retraits minimums du FERR',
  'Convert RRSP to a RRIF at age': 'Convertir le REER en FERR à l’âge de',
  Age: 'Âge',
  Factor: 'Facteur',
  'RRIF balance': 'Solde du FERR',
  Minimum: 'Minimum',
  Withdrawn: 'Retiré',
  'Your plan already withdraws more than the RRIF minimum every year, so the minimum never binds. It begins at age':
    'Votre plan retire déjà plus que le minimum du FERR chaque année : le minimum ne s’applique jamais. Il commence à',
  'the minimum withdrawal exceeds what your plan would take — up to':
    'le retrait minimum dépasse ce que votre plan prélèverait — jusqu’à',
  'of extra taxable income you cannot defer.':
    'de revenu imposable supplémentaire que vous ne pouvez pas reporter.',
  'In that year the forced income costs a further':
    'Cette année-là, ce revenu forcé coûte',
  'of OAS. Drawing the RRIF down earlier, or splitting pension income with a spouse, reduces it.':
    'de SV en plus. Décaisser le FERR plus tôt, ou fractionner le revenu de pension avec un conjoint, réduit cet effet.',
  'Show less': 'Afficher moins',
  'Show the full schedule to age': 'Afficher le calendrier complet jusqu’à',
  'Amounts are in today’s dollars. Converted at':
    'Montants en dollars d’aujourd’hui. Conversion à',
  ', so the first mandatory withdrawal is the year you turn':
    ', donc le premier retrait obligatoire est l’année de vos',
  'Total with benefits, after tax': 'Total avec prestations, après impôt',
  'Total after tax (today’s $)': 'Total après impôt (en $ d’aujourd’hui)',
  'Monthly retirement income, in today’s dollars':
    'Revenu mensuel à la retraite, en dollars d’aujourd’hui',
  'From your savings (4% rule)': 'De votre épargne (règle du 4 %)',
  'Tax and OAS clawback': 'Impôt et récupération de la SV',
  'Left to spend': 'Reste à dépenser',
  'Household CPP + OAS': 'RPC + SV du ménage',
  'Withdrawals lose about': 'Les retraits perdent environ',
  'to tax overall, leaving': 'en impôt au total, ce qui laisse',
  'to spend.': 'à dépenser.',
  // Plan choice on the sign-up form
  'Choose your plan': 'Choisissez votre forfait',
  Choose: 'Choisir',
  Selected: 'Sélectionné',
  'Start free — decide later': 'Commencer gratuitement — décider plus tard',
  'Create account & start free trial': 'Créer le compte et démarrer l’essai gratuit',
  'Create account & subscribe': 'Créer le compte et s’abonner',
  'Next: Stripe takes your card. Nothing is charged until the trial ends.':
    'Ensuite : Stripe enregistre votre carte. Aucun débit avant la fin de l’essai.',
  'Next: secure payment with Stripe.': 'Ensuite : paiement sécurisé avec Stripe.',
  'Taking you to secure checkout…': 'Redirection vers le paiement sécurisé…',
  'Most banks will work. Banks that open their own login page can’t finish here until this website’s address is added to the Plaid dashboard.':
    'La plupart des banques fonctionneront. Celles qui ouvrent leur propre page de connexion ne pourront pas terminer ici tant que l’adresse de ce site n’aura pas été ajoutée au tableau de bord Plaid.',
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
const CountryContext = createContext<{ country: Country; setCountry: (c: Country) => void }>({
  country: 'US',
  setCountry: () => {},
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
export const useCountry = () => useContext(CountryContext);
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
  const [country, setCountryState] = useState<Country>(
    () => (localStorage.getItem('nw-country') as Country) || guessCountry()
  );
  const [dateFrom, setDateFrom] = useState(() => localStorage.getItem('nw-txn-from') || '');
  const [dateTo, setDateTo] = useState(() => localStorage.getItem('nw-txn-to') || '');

  // Convex is the durable, cross-device store — but only for signed-in users.
  // Signed out (on the sign-in page) we stay on localStorage only.
  const { isAuthenticated } = useConvexAuth();
  const serverPrefs = useQuery(api.preferences.get);
  const savePrefs = useMutation(api.preferences.set);
  const persist = (p: { theme: Theme; lang: Lang; currency: Currency; country: Country }) => {
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
    localStorage.setItem('nw-country', country);
  }, [country]);

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
      persist({ theme, lang, currency, country });
    } else {
      setThemeState(serverPrefs.theme);
      setLangState(serverPrefs.lang);
      if (serverPrefs.currency) setCurrencyState(serverPrefs.currency);
      // Rows written before the country setting existed have none. Keep the
      // local guess and push it up, rather than silently defaulting them to the
      // US and showing a Canadian user 401(k)s.
      if (serverPrefs.country) setCountryState(serverPrefs.country);
      else persist({ theme: serverPrefs.theme, lang: serverPrefs.lang, currency, country });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPrefs, isAuthenticated]);

  const applyTheme = (th: Theme) => {
    setThemeState(th);
    persist({ theme: th, lang, currency, country });
  };
  const applyLang = (l: Lang) => {
    setLangState(l);
    persist({ theme, lang: l, currency, country });
  };
  const applyCurrency = (c: Currency) => {
    setCurrencyState(c);
    persist({ theme, lang, currency: c, country });
  };
  const applyCountry = (c: Country) => {
    setCountryState(c);
    persist({ theme, lang, currency, country: c });
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
          <CountryContext.Provider value={{ country, setCountry: applyCountry }}>
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
          </CountryContext.Provider>
        </CurrencyContext.Provider>
      </LangContext.Provider>
    </ThemeContext.Provider>
  );
}
