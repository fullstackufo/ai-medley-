import { GoogleGenAI } from '@google/genai';
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'fake' });
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
console.log('Model object prototype:', Object.getPrototypeOf(model).constructor.name);
const chat = model.startChat();
console.log('Chat object prototype:', Object.getPrototypeOf(chat).constructor.name);
