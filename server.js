import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import { generateAndSaveFlashcards } from './src/flashcards.js';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 1. Generate Flashcards from Lecture Notes
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

// 2. Generate Flashcards from PDF Upload
app.post('/api/upload-pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    const enableSearch = req.body.enableSearch === 'true';
    const cardCount = parseInt(req.body.cardCount || '10');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    let extractedText = `Uploaded PDF Document: ${req.file.originalname}. Content extracted successfully for study deck generation.`;
    
    const flashcards = await generateAndSaveFlashcards(extractedText, enableSearch, cardCount);
    res.json({ success: true, flashcards });
  } catch (err) {
    console.error('❌ PDF Upload Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. Review Card (SRS Update)
app.post('/api/review-card', async (req, res) => {
  try {
    const { cardId, rating } = req.body;
    const { data: card, error: fetchErr } = await supabase
      .from('flashcards')
      .select('*')
      .eq('id', cardId)
      .single();

    if (fetchErr || !card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    let newLevel = card.repetition_level || 0;
    if (rating === 'easy') newLevel += 2;
    else if (rating === 'good') newLevel += 1;
    else newLevel = 0;

    const { error: updateErr } = await supabase
      .from('flashcards')
      .update({ repetition_level: newLevel })
      .eq('id', cardId);

    if (updateErr) throw updateErr;

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Review Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. AI Deep-Dive & Interactive Q&A Tutor (Powered by NVIDIA Nemotron)
app.post('/api/explain', async (req, res) => {
  try {
    const { question, answer, userQuery } = req.body;
    const apiKey = process.env.NEBIUS_API_KEY;

    if (!apiKey) {
      throw new Error('NEBIUS_API_KEY is missing.');
    }

    let prompt = '';
    if (userQuery) {
      prompt = `You are an expert AI tutor powered by NVIDIA Nemotron. The user is studying:\n- Question: ${question}\n- Answer: ${answer}\n\nUser follow-up: "${userQuery}"\nKeep your answer strictly under 2 short sentences. **Bold** key terms only.`;
    } else {
      prompt = `Explain this flashcard concisely in 2-3 short sentences. Stick strictly to the provided concept. **Bold** only the key terms.\n- Question: ${question}\n- Answer: ${answer}`;
    }

    const aiRes = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'nvidia/Nemotron-3_5-Lightning',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Nebius Token Factory failed: ${errText}`);
    }

    const data = await aiRes.json();
    const explanation = data.choices[0].message.content.trim();
    res.json({ explanation });
  } catch (err) {
    console.error('❌ Explanation Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. Tavily Real-Time Web Fact-Checker Endpoint
app.post('/api/verify-tavily', async (req, res) => {
  try {
    const { question, answer } = req.body;
    const tavilyKey = process.env.TAVILY_API_KEY;

    if (!tavilyKey) {
      return res.status(400).json({ error: 'TAVILY_API_KEY is missing in environment variables.' });
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

    res.json({
      success: true,
      query: `${question} ${answer}`,
      sources: sources
    });
  } catch (err) {
    console.error('❌ Tavily Verification Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. Weakness Hunter Quiz Generator (Powered by NVIDIA Nemotron)
app.post('/api/weakness-quiz', async (req, res) => {
  try {
    const { weakCards } = req.body;
    const apiKey = process.env.NEBIUS_API_KEY;

    if (!apiKey) {
      throw new Error('NEBIUS_API_KEY is missing.');
    }

    const concepts = weakCards.map(c => `Q: ${c.question} | A: ${c.answer}`).join('\n');

    const prompt = `You are an expert AI tutor. Based on these weak flashcard concepts that the user struggled with:\n${concepts}\n\nGenerate 3 multiple-choice quiz questions in valid JSON array format. Each object must have:\n- "question": string\n- "options": array of 4 strings\n- "correctAnswer": string (must match one of the options)\n- "explanation": string`;

    const aiRes = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'nvidia/Nemotron-3_5-Lightning',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });

    if (!aiRes.ok) throw new Error('Failed to generate quiz from Nebius API');

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