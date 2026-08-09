// src/hooks/useRiskTicker.ts
import { useEffect, useState } from 'react';
import { RiskItem } from '@/constants/mockData';

export function useRiskTicker(baseline: RiskItem[]) {
  const [displayRisks, setDisplayRisks] = useState<RiskItem[]>(baseline);

  // 1. Set initial baseline
  useEffect(() => {
    setDisplayRisks(baseline);
  }, [baseline]);

  // 2. Random walk every 1 second
  useEffect(() => {
    if (baseline.length === 0) return;

    const interval = setInterval(() => {
      setDisplayRisks((prev) =>
        prev.map((item, idx) => {
          const base = baseline[idx]?.risk ?? item.risk;
          const step = (Math.random() - 0.5) * 0.6;
          let newRisk = item.risk + step;
          newRisk = Math.min(100, Math.max(0, newRisk));
          // Mean reversion back to baseline
          newRisk += (base - newRisk) * 0.02;
          return { ...item, risk: newRisk };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [baseline]);

  return displayRisks;
}
