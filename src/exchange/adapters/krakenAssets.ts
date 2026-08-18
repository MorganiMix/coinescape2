/**
 * Kraken asset-code normalisation.
 *
 * Kraken is the only exchange we integrate that does not report plain tickers.
 * Two separate quirks have to be unpicked before its balances line up with the
 * `AssetSymbol` strings the rest of the app uses (BTC, DOGE, XMR, …):
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Legacy X/Z prefixes
 * ─────────────────────────────────────────────────────────────────────────
 * Assets listed before ~2018 carry an ISO-4217-style prefix: `X` for crypto,
 * `Z` for fiat — `XXMR` for XMR, `XXDG` for DOGE, `ZUSD` for USD.
 *
 * It is tempting to strip this with a regex like `/^[XZ]/`. **Do not.** Kraken
 * never reserved the letters, so modern four-character tickers collide head-on
 * with the legacy shape. Verified against `GET /0/public/Assets`:
 *
 *   XAUT → XAUT (Tether Gold)      ZETA → ZETA
 *   XION → XION                    ZEUS → ZEUS
 *   XNAP → XNAP                    ZORA → ZORA
 *   XTER → XTER                    ZAMA → ZAMA, ZBCN → ZBCN
 *
 * A regex turns Tether Gold into "AUT" and Zeus Network into "EUS". The legacy
 * set is *closed* — Kraken stopped issuing prefixed codes years ago — so the
 * only correct approach is the explicit table below, which is a verbatim copy
 * of every entry in `/0/public/Assets` whose `altname` differs from its key.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2. Product suffixes
 * ─────────────────────────────────────────────────────────────────────────
 * The balance endpoint also returns per-product sub-balances: `DOT.S`,
 * `XBT.M`, `EUR.HOLD`, `DOT.P`. These are NOT separate assets, and treating
 * them as such (the old behaviour) put rows like "DOT.S" in the portfolio.
 *
 * Because this app exists to move funds *fast*, the distinction that matters is
 * whether a balance can be withdrawn right now — see {@link KrakenBalanceKind}.
 */

/**
 * Every Kraken asset key whose `altname` differs from the key itself, taken
 * from `GET /0/public/Assets`. Key → altname.
 *
 * This is the complete legacy-prefix set (11 crypto + 19 fiat + KFEE). Anything
 * not listed here already uses its plain ticker as the key.
 */
const KRAKEN_KEY_TO_ALTNAME: Record<string, string> = {
  // Crypto — legacy `X` prefix
  XETC: 'ETC',
  XETH: 'ETH',
  XLTC: 'LTC',
  XMLN: 'MLN',
  XREP: 'REP',
  XXBT: 'XBT',
  XXDG: 'XDG',
  XXLM: 'XLM',
  XXMR: 'XMR',
  XXRP: 'XRP',
  XZEC: 'ZEC',
  // Fiat — legacy `Z` prefix
  ZARS: 'ARS',
  ZAUD: 'AUD',
  ZCAD: 'CAD',
  ZCLP: 'CLP',
  ZCOP: 'COP',
  ZDKK: 'DKK',
  ZEUR: 'EUR',
  ZGBP: 'GBP',
  ZGEL: 'GEL',
  ZGHS: 'GHS',
  ZJPY: 'JPY',
  ZLKR: 'LKR',
  ZMXN: 'MXN',
  ZPLN: 'PLN',
  ZSEK: 'SEK',
  ZUGX: 'UGX',
  ZUSD: 'USD',
  ZVND: 'VND',
  ZXOF: 'XOF',
  // Kraken fee credits — not a tradable or withdrawable asset.
  KFEE: 'FEE',
};

/**
 * The two Kraken altnames that still aren't the symbol the rest of the world
 * (and this app) uses. Everything else matches once the prefix is gone.
 */
const ALTNAME_TO_APP_SYMBOL: Record<string, string> = {
  XBT: 'BTC',
  XDG: 'DOGE',
};

/** Reverse of the two maps above, built once at module load. */
const APP_SYMBOL_TO_ALTNAME: Record<string, string> = Object.fromEntries(
  Object.entries(ALTNAME_TO_APP_SYMBOL).map(([alt, sym]) => [sym, alt])
);
const ALTNAME_TO_KRAKEN_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(KRAKEN_KEY_TO_ALTNAME).map(([key, alt]) => [alt, key])
);

/**
 * What kind of Kraken balance an entry represents.
 *
 *  - `spot`   — ordinary tradable balance, withdrawable now.
 *  - `earn`   — instantly-redeemable earn products (`.M` opt-in rewards) and
 *               fiat holds (`.HOLD`). Kraken unwinds these automatically on
 *               withdrawal, so they count toward the withdrawable balance.
 *  - `staked` — bonded with a real unbonding delay (`.S` staked, `.P`
 *               parachain, and the legacy `ETH2` token). DOT unbonds over 28
 *               days and ATOM over 21; a panic withdrawal cannot touch these.
 *  - `fee`    — Kraken fee credits (KFEE). Not withdrawable, not an asset.
 */
