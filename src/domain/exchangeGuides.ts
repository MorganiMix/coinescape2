/**
 * Per-exchange "how to connect your API" guides — the SINGLE SOURCE OF TRUTH.
 *
 * This is intentionally plain data (no React/UI imports) so it can be:
 *   - rendered natively in-app (see app/(app)/exchange-guide.tsx), and
 *   - reused to generate the public landing-page guides from the same content,
 *     avoiding the drift that makes security instructions dangerous.
 *
 * Permission wording is deliberately concrete about what Coin Escape needs
 * (read balances + withdraw only — never trading/futures), rather than a vague
 * "set permissions as required", because getting the permission scope right is
 * the whole point of a withdrawal-only safety key.
 */
import { ExchangeId } from './types';

export interface ExchangeGuide {
  /** Exchange display name (kept here so the landing page needs only this file). */
  name: string;
  /** One-line summary shown under the title. */
  intro: string;
  /** Ordered setup steps (already human-numbered by the UI). */
  steps: string[];
  /** The exact permission scope to enable on the key. */
  permissionNote: string;
  /** The credential fields the user will paste into Settings → Connect. */
  credentialFields: string[];
  /** Optional extra caution shown as a highlighted tip. */
  tip?: string;
}

/** Permission line reused by every centralized exchange. */
const READ_WITHDRAW =
  'Enable ONLY "Read" (view balances) and "Enable Withdrawals". Do NOT enable Trading, Futures, or Margin — Coin Escape never needs them.';

export const EXCHANGE_GUIDES: Record<string, ExchangeGuide> = {
  binance: {
    name: 'Binance',
    intro: 'Create a withdrawal-enabled API key on Binance.',
    steps: [
      'Log in to Binance.',
      'Go to Profile → API Management.',
      'Create a new API key and verify with email / 2FA.',
      'Copy the API Key and Secret Key — the secret is shown only once.',
      'Set permissions: enable Read and Enable Withdrawals only.',
      'If available, whitelist your withdrawal address (strongly recommended).',
      'Paste the API Key and Secret into Coin Escape → Settings → Binance.',
    ],
    permissionNote: READ_WITHDRAW,
    credentialFields: ['API Key', 'Secret Key'],
    tip: 'Binance shows the Secret Key only once. If you lose it, delete the key and create a new one.',
  },
  coinbase: {
    name: 'Coinbase',
    intro: 'Create an Advanced Trade API key on Coinbase.',
    steps: [
      'Log in to Coinbase.',
      'Go to Settings → API (or the Developer Platform, depending on your account).',
      'Create a new API key.',
      'Choose permissions: read balances and withdraw (transfer) only.',
      'Copy the API Key and Secret.',
      'Add them to Coin Escape → Settings → Coinbase.',
    ],
    permissionNote: READ_WITHDRAW,
    credentialFields: ['API Key', 'Secret'],
    tip: 'Coinbase does not expose a saved-address list over the API, so enter your whitelisted recipient address manually in Settings.',
  },
  kraken: {
    name: 'Kraken',
    intro: 'Generate an API key pair on Kraken.',
    steps: [
      'Log in to Kraken.',
      'Click your profile → Security → API.',
      'Select Generate New Key.',
      'Choose permissions: Query Funds and Withdraw Funds only.',
      'Generate the key.',
      'Save the API Key and Private Key.',
      'Connect them in Coin Escape → Settings → Kraken.',
    ],
    permissionNote:
      'Enable ONLY "Query Funds" and "Withdraw Funds". Leave trading/staking permissions off.',
    credentialFields: ['API Key', 'Private Key'],
    tip: 'Kraken withdraws to a pre-named whitelisted "withdrawal key" rather than a raw address — set that name in Settings for each coin.',
  },
  bybit: {
    name: 'Bybit',
    intro: 'Create a system-generated API key on Bybit.',
    steps: [
      'Log in to Bybit.',
      'Go to Account & Security → API Management.',
      'Click Create New Key.',
      'Choose "System-generated API Key".',
      'Select permissions: Wallet (Read) and Withdraw only.',
      'Complete 2FA verification.',
      'Copy the API Key and Secret into Coin Escape → Settings → Bybit.',
    ],
    permissionNote: READ_WITHDRAW,
    credentialFields: ['API Key', 'Secret'],
  },
  okx: {
    name: 'OKX',
    intro: 'Create an API key on OKX — note that OKX also requires a passphrase.',
    steps: [
      'Log in to OKX.',
      'Go to Profile → API.',
      'Click Create API Key and give the key a name.',
      'Choose permissions: Read and Withdraw only.',
      'Create a passphrase — you will need it to connect.',
      'Save the API Key, Secret Key, and Passphrase.',
      'Enter all three into Coin Escape → Settings → OKX.',
    ],
    permissionNote: READ_WITHDRAW,
    credentialFields: ['API Key', 'Secret Key', 'Passphrase'],
    tip: 'The passphrase is the one YOU set when creating the key — not your account login password. Coin Escape needs all three values.',
  },
  kucoin: {
    name: 'KuCoin',
    intro: 'Create an API key on KuCoin — KuCoin also requires a passphrase.',
    steps: [
      'Log in to KuCoin.',
      'Go to Account Security → API Management.',
      'Create an API.',
      'Set an API passphrase.',
      'Select permissions: General (Read) and Withdraw only.',
      'Verify with 2FA.',
      'Save the API Key, Secret Key, and Passphrase and enter them into Coin Escape.',
    ],
    permissionNote: READ_WITHDRAW,
    credentialFields: ['API Key', 'Secret Key', 'Passphrase'],
    tip: 'The passphrase is the one you set when creating the key. Coin Escape needs all three values.',
  },
  /* Deribit temporarily disabled (connection/withdrawal not working reliably).
  deribit: {
    name: 'Deribit',
    intro: 'Create API credentials on Deribit. Deribit requires a 2FA secret for withdrawals.',
    steps: [
      'Log in to Deribit.',
      'Go to Account → API.',
      'Create a new API credential.',
      'Select permissions: account read and wallet withdraw only.',
      'Save the Client ID and Client Secret.',
      'Add your 2FA (base32) secret so panic withdrawals can complete automatically.',
      'Enter everything into Coin Escape → Settings → Deribit.',
    ],
    permissionNote:
      'Enable account read + wallet/withdraw scopes only. Deribit rejects API withdrawals without a valid 2FA code, so Coin Escape also needs your base32 2FA seed (stored encrypted) to generate the code at panic time.',
    credentialFields: ['Client ID (API Key)', 'Client Secret', '2FA secret (base32 seed)'],
    tip: 'Enter the base32 2FA SEED shown when you set up your authenticator — not the rotating 6-digit code.',
  },
  */
};

/** Look up a guide for an exchange, or undefined if none exists (e.g. "Other"). */
export function guideFor(exchangeId: ExchangeId): ExchangeGuide | undefined {
  return EXCHANGE_GUIDES[exchangeId];
}
