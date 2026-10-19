import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateAndSaveFlashcards } from './src/flashcards.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves our frontend files

// API Endpoint that your UI will call
app.post('/api/generate', async (req, res) => {
  try {
    const { lectureContent } = req.body;
    
    if (!lectureContent) {
      return res.status(400).json({ error: 'Lecture content is required.' });
    }

    // Call the function we built earlier!
    const savedFlashcards = await generateAndSaveFlashcards(lectureContent);
    
    res.json({ success: true, flashcards: savedFlashcards });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Failed to generate flashcards.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Synapse AI server running at http://localhost:${PORT}`);
});