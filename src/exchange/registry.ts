/**
 * Maps an exchangeId to its adapter factory. Adding a new exchange is a single
 * entry here plus the adapter file — nothing else in the app needs to change.
 */
import { AdapterFactory } from './adapter';
import { BinanceAdapter } from './adapters/binance';
import { BybitAdapter } from './adapters/bybit';
import { CoinbaseAdapter } from './adapters/coinbase';
import { DeribitAdapter } from './adapters/deribit';
import { KrakenAdapter } from './adapters/kraken';
import { OkxAdapter } from './adapters/okx';

export const ADAPTER_FACTORIES: Record<string, AdapterFactory> = {
  binance: (c) => new BinanceAdapter(c),
  coinbase: (c) => new CoinbaseAdapter(c),
  kraken: (c) => new KrakenAdapter(c),
  bybit: (c) => new BybitAdapter(c),
  okx: (c) => new OkxAdapter(c),
  deribit: (c) => new DeribitAdapter(c),
};

/** Exchanges that require an extra passphrase field at connect time. */
export const REQUIRES_PASSPHRASE = new Set(['okx']);

/**
 * Exchanges that require a 2FA (TOTP) secret to perform API withdrawals. The
 * base32 seed is stored encrypted and used to generate the live `tfa` code at
 * panic time (e.g. Deribit rejects withdrawals without a valid 2FA code).
 */
export const REQUIRES_TOTP = new Set(['deribit']);

export function isLiveSupported(exchangeId: string): boolean {
  return exchangeId in ADAPTER_FACTORIES;
}
