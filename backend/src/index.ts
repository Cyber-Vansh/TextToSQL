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
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Project, IProject } from './models/Project';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/chat_history';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:5001';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    try {
      console.log('Starting project cleanup...');
      const projects = await Project.find({ type: 'csv' });
      let deletedCount = 0;
      
      for (const project of projects) {
        const proj = project as any;
        if (proj.csvPath && !fs.existsSync(proj.csvPath)) {
          console.log(`Deleting invalid project: ${proj.name} (File missing: ${proj.csvPath})`);
          await ChatSession.deleteMany({ projectId: proj._id });
          await Project.deleteOne({ _id: proj._id });
          deletedCount++;
        }
      }
      console.log(`Project cleanup complete. Removed ${deletedCount} invalid projects.`);
    } catch (err) {
      console.error('Error during project cleanup:', err);
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

app.get('/api/health', async (req: Request, res: Response) => {
  console.log(`[Health Check] Checking AI Service at ${AI_SERVICE_URL}...`);
  try {
    const aiHealth = await axios.get(`${AI_SERVICE_URL}/`, { timeout: 10000 });
    console.log(`[Health Check] AI Service responded: ${aiHealth.status}`);
    res.json({ 
      status: 'ok', 
      service: 'backend', 
      aiService: aiHealth.status === 200 ? 'ok' : 'error' 
    });
  } catch (error) {
    console.error(`[Health Check] AI Service failed:`, error instanceof Error ? error.message : error);
    res.json({ 
      status: 'ok', 
      service: 'backend', 
      aiService: 'down' 
    });
  }
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

app.get('/api/projects', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const projects = await Project.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.post('/api/projects', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { name, type, dbConfig } = req.body;
  
  if (type !== 'mysql') return res.status(400).json({ error: 'Invalid project type' });

  try {
    const project = new Project({
      userId: req.user.id,
      name,
      type,
      dbConfig
    });
    await project.save();
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.put('/api/projects/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { name, dbConfig } = req.body;
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (name) project.name = name;
    if (dbConfig && project.type === 'mysql') {
       project.dbConfig = { ...project.dbConfig, ...dbConfig };
    }
    
    await project.save();
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

app.delete('/api/projects/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const project = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    await ChatSession.deleteMany({ projectId: project._id });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

app.post('/api/projects/upload', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const project = new Project({
      userId: req.user.id,
      name,
      type: 'csv',
      csvPath: req.file.path
    });
    await project.save();
    res.json(project);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: 'Failed to upload CSV project' });
  }
});

app.get('/api/projects/:id/schema', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const proj = project as any;
    const dbConnection: any = {
      type: proj.type,
      config: proj.type === 'mysql' ? proj.dbConfig : { csvPath: proj.csvPath }
    };

    if (proj.type === 'csv' && proj.csvPath) {
      try {
        const fileContent = fs.readFileSync(proj.csvPath, 'utf8');
        dbConnection.config.csvContent = fileContent;
      } catch (err) {
        console.error("Error reading CSV file:", err);
      }
    }

    const aiResponse = await axios.post(`${AI_SERVICE_URL}/schema`, { 
      db_connection: dbConnection
    });

    res.json(aiResponse.data);
  } catch (error) {
    console.error("Schema fetch error:", error);
    res.status(500).json({ error: 'Failed to fetch schema' });
  }
});

app.get('/api/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await ChatSession.find({ userId: req.user.id })
      .select('title createdAt projectId')
      .populate('projectId', 'name type')
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
  const { question, sessionId, projectId } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  if (!sessionId && !projectId) {
    return res.status(400).json({ error: 'Project ID is required for new chats' });
  }

  try {
    let project;
    let session;

    if (sessionId) {
      session = await ChatSession.findOne({ _id: sessionId, userId: req.user.id }).populate('projectId');
      if (session) {
         project = session.projectId;
      }
    } 
    
    if (!project && projectId) {
      project = await Project.findOne({ _id: projectId, userId: req.user.id });
    }

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const proj = project as any;
    
    const dbConnection: any = {
      type: proj.type,
      config: proj.type === 'mysql' ? proj.dbConfig : { csvPath: proj.csvPath }
    };

    if (proj.type === 'csv' && proj.csvPath) {
       try {
         const fileContent = fs.readFileSync(proj.csvPath, 'utf8');
         dbConnection.config.csvContent = fileContent;
       } catch (err) {
         console.error("Error reading CSV file for query:", err);
       }
    }

    let history: string[] = [];
    if (session && session.messages) {
       const lastMessages = session.messages.slice(-10);
       history = lastMessages.map((msg: any) => {
          return `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`; 
       });
    }

    const aiResponse = await axios.post(`${AI_SERVICE_URL}/query`, { 
      question,
      db_connection: dbConnection,
      history
    });
    const { sql, data } = aiResponse.data;

    const userMessage = { role: 'user', content: question };
    const aiMessage = { role: 'ai', content: data.sql ? "Query executed successfully." : "I couldn't generate a query for that.", sql, result: data };

    if (session) {
      session.messages.push(userMessage, aiMessage);
      await session.save();
    } else {
      session = new ChatSession({
        userId: req.user.id,
        projectId: project._id,
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
