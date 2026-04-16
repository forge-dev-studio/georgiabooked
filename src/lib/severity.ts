export type Severity = 'violent_felony' | 'felony' | 'serious_misdemeanor' | 'misdemeanor';

const VIOLENT_FELONY_PATTERNS = [
  /\bmurder\b/i,
  /\bhomicide\b/i,
  /\bmanslaughter\b/i,
  /\bkidnap/i,
  /\brape\b/i,
  /\bsexual\s+assault\b/i,
  /\barmed\s+robbery\b/i,
  /\baggravated\s+assault\b/i,
  /\baggravated\s+battery\b/i,
  /\bbattery\b.*\bfamily\s+violence\b/i,
  /\bfamily\s+violence\b.*\bbattery\b/i,
  /\bchild\s+molest/i,
  /\barson\b/i,
  /\bterroristic\s+threats\b/i,
];

const FELONY_PATTERNS = [
  /\btrafficking\b/i,
  /\bpossession\b.*\b(cocaine|meth\w*|heroin|fentanyl|marijuana\s+with\s+intent)\b/i,
  /\bburglary\b/i,
  /\btheft\s+by\s+taking\s+-\s+felony\b/i,
  /\bfelony\b/i,
  /\bforgery\b/i,
  /\bfraud\b/i,
  /\bweapons?\s+charge\b/i,
  /\bfirearm\b.*\bfelon\b/i,
  /\bidentity\s+theft\b/i,
];

const SERIOUS_MISDEMEANOR_PATTERNS = [
  /\bdui\b/i,
  /\bdriving\s+under\s+the\s+influence\b/i,
  /\breckless\s+driving\b/i,
  /\bobstruction\b/i,
  /\bshoplifting\b/i,
  /\bsimple\s+battery\b/i,
  /\bdisorderly\s+conduct\b/i,
  /\bdisorderly\b/i,
  /\bpossession\s+of\s+marijuana\b/i,
  /\bpossession\s+of\s+drug\s+related\s+objects\b/i,
  /\bcruelty\s+to\s+animals\b/i,
];

export function classifyCharge(charge: string): Severity {
  if (VIOLENT_FELONY_PATTERNS.some((r) => r.test(charge))) return 'violent_felony';
  if (FELONY_PATTERNS.some((r) => r.test(charge))) return 'felony';
  if (SERIOUS_MISDEMEANOR_PATTERNS.some((r) => r.test(charge))) return 'serious_misdemeanor';
  return 'misdemeanor';
}

const SEVERITY_RANK: Record<Severity, number> = {
  misdemeanor: 0,
  serious_misdemeanor: 1,
  felony: 2,
  violent_felony: 3,
};

export function classifyWorst(charges: string[]): Severity {
  if (charges.length === 0) return 'misdemeanor';
  const severities = charges.map(classifyCharge);
  return severities.reduce((worst, s) =>
    SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst
  );
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  violent_felony: 'Violent Felony',
  felony: 'Felony',
  serious_misdemeanor: 'Serious Misdemeanor',
  misdemeanor: 'Misdemeanor',
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  violent_felony: 'bg-red-900 text-red-100 border-red-700',
  felony: 'bg-crimson text-red-50 border-red-500',
  serious_misdemeanor: 'bg-amber-700 text-amber-50 border-amber-500',
  misdemeanor: 'bg-emerald-800 text-emerald-50 border-emerald-600',
};
