/**
 * ExchangeManager — design.md Component 1, realized over the adapter layer.
 *
 * Responsibilities:
 *  - Resolve decrypted credentials from the Credential Vault (needs the session
 *    encryption key, which lives only in memory).
 *  - Build the right adapter per exchange and provide unified balance/withdraw.
 *  - Isolate per-exchange failures so one bad exchange never aborts the rest.
 *
 * The session encryption key is passed in per call and never stored on the
 * instance, matching the in-memory-only key handling in AppStore.
 */
import { retrieveCredentials } from '@/security';
import { AssetSymbol, BalanceMap, ExchangeId, SavedAddress } from '@/domain/types';
import {
  AdapterWithdrawal,
  AdapterWithdrawalResult,
  BalanceMapDetailed,
  ChainOption,
  ConnectionTestResult,
  ExchangeAdapter,
  toBalanceMap,
} from './adapter';
import { ADAPTER_FACTORIES, isLiveSupported } from './registry';

export class ExchangeManager {
  constructor(private readonly encryptionKey: Uint8Array) {}

  /** Build a live adapter for an exchange, or null if unsupported / no creds. */
  private async adapterFor(exchangeId: ExchangeId): Promise<ExchangeAdapter | null> {
    const factory = ADAPTER_FACTORIES[exchangeId];
    if (!factory) return null;
    const creds = await retrieveCredentials(exchangeId, this.encryptionKey);
    if (!creds) return null;
    return factory(creds);
  }

  /** True when this exchange has both an adapter and stored credentials. */
  async isConnectable(exchangeId: ExchangeId): Promise<boolean> {
    if (!isLiveSupported(exchangeId)) return false;
    const creds = await retrieveCredentials(exchangeId, this.encryptionKey);
    return Boolean(creds);
  }

  /** Validate stored credentials against the live API. */
  async testConnection(exchangeId: ExchangeId): Promise<ConnectionTestResult> {
    const adapter = await this.adapterFor(exchangeId);
    if (!adapter) {
      return { ok: false, canWithdraw: false, errorMessage: 'No credentials or unsupported exchange' };
    }
    return adapter.testConnection();
  }

  /**
   * Fetch live balances (with exchange-sourced USD) across the given exchanges
   * in parallel. Exchanges that error or have no live adapter are omitted.
   */
  async fetchBalancesDetailed(
    exchangeIds: ExchangeId[]
  ): Promise<Record<ExchangeId, BalanceMapDetailed>> {
    const entries = await Promise.all(
      exchangeIds.map(async (id) => {
        try {
          const adapter = await this.adapterFor(id);
          if (!adapter) return null;
          const balances = await adapter.fetchBalances();
          return [id, balances] as const;
        } catch {
          return null;
        }
      })
    );
    const out: Record<ExchangeId, BalanceMapDetailed> = {};
    for (const e of entries) if (e) out[e[0]] = e[1];
    return out;
  }

  /** Convenience: plain amount-only balances (for the withdrawal engine). */
  async fetchBalances(
    exchangeIds: ExchangeId[]
  ): Promise<Record<ExchangeId, BalanceMap>> {
    const detailed = await this.fetchBalancesDetailed(exchangeIds);
    const out: Record<ExchangeId, BalanceMap> = {};
    for (const [id, d] of Object.entries(detailed)) out[id] = toBalanceMap(d);
    return out;
  }

  /**
   * Fetch the saved / whitelisted withdrawal addresses for one exchange.
   * Returns [] when there is no adapter/credentials or the exchange has no
   * address-book API. Never throws.
   */
  async fetchWithdrawAddresses(exchangeId: ExchangeId): Promise<SavedAddress[]> {
    try {
      const adapter = await this.adapterFor(exchangeId);
      if (!adapter) return [];
      return await adapter.fetchWithdrawAddresses();
    } catch {
      return [];
    }
  }

  /**
   * Fetch the withdrawal networks/chains available for an asset on one exchange.
   * Returns [] when there is no adapter/credentials or the exchange has no chain
   * API. Never throws.
   */
  async fetchChains(exchangeId: ExchangeId, asset: AssetSymbol): Promise<ChainOption[]> {
    try {
      const adapter = await this.adapterFor(exchangeId);
      return (await adapter?.fetchChains?.(asset)) ?? [];
    } catch {
      return [];
    }
  }

  /** Execute a single withdrawal on one exchange. Never throws. */
  async withdraw(
    exchangeId: ExchangeId,
    req: AdapterWithdrawal
  ): Promise<AdapterWithdrawalResult> {
    const adapter = await this.adapterFor(exchangeId);
    if (!adapter) {
      return { ok: false, errorMessage: 'No live adapter / credentials for this exchange' };
    }
    return adapter.withdraw(req);
  }
}
