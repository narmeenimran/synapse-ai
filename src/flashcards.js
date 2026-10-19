import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Explicitly target NVIDIA Nemotron models on Nebius Token Factory
async function getAvailableNemotronModel(apiKey) {
  try {
    const res = await fetch('https://api.tokenfactory.nebius.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.data && data.data.length > 0) {
        // Prioritize NVIDIA Nemotron models
        const nemotronModel = data.data.find(m => m.id.toLowerCase().includes('nemotron'));
        if (nemotronModel) {
          console.log(`🤖 Selected NVIDIA Nemotron Model on Nebius: ${nemotronModel.id}`);
          return nemotronModel.id;
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch model list dynamically, falling back to default Nemotron model.');
  }
  return 'nvidia/Nemotron-3_5-Lightning'; // Primary NVIDIA Nemotron target
}

export async function generateAndSaveFlashcards(lectureContent, enableSearch = false, cardCount = 5) {
  let searchContext = '';
  
  // 1. Tavily Web Search Context Expansion (RAG)
  if (enableSearch && process.env.TAVILY_API_KEY) {
    try {
      const searchRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: lectureContent.slice(0, 300),
          search_depth: 'basic'
        })
      });
      const searchData = await searchRes.json();
      if (searchData.results) {
        searchContext = searchData.results.map(r => r.content).join('\n').slice(0, 1000);
      }
    } catch (err) {
      console.warn('⚠️ Tavily search failed:', err.message);
    }
  }

  if (!process.env.NEBIUS_API_KEY) {
    throw new Error('NEBIUS_API_KEY is missing from your .env file.');
  }

  const modelName = await getAvailableNemotronModel(process.env.NEBIUS_API_KEY);

  const prompt = `You are an expert AI tutor powered by NVIDIA Nemotron. Generate EXACTLY ${cardCount} high-quality flashcards based on the provided material.
  
  ${searchContext ? `Real-time Web Search Grounding Context:\n${searchContext}\n` : ''}
  Lecture Content:
  ${lectureContent}

  Respond STRICTLY with a valid JSON array containing objects with "question" and "answer" keys. Example format:
  [
    {"question": "What is concept X?", "answer": "Concept X is defined as..."},
    {"question": "How does mechanism Y work?", "answer": "Mechanism Y works by..."}
  ]`;

  const aiResponse = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NEBIUS_API_KEY}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    })
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    throw new Error(`Nebius Token Factory failed with status ${aiResponse.status}: ${errorText}`);
  }

  const aiData = await aiResponse.json();
  const rawText = aiData.choices[0].message.content.trim();
  
  const jsonStart = rawText.indexOf('[');
  const jsonEnd = rawText.lastIndexOf(']') + 1;
  const jsonString = rawText.slice(jsonStart, jsonEnd);
  const flashcards = JSON.parse(jsonString);

  const cardsToInsert = flashcards.map(card => ({
    question: card.question,
    answer: card.answer,
    repetition_level: 0,
    ease_factor: 2.5,
    next_review_date: new Date().toISOString()
  }));

  const { data: savedCards, error } = await supabase
    .from('flashcards')
    .insert(cardsToInsert)
    .select();

  if (error) {
    console.error('❌ Supabase Insert Error:', error.message);
    throw new Error(`Supabase insert error: ${error.message}`);
  }

  console.log(`✅ Successfully generated and saved ${savedCards ? savedCards.length : 0} cards with NVIDIA Nemotron!`);
  return savedCards;
}