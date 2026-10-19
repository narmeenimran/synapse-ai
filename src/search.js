import { tavily } from '@tavily/core';
import dotenv from 'dotenv';

dotenv.config();

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

/**
 * Searches the web using Tavily AI to gather up-to-date context on a topic
 * @param {string} query - Main topic or query extracted from lecture text
 * @returns {Promise<string>} - Summary of live web search results
 */
export async function searchWebContext(query) {
  try {
    console.log(`🌐 Searching live web with Tavily for: "${query}"...`);

    const response = await tvly.search(query, {
      searchDepth: 'basic',
      maxResults: 3,
    });

    const searchSnippets = response.results
      .map((r) => `- ${r.title}: ${r.content}`)
      .join('\n');

    console.log('✅ Web context retrieved successfully!');
    return searchSnippets;
  } catch (error) {
    console.error('⚠️ Tavily search error (continuing without web context):', error.message);
    return ''; // Fallback gracefully if search fails
  }
}