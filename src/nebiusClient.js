import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const client = new OpenAI({
  baseURL: 'https://api.tokenfactory.nebius.com/v1/',
  apiKey: process.env.NEBIUS_API_KEY,
});

export async function testNebiusCall() {
  try {
    const response = await client.chat.completions.create({
      model: 'nvidia/Nemotron-3_5-Lightning',
      messages: [
        {
          role: 'system',
          content: 'You are an AI study assistant. Respond in structured JSON only with a "message" key.',
        },
        {
          role: 'user',
          content: 'Say hello and confirm the connection is working!',
        },
      ],
      response_format: { type: 'json_object' },
    });

    console.log('🎉 Success! Nebius AI Response:\n', response.choices[0].message.content);
  } catch (error) {
    console.error('❌ API Error Details:', error);
  }
}