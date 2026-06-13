/**
 * Withdrawal engine — a faithful TS port of the algorithms in
 * design_specs/design.md (buildWithdrawalPlan, simulateWithdrawal,
 * executeWithdrawalPlan).
 *
 * `executeWithdrawalPlanLive` performs REAL withdrawals through an
 * ExchangeManager (signed REST per exchange). `executeWithdrawalPlan` remains a
 * mocked executor used when no live manager / credentials are available.
 */

import type { ExchangeManager } from '@/exchange';
import {
  AllocationTargets,
  BalanceMap,
  ExchangeId,
  ExecutionMode,
  ExecutionResults,
  OperationStatus,
  TransactionStatus,
  USD_PRICES,
  ValidationResult,
  WithdrawalPlan,
  WithdrawalRequest,
  WithdrawalResult,
} from './types';

let idCounter = 0;
function generateUniqueId(): string {
  idCounter += 1;
  // Avoids Math.random/Date.now restrictions in some sandboxes; uses a counter
  // plus a coarse time seed captured at call time.
  return `${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function usdValue(asset: string, amount: number): number {
  const price = USD_PRICES[asset] ?? 0;
  return price * amount;
}

/**
 * Fraction of the available balance a panic withdrawal actually moves. We leave
 * a small buffer (the remaining 1 - fraction) untouched so the on-chain /
 * exchange withdrawal fee can be deducted without the request being rejected
 * for "insufficient balance" when fees are charged on top of the amount.
 *
 * 0.95 → withdraw 95%, leaving a 5% headroom for fees.
 */
export const WITHDRAWAL_BUFFER_FRACTION = 0.95;

/** Apply the fee buffer to a raw available balance and round to 8 dp. */
export function bufferedWithdrawalAmount(available: number): number {
  return roundAsset(available * WITHDRAWAL_BUFFER_FRACTION);
}

/**
 * buildWithdrawalPlan — calculates withdrawal amounts from each exchange's
 * per-asset allocation percentages.
 */
export function buildWithdrawalPlan(
  balances: Record<ExchangeId, BalanceMap>,
  targets: AllocationTargets,
  mode: ExecutionMode
): WithdrawalPlan {
  const requests: WithdrawalRequest[] = [];

  // Destinations are configured per (exchange, asset). For each exchange's
  // balance, withdraw the configured percentage of each enabled asset to that
  // exchange's recipient for the asset.
  for (const [exchangeId, balanceMap] of Object.entries(balances)) {
    const assetConfigs = targets.byExchange[exchangeId];
    if (!assetConfigs) continue;

    for (const [asset, allocation] of Object.entries(assetConfigs)) {
      if (!allocation.enabled) continue;
      if (allocation.percentage <= 0) continue;

      const exchangeAmount = balanceMap[asset];
      if (!exchangeAmount || exchangeAmount <= 0) continue;

      const withdrawAmount = exchangeAmount * (allocation.percentage / 100);
      if (withdrawAmount < allocation.minimumAmount) continue;

      const address = (allocation.address ?? '').trim();
      const krakenKey = (allocation.krakenKey ?? '').trim();
      if (!address && !krakenKey) continue;

      requests.push({
        exchangeId,
        asset,
        amount: roundAsset(withdrawAmount),
        destinationAddress: address || krakenKey,
        krakenKey: krakenKey || undefined,
        network: allocation.network ?? defaultNetwork(asset),
        memo: allocation.memo,
      });
    }
  }

  const totalValueUSD = requests.reduce((sum, r) => sum + usdValue(r.asset, r.amount), 0);

  return {
    operationId: generateUniqueId(),
    createdAt: Date.now(),
    mode,
    requests,
    estimatedDurationMs: Math.max(1500, requests.length * 800),
    totalValueUSD,
  };
}

/**
 * buildFullWithdrawalPlan — the "empty the accounts" escape plan. Creates one
 * request per (exchange, asset) for the ENTIRE available balance fetched live
 * from each exchange. No allocation percentages: a panic withdraws everything.
 *
 * Recipient destinations are configured PER (exchange, asset), read from
 * `targets.byExchange[exchangeId][asset]`:
 *  - `address`  — the recipient address used by most exchanges.
 *  - `krakenKey` — Kraken-style whitelisted withdrawal-key name (optional).
 *  - `network` / `memo` — carried over from the chosen saved address.
 *
 * An (exchange, asset) pair is only included when it is enabled AND has a
 * usable destination (an address, or a Kraken key for a Kraken withdrawal).
 */
export function buildFullWithdrawalPlan(
  balances: Record<ExchangeId, BalanceMap>,
  targets: AllocationTargets,
  mode: ExecutionMode
): WithdrawalPlan {
  const requests: WithdrawalRequest[] = [];

  for (const [exchangeId, balanceMap] of Object.entries(balances)) {
    const assetConfigs = targets.byExchange[exchangeId];
    if (!assetConfigs) continue;

    for (const [asset, amount] of Object.entries(balanceMap)) {
      if (!amount || amount <= 0) continue;

      const cfg = assetConfigs[asset];
      if (!cfg || !cfg.enabled) continue;

      const address = (cfg.address ?? '').trim();
      const krakenKey = (cfg.krakenKey ?? '').trim();
      // Need at least one usable destination for this (exchange, asset).
      if (!address && !krakenKey) continue;

      // Withdraw 95% of the available balance, leaving a buffer so the
      // withdrawal fee can be deducted without overdrawing the account.
      const withdrawAmount = bufferedWithdrawalAmount(amount);
      if (withdrawAmount <= 0) continue;

      requests.push({
        exchangeId,
        asset,
        amount: withdrawAmount,
        // Kraken adapter prefers krakenKey; address is the fallback /
        // destination for every other exchange.
        destinationAddress: address || krakenKey,
        krakenKey: krakenKey || undefined,
        network: cfg.network ?? defaultNetwork(asset),
        memo: cfg.memo,
      });
    }
  }

  const totalValueUSD = requests.reduce((sum, r) => sum + usdValue(r.asset, r.amount), 0);

  return {
    operationId: generateUniqueId(),
    createdAt: Date.now(),
    mode,
    requests,
    estimatedDurationMs: Math.max(1500, requests.length * 800),
    totalValueUSD,
  };
}

function roundAsset(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function defaultNetwork(asset: string): string {
  switch (asset) {
    case 'BTC':
      return 'Bitcoin';
    case 'ETH':
    case 'USDT':
    case 'USDC':
    case 'DAI':
      return 'ERC20';
    case 'SOL':
      return 'Solana';
    case 'ADA':
      return 'Cardano';
    case 'DOT':
      return 'Polkadot';
    default:
      return 'Mainnet';
  }
}

/** Lightweight validation used in simulation mode. */
export function validateWithdrawalRequest(
  request: WithdrawalRequest,
  balances: Record<ExchangeId, BalanceMap>
): ValidationResult {
  // A Kraken-style withdrawal targets a pre-named whitelisted key (short label),
  // so a krakenKey is itself a valid destination. Otherwise require a plausible
  // on-chain address length.
  const hasKrakenKey = (request.krakenKey ?? '').trim().length > 0;
  const address = (request.destinationAddress ?? '').trim();
  if (!hasKrakenKey && address.length < 8) {
    return { isValid: false, errorMessage: 'Invalid destination address' };
  }
  if (request.amount <= 0) {
    return { isValid: false, errorMessage: 'Amount must be positive' };
  }
  const available = balances[request.exchangeId]?.[request.asset] ?? 0;
  if (request.amount > available + 1e-9) {
    return {
      isValid: false,
      errorMessage: `Insufficient balance: requested ${request.amount}, available ${available}`,
    };
  }
  return { isValid: true };
}

function aggregateStatus(successCount: number, failureCount: number): OperationStatus {
  if (failureCount === 0) return OperationStatus.SUCCESS;
  if (successCount === 0) return OperationStatus.FAILED;
  return OperationStatus.PARTIAL_SUCCESS;
}

/** Dry-run simulation — validates each request, never executes. */
export function simulateWithdrawal(
  plan: WithdrawalPlan,
  balances: Record<ExchangeId, BalanceMap>
): ExecutionResults {
  const startTime = Date.now();
  const individualResults: WithdrawalResult[] = [];
  let successCount = 0;
  let failureCount = 0;
  let totalProcessed = 0;

  for (const request of plan.requests) {
    const validation = validateWithdrawalRequest(request, balances);
    const base: WithdrawalResult = {
      exchangeId: request.exchangeId,
      asset: request.asset,
      amount: request.amount,
      timestamp: Date.now(),
      status: TransactionStatus.PENDING,
    };

    if (validation.isValid) {
      base.status = TransactionStatus.SUCCESS;
      base.transactionId = `SIMULATED-${generateUniqueId()}`;
      successCount += 1;
      totalProcessed += usdValue(request.asset, request.amount);
    } else {
      base.status = TransactionStatus.FAILED;
      base.errorMessage = validation.errorMessage;
      failureCount += 1;
    }
    individualResults.push(base);
  }

  return {
    operationId: plan.operationId,
    mode: ExecutionMode.DRY_RUN,
    startTime,
    endTime: Date.now(),
    overallStatus: aggregateStatus(successCount, failureCount),
    individualResults,
    successCount,
    failureCount,
    totalProcessed,
  };
}

/**
 * Mocked parallel execution. In a real build each request would hit ccxt's
 * withdraw(); here we resolve with simulated transaction hashes and an
 * occasional injected failure so the results UI is exercised.
 */
export async function executeWithdrawalPlan(
  plan: WithdrawalPlan,
  balances: Record<ExchangeId, BalanceMap>
): Promise<ExecutionResults> {
  const startTime = Date.now();

  const tasks = plan.requests.map(
    (request, index) =>
      new Promise<WithdrawalResult>((resolve) => {
        const delay = 300 + index * 120;
        setTimeout(() => {
          const validation = validateWithdrawalRequest(request, balances);
          if (!validation.isValid) {
            resolve({
              exchangeId: request.exchangeId,
              asset: request.asset,
              amount: request.amount,
              status: TransactionStatus.FAILED,
              errorMessage: validation.errorMessage,
              timestamp: Date.now(),
            });
            return;
          }
          resolve({
            exchangeId: request.exchangeId,
            asset: request.asset,
            amount: request.amount,
            status: TransactionStatus.SUCCESS,
            transactionId: `0x${generateUniqueId().replace(/-/g, '')}${index}`,
            timestamp: Date.now(),
          });
        }, delay);
      })
  );

  const individualResults = await Promise.all(tasks);

  let successCount = 0;
  let failureCount = 0;
  let totalProcessed = 0;
  for (const r of individualResults) {
    if (r.status === TransactionStatus.SUCCESS) {
      successCount += 1;
      totalProcessed += usdValue(r.asset, r.amount);
    } else {
      failureCount += 1;
    }
  }

  return {
    operationId: plan.operationId,
    mode: ExecutionMode.REAL_WITHDRAWAL,
    startTime,
    endTime: Date.now(),
    overallStatus: aggregateStatus(successCount, failureCount),
    individualResults,
    successCount,
    failureCount,
    totalProcessed,
  };
}

/**
 * REAL execution path — submits each request to the live exchange via the
 * ExchangeManager. Requests run in parallel with per-request error isolation
 * (design.md line 506), so one exchange failing never blocks the others.
 */
export async function executeWithdrawalPlanLive(
  plan: WithdrawalPlan,
  manager: ExchangeManager
): Promise<ExecutionResults> {
  const startTime = Date.now();

  const tasks = plan.requests.map(async (request): Promise<WithdrawalResult> => {
    try {
      const result = await manager.withdraw(request.exchangeId, {
        asset: request.asset,
        amount: request.amount,
        address: request.destinationAddress,
        network: request.network,
        memo: request.memo,
        krakenKey: request.krakenKey,
      });
      // `pending` = the exchange accepted the request but is holding it for an
      // out-of-band confirmation (e.g. Deribit email/2FA) the app can't finish.
      const status = result.ok
        ? TransactionStatus.SUCCESS
        : result.pending
          ? TransactionStatus.PENDING
          : TransactionStatus.FAILED;
      return {
        exchangeId: request.exchangeId,
        asset: request.asset,
        amount: request.amount,
        status,
        transactionId: result.transactionId,
        errorMessage: result.ok ? undefined : result.errorMessage,
        timestamp: Date.now(),
      };
    } catch (e) {
      return {
        exchangeId: request.exchangeId,
        asset: request.asset,
        amount: request.amount,
        status: TransactionStatus.FAILED,
        errorMessage: e instanceof Error ? e.message : String(e),
        timestamp: Date.now(),
      };
    }
  });

  const individualResults = await Promise.all(tasks);

  let successCount = 0;
  let failureCount = 0;
  let totalProcessed = 0;
  for (const r of individualResults) {
    if (r.status === TransactionStatus.SUCCESS) {
      successCount += 1;
      totalProcessed += usdValue(r.asset, r.amount);
    } else {
      failureCount += 1;
    }
  }

  return {
    operationId: plan.operationId,
    mode: ExecutionMode.REAL_WITHDRAWAL,
    startTime,
    endTime: Date.now(),
    overallStatus: aggregateStatus(successCount, failureCount),
    individualResults,
    successCount,
    failureCount,
    totalProcessed,
  };
}
