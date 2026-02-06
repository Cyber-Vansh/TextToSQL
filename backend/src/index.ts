import express, { Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import { Chat } from './models/Chat';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/chat_history';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:5001';

app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'backend' });
});

app.get('/api/history', async (req: Request, res: Response) => {
  try {
    const history = await Chat.find().sort({ timestamp: -1 }).limit(50);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/api/chat', async (req: Request, res: Response) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const aiResponse = await axios.post(`${AI_SERVICE_URL}/query`, { question });
    
    const { sql, data } = aiResponse.data;

    const chat = new Chat({
      question,
      sql,
      result: data
    });

    await chat.save();

    res.json(chat);
  } catch (error) {
    console.error('Error processing query:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
