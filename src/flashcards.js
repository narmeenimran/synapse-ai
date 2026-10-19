import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// 1. Initialize Nebius AI Client
const ai = new OpenAI({
  baseURL: 'https://api.tokenfactory.nebius.com/v1/',
  apiKey: process.env.NEBIUS_API_KEY,
});

// 2. Initialize Supabase Database Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Generates flashcards from lecture text and saves them into Supabase
 * @param {string} lectureContent - Plain text lecture notes or transcript
 */
export async function generateAndSaveFlashcards(lectureContent) {
  try {
    console.log('🤖 Generating flashcards with Nebius AI...');

    const prompt = `
    You are an expert tutor. Analyze the following lecture text and extract key concepts into multiple revision flashcards.
    Return a JSON object with a "flashcards" array containing multiple flashcard objects.
    Each object MUST have:
    - "question": A clear revision question.
    - "answer": A concise, accurate answer.
    - "concept_tag": A short 1-2 word topic tag (e.g., "Biology").

    Lecture Text:
    """
    ${lectureContent}
    """
    `;

    const aiResponse = await ai.chat.completions.create({
      model: 'nvidia/Nemotron-3_5-Lightning',
      messages: [
        {
          role: 'system',
          content: 'You output valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const rawContent = aiResponse.choices[0].message.content;
    const parsedData = JSON.parse(rawContent);

    // Smart array handler: handle single object or array formats seamlessly
    let flashcards = [];

    if (Array.isArray(parsedData)) {
      flashcards = parsedData;
    } else if (Array.isArray(parsedData.flashcards)) {
      flashcards = parsedData.flashcards;
    } else if (Array.isArray(parsedData.cards)) {
      flashcards = parsedData.cards;
    } else if (parsedData.question && parsedData.answer) {
      // Single flashcard object returned directly
      flashcards = [parsedData];
    } else if (typeof parsedData === 'object') {
      const firstVal = Object.values(parsedData)[0];
      flashcards = Array.isArray(firstVal) ? firstVal : [parsedData];
    }

    if (!flashcards.length) {
      throw new Error(`Could not parse flashcards array from AI response: ${rawContent}`);
    }

    console.log(`✨ AI generated ${flashcards.length} flashcard(s). Saving to Supabase...`);

    // Insert generated flashcards into Supabase table
    const { data, error } = await supabase
      .from('flashcards')
      .insert(flashcards)
      .select();

    if (error) {
      throw error;
    }

    console.log('🎉 Successfully saved to Supabase database!');
    console.table(data);
    return data;

  } catch (error) {
    console.error('❌ Error generating or saving flashcards:', error);
  }
}