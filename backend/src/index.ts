import express, { Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ChatSession } from './models/ChatSession';
import { User } from './models/User';
import { authMiddleware, AuthRequest } from './middleware/authMiddleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/chat_history';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:5001';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'backend' });
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = new User({ email, passwordHash, name });
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, email, name } });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await ChatSession.find({ userId: req.user.id })
      .select('title createdAt')
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.get('/api/history/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, userId: req.user.id });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

app.post('/api/chat', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { question, sessionId } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const aiResponse = await axios.post(`${AI_SERVICE_URL}/query`, { question });
    const { sql, data } = aiResponse.data;

    const userMessage = { role: 'user', content: question };
    const aiMessage = { role: 'ai', content: data.sql ? "Query executed successfully." : "I couldn't generate a query for that.", sql, result: data };

    let session;
    if (sessionId) {
      session = await ChatSession.findOne({ _id: sessionId, userId: req.user.id });
      if (session) {
        session.messages.push(userMessage, aiMessage);
        await session.save();
      }
    }

    if (!session) {
      session = new ChatSession({
        userId: req.user.id,
        title: question.substring(0, 50) + (question.length > 50 ? '...' : ''),
        messages: [userMessage, aiMessage]
      });
      await session.save();
    }

    res.json({ 
      sessionId: session._id, 
      messages: [userMessage, aiMessage],
      sql, 
      result: data 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process query' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
