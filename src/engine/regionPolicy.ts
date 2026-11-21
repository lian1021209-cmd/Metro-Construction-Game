// Determines regional visibility policy:
// Mainland China users (IP country === 'CN', or mainland timezone/locale fallback) include Taiwan province.
// Non-China users (Taiwan, Hong Kong, Macau, overseas, etc.) exclude Taiwan from map, stats, search, and heatmaps.

const CACHE_KEY = 'metro_region_country_code_v1';
const CACHE_TS_KEY = 'metro_region_country_ts_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

const MAINLAND_TIMEZONES = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Harbin',
  'Asia/Urumqi',
  'Asia/Kashgar',
  'Asia/Chungking',
  'PRC',
]);

const NON_MAINLAND_TIMEZONES = new Set([
  'Asia/Taipei',
  'Asia/Hong_Kong',
  'Asia/Macau',
  'Asia/Macao',
  'ROC',
]);

export function detectIsChinaUserSync(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const cachedCode = window.localStorage.getItem(CACHE_KEY);
    const cachedTs = Number(window.localStorage.getItem(CACHE_TS_KEY) || '0');
    if (cachedCode && Date.now() - cachedTs < CACHE_TTL_MS) {
      return cachedCode.toUpperCase() === 'CN';
    }
  } catch {
    // ignore storage errors
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (NON_MAINLAND_TIMEZONES.has(tz)) return false;
    if (MAINLAND_TIMEZONES.has(tz)) return true;
  } catch {
    // ignore Intl errors
  }

  const langs = [
    ...(typeof navigator !== 'undefined' && Array.isArray(navigator.languages)
      ? navigator.languages
      : []),
    typeof navigator !== 'undefined' ? navigator.language : '',
  ]
    .filter(Boolean)
    .map((l) => l.toLowerCase());

  for (const l of langs) {
    if (l.includes('zh-cn') || l === 'zh-hans-cn') return true;
    if (
      l.includes('zh-tw') ||
      l.includes('zh-hk') ||
      l.includes('zh-mo') ||
      l.includes('zh-hant')
    ) {
      return false;
    }
  }

  return false;
}

let inFlightCheck: Promise<boolean> | null = null;

export async function verifyChinaUserIpCountry(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const cachedCode = window.localStorage.getItem(CACHE_KEY);
    const cachedTs = Number(window.localStorage.getItem(CACHE_TS_KEY) || '0');
    if (cachedCode && Date.now() - cachedTs < CACHE_TTL_MS) {
      return cachedCode.toUpperCase() === 'CN';
    }
  } catch {
    // ignore storage errors
  }

  if (inFlightCheck) return inFlightCheck;

  inFlightCheck = (async () => {
    const endpoints: Array<{ url: string; parse: (data: Record<string, unknown>) => string | null }> = [
      {
        url: 'https://api.country.is/',
        parse: (d) => (typeof d.country === 'string' ? d.country : null),
      },
      {
        url: 'https://ipapi.co/json/',
        parse: (d) => (typeof d.country_code === 'string' ? d.country_code : null),
      },
    ];

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 3800);
        const res = await fetch(ep.url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        window.clearTimeout(timer);
        if (!res.ok) continue;
        const json = (await res.json()) as Record<string, unknown>;
        const code = ep.parse(json)?.trim().toUpperCase();
        if (code && code.length === 2) {
          try {
            window.localStorage.setItem(CACHE_KEY, code);
            window.localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
          } catch {
            // ignore storage errors
          }
          return code === 'CN';
        }
      } catch {
        // try next endpoint or fall back
      }
    }

    return detectIsChinaUserSync();
  })().finally(() => {
    inFlightCheck = null;
  });

  return inFlightCheck;
}
