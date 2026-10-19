import { generateAndSaveFlashcards } from './src/flashcards.js';

const sampleLecture = `
Photosynthesis is the process used by plants to convert light energy into chemical energy. 
It takes place in the chloroplasts using chlorophyll pigments. 
The overall equation combines carbon dioxide and water using light energy to produce glucose and oxygen. 
There are two main stages: Light-dependent reactions and the Calvin Cycle (light-independent reactions).
`;

console.log('🚀 Running Synapse AI Flashcard Generator Test...\n');
await generateAndSaveFlashcards(sampleLecture);