export type KrakenBalanceKind = 'spot' | 'earn' | 'staked' | 'fee';

export interface KrakenAssetInfo {
  /** App-standard symbol, e.g. `BTC`, `DOGE`, `XMR`. */
  symbol: string;
  kind: KrakenBalanceKind;
  /** Whether this balance can be withdrawn right now. */
  withdrawable: boolean;
}

/** Suffixes that bond funds for a period — excluded from withdrawable balances. */
const STAKED_SUFFIXES = new Set(['S', 'P', 'B']);
/** Suffixes Kraken redeems automatically on withdrawal — safe to merge into spot. */
const EARN_SUFFIXES = new Set(['M', 'F', 'HOLD']);

/**
 * Translate one key from `GET /0/private/Balance` into an app symbol plus a
 * verdict on whether it can actually be moved.
 *
 * Unknown suffixes (`HYPER.CORE`, `USDT0.TEMPO` — chain/venue variants rather
 * than earn products) are deliberately passed through verbatim rather than
 * merged into their base. They are genuinely distinct balances, and silently
 * folding `USDT0.TEMPO` into `USDT0` would overstate what is withdrawable on
 * either chain.
 */
export function parseKrakenAsset(code: string): KrakenAssetInfo {
  const raw = code.toUpperCase();
  const dot = raw.indexOf('.');

  if (dot === -1) {
    const symbol = toAppSymbol(raw);
    // The pre-merge staking token. Redeemable 1:1 for ETH these days, but not
    // directly withdrawable, so it must not inflate the ETH balance.
    if (raw === 'ETH2') return { symbol: 'ETH2', kind: 'staked', withdrawable: false };
    if (raw === 'KFEE') return { symbol, kind: 'fee', withdrawable: false };
    return { symbol, kind: 'spot', withdrawable: true };
  }

  const base = raw.slice(0, dot);
  const suffix = raw.slice(dot + 1);

  if (STAKED_SUFFIXES.has(suffix)) {
    // Numbered bonding variants (DOT28.S, ATOM21.S, SOL03.S, FLOWH.S) encode the
    // unbonding period in the base. Strip it so the symbol is still recognisable
    // in diagnostics, even though the balance is excluded either way.
    const stripped = base.replace(/(?:\d+|H)$/, '');
    return { symbol: toAppSymbol(stripped || base), kind: 'staked', withdrawable: false };
  }

  if (EARN_SUFFIXES.has(suffix)) {
    return { symbol: toAppSymbol(base), kind: 'earn', withdrawable: true };
  }

  // Unrecognised product suffix — keep it whole and let it through untouched.
  return { symbol: raw, kind: 'spot', withdrawable: true };
}

/** Kraken asset key or altname → app-standard symbol. `XXDG` → `DOGE`. */
export function toAppSymbol(krakenCode: string): string {
  const altname = KRAKEN_KEY_TO_ALTNAME[krakenCode] ?? krakenCode;
  return ALTNAME_TO_APP_SYMBOL[altname] ?? altname;
}

/**
 * App-standard symbol → the code Kraken's private endpoints expect.
 * `BTC` → `XBT`, `DOGE` → `XDG`. Everything else passes through.
 */
export function toKrakenAsset(symbol: string): string {
  const s = symbol.toUpperCase();
  return APP_SYMBOL_TO_ALTNAME[s] ?? s;
}

/** The `pair` value to request from `/0/public/Ticker`, e.g. `DOGE` → `XDGUSD`. */
export function toKrakenUsdPair(symbol: string): string {
  return `${toKrakenAsset(symbol)}USD`;
}

/**
 * True if a key in a `/0/public/Ticker` response is the USD pair for `symbol`.
 *
 * Necessary because Kraken accepts a pair by altname but answers with the
 * canonical key: ask for `XMRUSD`, get back `XXMRZUSD`; ask for `XDGUSD`, get
 * back `XDGUSD`. Rather than guess which form applies to which asset, match
 * against every shape Kraken is known to use.
 */
export function isKrakenUsdPairFor(responseKey: string, symbol: string): boolean {
  const altname = toKrakenAsset(symbol);
  const legacyKey = ALTNAME_TO_KRAKEN_KEY[altname] ?? altname;
  return (
    responseKey === `${altname}USD` ||
    responseKey === `${altname}ZUSD` ||
    responseKey === `${legacyKey}USD` ||
    responseKey === `${legacyKey}ZUSD`
  );
}
