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

// ========== REAL NEWS API ==========
export const fetchRealNews = async (): Promise<{ date: string; news: NewsItem[] }> => {
  try {
    // OPTION 1: Crypto Vision (Free, no API key)
    const response = await fetch('https://cryptovision-api.vercel.app/news');
    
    // OPTION 2: CoinGecko News (Free, no API key)
    // const response = await fetch('https://api.coingecko.com/api/v3/news');
    
    const data = await response.json();
    
    // Map API response to your NewsItem format
    // Adjust this based on which API you use
    const articles = data.articles || data.data || data.news || [];
    
    return {
      date: new Date().toISOString(),
      news: articles.slice(0, 20).map((article: any) => ({
        id: article.id || String(Math.random()),
        exchange: extractExchange(article.title || article.headline || ''),
        headline: article.title || article.headline || 'No title',
        summary: article.description || article.summary || article.content || '',
        source: article.source || article.publisher || 'Unknown',
        url: article.url || article.link || '#',
        timestamp: article.published_at || article.publishedAt || new Date().toISOString(),
        severity: detectSeverity(article.title || article.headline || ''),
      })),
    };
  } catch (error) {
    console.error('Failed to fetch news:', error);
    // Return fallback empty array
    return { date: new Date().toISOString(), news: [] };
  }
};

// Helper: Extract exchange name from headline
function extractExchange(title: string): string {
  const exchanges = ['Binance', 'Coinbase', 'Kraken', 'Bybit', 'OKX', 'KuCoin', 'Gate.io', 'Bitfinex'];
  for (const ex of exchanges) {
    if (title.includes(ex)) return ex;
  }
  return 'Other';
}

// Helper: Detect severity from headline
function detectSeverity(title: string): 'high' | 'medium' | 'low' {
  const high = ['hack', 'sue', 'lawsuit', 'fine', 'penalty', 'crash', 'emergency', 'warning'];
  const medium = ['delay', 'suspend', 'investigation', 'concern'];
  const text = title.toLowerCase();
  if (high.some(word => text.includes(word))) return 'high';
  if (medium.some(word => text.includes(word))) return 'medium';
  return 'low';
}

// ========== REAL RISK API (Your Backend) ==========
// For now, this returns static data. Replace with your backend endpoint.
export const fetchRealRisks = async (): Promise<{ timestamp: string; risks: RiskItem[] }> => {
  try {
    // Replace this URL with your actual backend API
    const response = await fetch('http://localhost:5000/api/risks/latest');
    const data = await response.json();
    return {
      timestamp: data.timestamp || new Date().toISOString(),
      risks: data.risks || [],
    };
  } catch (error) {
    console.error('Failed to fetch risks:', error);
    // Fallback to static baseline if API fails
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

// For backwards compatibility with existing imports
export const MOCK_NEWS: NewsItem[] = [];
export const MOCK_RISK_BASELINE: RiskItem[] = [];
