// src/constants/mockData.ts

export type NewsItem = {
  id: string;
  exchange: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  timestamp: string;
  severity: 'high' | 'medium' | 'low';
};

export type RiskItem = {
  exchange: string;
  risk: number; // baseline percentage
};

export const MOCK_NEWS: NewsItem[] = [
  {
    id: 'n1',
    exchange: 'Binance',
    headline: 'UK class-action lawsuit filed for £150M',
    summary: '1,700 British investors sue Binance and CZ over unlicensed derivatives.',
    source: 'Reuters',
    url: 'https://reuters.com',
    timestamp: new Date().toISOString(),
    severity: 'high',
  },
  {
    id: 'n2',
    exchange: 'Coinbase',
    headline: 'Q2 net loss $359M – 3rd consecutive quarter',
    summary: 'Trading revenue down 21% YoY, subscription revenue holds up.',
    source: 'Bloomberg',
    url: 'https://bloomberg.com',
    timestamp: new Date().toISOString(),
    severity: 'high',
  },
  {
    id: 'n3',
    exchange: 'Kraken',
    headline: 'Secures MiCA licence from Ireland',
    summary: 'Expands services to 450M EU consumers.',
    source: 'CoinDesk',
    url: 'https://coindesk.com',
    timestamp: new Date().toISOString(),
    severity: 'low',
  },
  {
    id: 'n4',
    exchange: 'Bybit',
    headline: 'Added to Singapore MAS Investor Alert List',
    summary: 'Not authorised to operate in Singapore – compliance concerns.',
    source: 'The Block',
    url: 'https://theblock.co',
    timestamp: new Date().toISOString(),
    severity: 'medium',
  },
  {
    id: 'n5',
    exchange: 'OKX',
    headline: 'ICE (NYSE parent) invests at $25B valuation',
    summary: 'Major institutional endorsement strengthens credibility.',
    source: 'FT',
    url: 'https://ft.com',
    timestamp: new Date().toISOString(),
    severity: 'low',
  },
];

export const MOCK_RISK_BASELINE: RiskItem[] = [
  { exchange: 'Binance', risk: 25.3 },
  { exchange: 'Coinbase', risk: 30.1 },
  { exchange: 'Kraken', risk: 10.0 },
  { exchange: 'Bybit', risk: 35.4 },
  { exchange: 'OKX', risk: 15.2 },
  { exchange: 'KuCoin', risk: 20.4 },
];
