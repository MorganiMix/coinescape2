// src/constants/api.ts
const NEWS_API = 'https://api.coingecko.com/api/v3/news';
const RISK_API = 'https://your-backend.com/api/risks'; // Your own scoring endpoint

export const fetchRealNews = async () => {
  const response = await fetch(NEWS_API);
  const data = await response.json();
  return {
    date: new Date().toISOString(),
    news: data.articles.map(article => ({
      id: article.id,
      exchange: extractExchange(article.title), // Parse exchange name
      headline: article.title,
      summary: article.description,
      source: article.source,
      url: article.url,
      timestamp: article.published_at,
      severity: article.sentiment === 'negative' ? 'high' : 'low'
    }))
  };
};

export const fetchRealRisks = async () => {
  const response = await fetch(RISK_API);
  return response.json();
};
