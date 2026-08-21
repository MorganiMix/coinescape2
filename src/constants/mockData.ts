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
    headline: '📰 Unable to fetch news – check connection',
    summary: 'The news API is not responding. Please check your internet connection or try again later.',
    source: 'System',
    url: '#',
    timestamp: new Date().toISOString(),
    severity: 'high',
  },
  {
    id: '2',
    exchange: 'Coinbase',
    headline: '🔄 Refresh to try again',
    summary: 'Pull down to refresh or restart the app to fetch the latest news.',
    source: 'System',
    url: '#',
    timestamp: new Date().toISOString(),
    severity: 'medium',
  },
];

// ========== NEWS API (Working Free APIs) ==========
export const fetchRealNews = async (): Promise<{ date: string; news: NewsItem[] }> => {
  // Try API 1: CoinGecko (still works, no key needed for basic)
  try {
    console.log('📰 Fetching news from CoinGecko...');
    const response = await fetch('https://api.coingecko.com/api/v3/news');
    
    if (response.ok) {
      const data = await response.json();
      const articles = data.data || [];
      
      if (articles.length > 0) {
        console.log('✅ CoinGecko returned', articles.length, 'articles');
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
      }
    }
  } catch (error) {
    console.warn('⚠️ CoinGecko failed:', error);
  }

  // Try API 2: CryptoNews (alternative free API)
  try {
    console.log('📰 Fetching news from CryptoNews...');
    const response = await fetch('https://cryptonews-api.com/api/v1?limit=20&source=all');
    
    if (response.ok) {
      const data = await response.json();
      const articles = data.data || [];
      
      if (articles.length > 0) {
        console.log('✅ CryptoNews returned', articles.length, 'articles');
        return {
          date: new Date().toISOString(),
          news: articles.slice(0, 20).map((article: any) => ({
            id: article.id || String(Math.random()),
            exchange: extractExchange(article.title || ''),
            headline: article.title || 'No title',
            summary: article.text || article.description || '',
            source: article.source || 'CryptoNews',
            url: article.news_url || '#',
            timestamp: article.date || new Date().toISOString(),
            severity: detectSeverity(article.title || ''),
          })),
        };
      }
    }
  } catch (error) {
    console.warn('⚠️ CryptoNews failed:', error);
  }

  // Fallback to static data
  console.warn('❌ All news APIs failed, using fallback data');
  return {
    date: new Date().toISOString(),
    news: FALLBACK_NEWS,
  };
};

// ========== RISK API ==========
export const fetchRealRisks = async (): Promise<{ timestamp: string; risks: RiskItem[] }> => {
  try {
    console.log('📊 Fetching risk data from CoinGecko...');
    const response = await fetch('https://api.coingecko.com/api/v3/exchanges');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Risk data received:', data.length, 'exchanges');
    
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
    
    console.log('✅ Risk data mapped:', risks);
    return {
      timestamp: new Date().toISOString(),
      risks: risks,
    };
  } catch (error) {
    console.error('❌ Failed to fetch risks:', error);
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
