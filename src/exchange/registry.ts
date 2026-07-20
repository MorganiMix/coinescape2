/**
 * Maps an exchangeId to its adapter factory. Adding a new exchange is a single
 * entry here plus the adapter file — nothing else in the app needs to change.
 */
import { AdapterFactory } from './adapter';
import { BinanceAdapter } from './adapters/binance';
import { BybitAdapter } from './adapters/bybit';
import { CoinbaseAdapter } from './adapters/coinbase';
// Deribit temporarily disabled (connection/withdrawal not working reliably).
// import { DeribitAdapter } from './adapters/deribit';
import { KrakenAdapter } from './adapters/kraken';
import { KucoinAdapter } from './adapters/kucoin';
import { OkxAdapter } from './adapters/okx';

export const ADAPTER_FACTORIES: Record<string, AdapterFactory> = {
  binance: (c) => new BinanceAdapter(c),
  coinbase: (c) => new CoinbaseAdapter(c),
  kraken: (c) => new KrakenAdapter(c),
  bybit: (c) => new BybitAdapter(c),
  okx: (c) => new OkxAdapter(c),
  kucoin: (c) => new KucoinAdapter(c),
  // deribit: (c) => new DeribitAdapter(c),
};

/** Exchanges that require an extra passphrase field at connect time. */
export const REQUIRES_PASSPHRASE = new Set(['okx', 'kucoin']);

/**
 * Exchanges that require a 2FA (TOTP) secret to perform API withdrawals. The
 * base32 seed is stored encrypted and used to generate the live `tfa` code at
 * panic time (e.g. Deribit rejects withdrawals without a valid 2FA code).
 */
export const REQUIRES_TOTP = new Set<string>([/* 'deribit' — disabled */]);

export function isLiveSupported(exchangeId: string): boolean {
  return exchangeId in ADAPTER_FACTORIES;
}

/**
 * Exchanges whose API exposes a readable withdrawal address-book / whitelist
 * (so the app can offer a saved-address picker). Exchanges NOT listed here have
 * no such endpoint — Coinbase, OKX and KuCoin manage the whitelist in their own
 * web/app UI only — so the app must tell the user to enter the address manually.
 */
export const SUPPORTS_ADDRESS_BOOK = new Set(['binance', 'bybit', 'kraken']);

/** True when the app can fetch a saved-address list for this exchange. */
export function hasAddressBook(exchangeId: string): boolean {
  return SUPPORTS_ADDRESS_BOOK.has(exchangeId);
}

/**
 * Exchanges whose API exposes a per-asset list of withdrawal networks/chains
 * (so the app can offer a chain picker). Exchanges NOT listed here have no chain
 * concept — Coinbase, Deribit and Kraken withdraw to a single network per asset
 * — so the UI hides the network selector for them.
 */
export const SUPPORTS_CHAIN_SELECTION = new Set(['binance', 'bybit', 'okx', 'kucoin']);

/** True when the app can fetch + offer a chain list for this exchange. */
export function hasChainSelection(exchangeId: string): boolean {
  return SUPPORTS_CHAIN_SELECTION.has(exchangeId);
}

/**
 * Exchanges that withdraw to a pre-named, whitelisted "withdrawal key" (a wallet
 * name) rather than a raw address. Only Kraken works this way — so the wallet-name
 * field is shown only for these exchanges and hidden for every other setup.
 */
export const SUPPORTS_WALLET_NAME = new Set(['kraken']);

/** True when this exchange withdraws to a named wallet key (Kraken-style). */
export function hasWalletName(exchangeId: string): boolean {
  return SUPPORTS_WALLET_NAME.has(exchangeId);
}
