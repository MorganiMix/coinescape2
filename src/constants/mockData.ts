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
  risk: number;
};

// Helper functions
function extractExchange(title: string): string {
  const exchanges = ['Binance', 'Coinbase', 'Kraken', 'Bybit', 'OKX', 'KuCoin'];
  for (const ex of exchanges) {
    if (title.includes(ex)) return ex;
  }
  return 'Other';
}

function detectSeverity(title: string): 'high' | 'medium' | 'low' {
  const high = ['hack', 'sue', 'lawsuit', 'fine', 'penalty', 'crash', 'emergency', 'warning'];
  const medium = ['delay', 'suspend', 'investigation', 'concern'];
  const text = title.toLowerCase();
  if (high.some(word => text.includes(word))) return 'high';
  if (medium.some(word => text.includes(word))) return 'medium';
  return 'low';
}

// ========== STATIC FALLBACK DATA ==========
const FALLBACK_NEWS: NewsItem[] = [
  {
    id: '1',
    exchange: 'Binance',
    headline: 'Binance expands European operations',
    summary: 'Binance announces new European headquarters and regulatory compliance updates.',
    source: 'CoinDesk',
    url: '#',
    timestamp: new Date().toISOString(),
    severity: 'low',
  },
  {
    id: '2',
    exchange: 'Coinbase',
    headline: 'Coinbase reports Q3 earnings',
    summary: 'Exchange reports better than expected earnings despite market downturn.',
    source: 'Bloomberg',
    url: '#',
    timestamp: new Date().toISOString(),
    severity: 'medium',
  },
  {
    id: '3',
    exchange: 'Kraken',
    headline: 'Kraken receives regulatory approval',
    summary: 'Kraken secures new licenses in EU and US markets.',
    source: 'Reuters',
    url: '#',
    timestamp: new Date().toISOString(),
    severity: 'low',
  },
  {
    id: '4',
    exchange: 'Bybit',
    headline: 'Bybit addresses regulatory concerns',
    summary: 'Exchange engages with regulators to ensure compliance.',
    source: 'The Block',
    url: '#',
    timestamp: new Date().toISOString(),
    severity: 'medium',
  },
  {
    id: '5',
    exchange: 'OKX',
    headline: 'OKX launches new trading features',
    summary: 'New derivatives products and improved liquidity features.',
    source: 'CoinTelegraph',
    url: '#',
    timestamp: new Date().toISOString(),
    severity: 'low',
  },
  {
    id: '6',
    exchange: 'KuCoin',
    headline: 'KuCoin expands into Asian markets',
    summary: 'Exchange announces expansion strategy for Southeast Asia.',
    source: 'CoinTelegraph',
    url: '#',
    timestamp: new Date().toISOString(),
    severity: 'low',
  },
];

// ========== NEWS API ==========
export const fetchRealNews = async (): Promise<{ date: string; news: NewsItem[] }> => {
  try {
    console.log('Fetching news from CoinGecko...');
    const response = await fetch('https://api.coingecko.com/api/v3/news');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('News data received:', data);
    
    const articles = data.data || [];
    
    if (articles.length === 0) {
      throw new Error('No news articles found');
    }
    
    return {
      date: new Date().toISOString(),
      news: articles.slice(0, 20).map((article: any) => ({
        id: article.id || String(Math.random()),
        exchange: extractExchange(article.title || ''),
        headline: article.title || 'No title',
        summary: article.description || article.content || '',
        source: article.source || 'CoinGecko',
        url: article.url || '#',
        timestamp: article.published_at || new Date().toISOString(),
        severity: detectSeverity(article.title || ''),
      })),
    };
  } catch (error) {
    console.error('Failed to fetch news:', error);
    return {
      date: new Date().toISOString(),
      news: FALLBACK_NEWS,
    };
  }
};

// ========== RISK API ==========
export const fetchRealRisks = async (): Promise<{ timestamp: string; risks: RiskItem[] }> => {
  try {
    console.log('Fetching risk data from CoinGecko...');
    const response = await fetch('https://api.coingecko.com/api/v3/exchanges');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Risk data received:', data);
    
    const targetExchanges = ['Binance', 'Coinbase', 'Kraken', 'Bybit', 'OKX', 'KuCoin'];
    
    const risks = data
      .filter((ex: any) => targetExchanges.includes(ex.name))
      .map((ex: any) => {
        const trustScore = ex.trust_score || 5;
        const risk = ((10 - trustScore) / 10) * 100;
        return {
          exchange: ex.name,
          risk: Math.round(Math.min(100, Math.max(5, risk)) * 10) / 10,
        };
      });
    
    if (risks.length === 0) {
      throw new Error('No exchanges matched');
    }
    
    return {
      timestamp: new Date().toISOString(),
      risks: risks,
    };
  } catch (error) {
    console.error('Failed to fetch risks:', error);
    return {
      timestamp: new Date().toISOString(),
      risks: [
        { exchange: 'Binance', risk: 25.3 },
        { exchange: 'Coinbase', risk: 30.1 },
        { exchange: 'Kraken', risk: 10.0 },
        { exchange: 'Bybit', risk: 35.4 },
        { exchange: 'OKX', risk: 15.2 },
        { exchange: 'KuCoin', risk: 20.4 },
      ],
    };
  }
};
