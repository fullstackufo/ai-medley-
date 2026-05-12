import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import ffmpegPath from 'ffmpeg-static';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure working directory exists
const workDir = path.join(process.cwd(), 'workdir');
if (!fs.existsSync(workDir)) {
  fs.mkdirSync(workDir);
}

const libraryDir = path.join(process.cwd(), 'library');
const audioDir = path.join(libraryDir, 'audio');
const dbPath = path.join(libraryDir, 'db.json');

if (!fs.existsSync(libraryDir)) fs.mkdirSync(libraryDir);
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify([]));

function getLibrary(): any[] {
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveLibrary(data: any[]) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, audioDir),
  filename: (req, file, cb) => {
    const id = uuidv4();
    cb(null, `${id}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

const sessions: Record<string, {
  status: 'running' | 'completed' | 'error';
  logs: string[];
  finalAudioPath?: string;
  summary?: string;
}> = {};

const geminiApiKey = process.env.GEMINI_API_KEY || '';

function logToSession(sessionId: string, msg: string) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].logs.push(`[${new Date().toISOString()}] ${msg}`);
  console.log(`[Session ${sessionId}] ${msg}`);
}

app.get('/api/library', (req, res) => {
  res.json(getLibrary());
});

app.post('/api/library', (req, res) => {
  upload.array('files')(req, res, (err) => {
    if (err) return res.status(500).json({ error: 'Upload error: ' + String(err) });
    const library = getLibrary();
    const files = req.files as Express.Multer.File[];
    if (!files) return res.json({ success: true, files: [] });
    
    const newEntries = files.map(f => ({
      id: f.filename.split('.')[0],
      originalName: f.originalname,
      filename: f.filename,
      path: f.path,
      size: f.size,
      mimeType: f.mimetype,
      uploadedAt: new Date().toISOString()
    }));
    
    library.push(...newEntries);
    saveLibrary(library);
    res.json({ success: true, files: newEntries });
  });
});

app.delete('/api/library/:id', (req, res) => {
  const library = getLibrary();
  const id = req.params.id;
  const index = library.findIndex((e: any) => e.id === id);
  if (index !== -1) {
    const entry = library[index];
    if (fs.existsSync(entry.path)) fs.unlinkSync(entry.path);
    library.splice(index, 1);
    saveLibrary(library);
  }
  res.json({ success: true });
});

app.get('/api/audio-raw/:id', (req, res) => {
  const library = getLibrary();
  const entry = library.find((e: any) => e.id === req.params.id);
  if (!entry || !fs.existsSync(entry.path)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(entry.path);
});

app.post('/api/session/finish', (req, res) => {
  const { sessionId, finalAudioPath, summary } = req.body;
  sessions[sessionId] = {
    status: 'completed',
    logs: [],
    finalAudioPath,
    summary
  };
  res.json({ success: true });
});

app.get('/api/session/:id', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({
    status: session.status,
    logs: session.logs,
    summary: session.summary
  });
});

app.get('/api/audio/:id', (req, res) => {
  const session = sessions[req.params.id];
  if (!session || !session.finalAudioPath || !fs.existsSync(session.finalAudioPath)) {
    res.status(404).json({ error: 'Audio not found' });
    return;
  }
  res.sendFile(session.finalAudioPath);
});

// Explicitly handle 404 for any other /api routes to avoid returning HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.path} not found` });
});

app.post('/api/exec', (req, res) => {
  const { command, sessionId } = req.body;
  if (!command) return res.status(400).json({ error: 'Command is required' });
  
  const sessionDir = path.join(workDir, sessionId || 'default');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  exec(command, { cwd: sessionDir }, (err, stdout, stderr) => {
    let output = '';
    if (stdout) output += `STDOUT:\n${stdout}\n`;
    if (stderr) output += `STDERR:\n${stderr}\n`;
    if (err) output += `ERROR:\n${err.message}\n`;
    res.json({ output: output || 'Success with no output.' });
  });
});

app.get('/api/file-read', (req, res) => {
  const { filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'filePath is required' });
  try {
    const content = fs.readFileSync(filePath as string, 'utf-8');
    res.json({ content });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/file-write', (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: 'filePath and content are required' });
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/library/analysis', (req, res) => {
  const { fileId, analysisText } = req.body;
  if (!fileId || !analysisText) return res.status(400).json({ error: 'fileId and analysisText are required' });
  
  const library = getLibrary();
  const index = library.findIndex((f: any) => f.id === fileId);
  if (index !== -1) {
    library[index].analysis = analysisText;
    saveLibrary(library);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

async function startServer() {
  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
