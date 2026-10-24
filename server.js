import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import { generateAndSaveFlashcards } from './src/flashcards.js';
import { createClient } from '@supabase/supabase-js';
import { PDFParse } from 'pdf-parse';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 1. Generate Flashcards with Difficulty Tags
app.post('/api/generate', async (req, res) => {
  try {
    const { lectureContent, enableSearch, cardCount } = req.body;
    const flashcards = await generateAndSaveFlashcards(lectureContent, enableSearch, cardCount);
    res.json({ success: true, flashcards });
  } catch (err) {
    console.error('❌ Generation Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Upload PDF & Generate Tagged Cards
app.post('/api/upload-pdf', upload.single('pdfFile'), async (req, res) => {
  let parser = null;
  try {
    const enableSearch = req.body.enableSearch === 'true';
    const cardCount = parseInt(req.body.cardCount || '10');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    parser = new PDFParse({ data: req.file.buffer });
    const pdfData = await parser.getText();
    
    const extractedText = pdfData.text && pdfData.text.trim().length > 30 
      ? pdfData.text 
      : `Uploaded PDF Document: ${req.file.originalname}. Core study notes extracted.`;
    
    const flashcards = await generateAndSaveFlashcards(extractedText, enableSearch, cardCount);
    res.json({ success: true, flashcards });
  } catch (err) {
    console.error('❌ PDF Upload Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch (e) {}
    }
  }
});

// 3. Review Card (Optimized for Instant Response)
app.post('/api/review-card', async (req, res) => {
  try {
    const { cardId, rating } = req.body;

    if (cardId) {
      const { data: card, error: fetchErr } = await supabase
        .from('flashcards')
        .select('*')
        .eq('id', cardId)
        .single();

      if (!fetchErr && card) {
        let newLevel = card.repetition_level || 0;
        if (rating === 'easy') newLevel += 2;
        else if (rating === 'good') newLevel += 1;
        else newLevel = 0;

        await supabase
          .from('flashcards')
          .update({ repetition_level: newLevel })
          .eq('id', cardId);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Review Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. Nemotron Ultra-Fast Streaming AI Explanation Endpoint
app.post('/api/explain-stream', async (req, res) => {
  try {
    const { question, answer, userQuery } = req.body;
    const apiKey = process.env.NEBIUS_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: 'NEBIUS_API_KEY is missing.' });
    }

    let prompt = userQuery 
      ? `Concept: ${question} -> ${answer}. Query: "${userQuery}". Answer in 1-2 ultra-short sentences. Bold key terms.`
      : `Explain in 1-2 ultra-short sentences with a quick real-world analogy. Bold key terms. Concept: ${question} -> ${answer}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const aiRes = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'nvidia/Nemotron-3_5-Lightning',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 80,
        stream: true
      })
    });

    if (!aiRes.ok) {
      res.write(`data: ${JSON.stringify({ error: 'Token Factory stream error' })}\n\n`);
      return res.end();
    }

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      res.write(`data: ${chunk}\n\n`);
    }

    res.end();
  } catch (err) {
    console.error('❌ Stream Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. Tavily Real-Time Web Fact-Checker
app.post('/api/verify-tavily', async (req, res) => {
  try {
    const { question, answer } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;

    if (!tavilyKey) {
      return res.status(400).json({ error: 'TAVILY_API_KEY is missing.' });
    }

    const searchRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: `${question} ${answer}`,
        search_depth: 'basic',
        max_results: 3
      })
    });

    const tavilyData = await searchRes.json();
    const results = tavilyData.results || [];

    const sources = results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 150) + '...'
    }));

    res.json({ success: true, sources });
  } catch (err) {
    console.error('❌ Tavily Verification Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. Weakness Hunter Quiz Generator
app.post('/api/weakness-quiz', async (req, res) => {
  try {
    const { weakCards } = req.body;
    const apiKey = process.env.NEBIUS_API_KEY;

    if (!apiKey) {
      throw new Error('NEBIUS_API_KEY is missing.');
    }

    const concepts = weakCards.map(c => `Q: ${c.question} | A: ${c.answer}`).join('\n');

    const prompt = `You are an expert AI tutor. Based on these weak flashcard concepts:\n${concepts}\n\nGenerate 3 multiple-choice quiz questions in valid JSON array format. Each object must have:\n- "question": string\n- "options": array of 4 strings\n- "correctAnswer": string\n- "explanation": string`;

    const aiRes = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'nvidia/Nemotron-3_5-Lightning',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!aiRes.ok) throw new Error('Failed to generate quiz');

    const data = await aiRes.json();
    let rawContent = data.choices[0].message.content.trim();
    
    if (rawContent.startsWith('```json')) {
      rawContent = rawContent.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const quizQuestions = JSON.parse(rawContent);
    res.json({ success: true, quizQuestions });
  } catch (err) {
    console.error('❌ Quiz Generation Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Synapse AI backend running on http://localhost:${port}`);
});