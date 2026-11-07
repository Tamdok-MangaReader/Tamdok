// Source language codes without a region mapped to the country that is most associated with them.
const LANGUAGE_COUNTRY: Record<string, string> = {
  en: 'US', ja: 'JP', ko: 'KR', zh: 'CN', es: 'ES', pt: 'PT', ru: 'RU', fr: 'FR', de: 'DE', it: 'IT',
  id: 'ID', vi: 'VN', th: 'TH', ar: 'SA', tr: 'TR', pl: 'PL', uk: 'UA', hi: 'IN', bn: 'BD', nl: 'NL',
  sv: 'SE', no: 'NO', nb: 'NO', da: 'DK', fi: 'FI', cs: 'CZ', sk: 'SK', hu: 'HU', ro: 'RO', bg: 'BG',
  el: 'GR', he: 'IL', fa: 'IR', ms: 'MY', fil: 'PH', tl: 'PH', ca: 'ES', sr: 'RS', hr: 'HR', lt: 'LT',
  lv: 'LV', et: 'EE', mn: 'MN', my: 'MM', ne: 'NP', ta: 'IN', te: 'IN', ur: 'PK', sq: 'AL', ka: 'GE',
  be: 'BY', kk: 'KZ', uz: 'UZ', az: 'AZ', hy: 'AM', sl: 'SI', mk: 'MK', is: 'IS', ga: 'IE', la: 'VA',
  ab: 'GE', af: 'ZA', am: 'ET', bs: 'BA', ceb: 'PH', cv: 'RU', eo: 'EU', eu: 'ES', fo: 'FO', gl: 'ES',
  gn: 'PY', gu: 'IN', ha: 'NG', ht: 'HT', ig: 'NG', jv: 'ID', km: 'KH', kn: 'IN', ku: 'IQ', ky: 'KG',
  lb: 'LU', lo: 'LA', mg: 'MG', mi: 'NZ', ml: 'IN', mo: 'MD', mr: 'IN', mt: 'MT', ny: 'MW', ps: 'AF',
  rm: 'CH', sd: 'PK', sh: 'RS', si: 'LK', sm: 'WS', sn: 'ZW', so: 'SO', ss: 'SZ', st: 'LS', sw: 'TZ',
  tg: 'TJ', ti: 'ER', tk: 'TM', to: 'TO', yo: 'NG', zu: 'ZA',
};
// Script subtags that carry no country of their own.
const SCRIPT_COUNTRY: Record<string, string> = { hans: 'CN', hant: 'TW' };

function toFlag(country: string): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

/** Flag emoji for a language code such as `en`, `pt-BR` or `zh-Hans`; a globe for multi-language entries; unknown codes get a plain globe. */
export function languageFlag(code: string): string {
  const parts = code.replace('_', '-').split('-');
  const base = parts[0]!.toLowerCase();
  if (base === 'multi' || base === 'all' || base === 'mul' || base === 'other') return '🌍';
  const region = parts.slice(1).find((part) => /^[A-Za-z]{2}$/.test(part));
  const script = parts.slice(1).find((part) => /^[A-Za-z]{4}$/.test(part))?.toLowerCase();
  const country = region ?? (script ? SCRIPT_COUNTRY[script] : undefined) ?? LANGUAGE_COUNTRY[base];
  return country ? toFlag(country) : '🌐';
}

export function languageWithFlag(code: string, label: string = code): string {
  return `${languageFlag(code)} ${label}`;
}
