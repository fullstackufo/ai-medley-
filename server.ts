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

const geminiApiKey = process.env.GEMINI_API_KEY;

function logToSession(sessionId: string, msg: string) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].logs.push(`[${new Date().toISOString()}] ${msg}`);
  console.log(`[Session ${sessionId}] ${msg}`);
}

async function runGeminiLoop(sessionId: string, libraryFiles: any[]) {
  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const sessionDir = path.join(workDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir);
    }

    logToSession(sessionId, `Starting autonomous medley loop with ${libraryFiles.length} files from library.`);
    
    // Read the ffmpeg executable path
    logToSession(sessionId, `FFmpeg is located at: ${ffmpegPath}`);

    const systemInstruction = `You are AI Medley Architect — a fully autonomous audio engineer.
Your job is to build a medley out of the provided music library, listen to your output, refine it, and stop only when you are completely satisfied.

# PERSISTENT LIBRARY
You have access to a persistent music library. Some files may already have analysis from previous runs. 
You MUST update a file's analysis using the 'save_file_analysis' tool after listening so you permanently remember its properties across sessions.
NEVER forget the files in this library and their analysis.

# YOUR PROCESS
1. LISTEN: Review analysis for all files. If any lack analysis, listen to them in full. Extract BPM, key, duration, emotional arc, the performer's unique identity, and find best snippet candidates. Save this using 'save_file_analysis'.
2. DESIGN: Determine optimal song order, select one primary snippet per song with precise start/end, design crossfades, and any special processing. Use the saved analysis to make these decisions.
3. BUILD: Write and execute a complete FFmpeg script to trim, assemble, crossfade, and encode a 320kbps MP3. You MUST auto-increment output version numbers on every build/iteration (e.g., "medley_v1.mp3", "medley_v2.mp3"). The FFmpeg executable is located at "${ffmpegPath}".
4. LISTEN TO OUTPUT: Listen to the MP3 you just built. Evaluate the energy arc, transitions, lyrical handoffs, whole-piece coherence, and emotional satisfyingness.
5. SCORE & REFINE: If it has flaws, make targeted changes and generate again.
6. STOP: When you can genuinely find no concrete improvement from listening.

# YOUR STANDARDS
- The medley must feel like one song.
- Every transition must be invisible and meaningful.
- The performer's unique identity must be audible throughout.
- The emotional arc must build, peak, release, and close.
- The opening must be intentional, the closing must feel like a decision.

You have access to the file system and a bash terminal. The FFmpeg executable is at '${ffmpegPath}'.
Your working directory for building the medley is: ${sessionDir}

To listen to a file, call the 'listen_to_audio' tool with the absolute file path.
When you are completely satisfied, call the 'finish_medley' tool with the final MP3 absolute filepath and your summary.

Library Files available:
${libraryFiles.map(f => `- ID: ${f.id}\n  Name: ${f.originalName}\n  Path: ${f.path}\n  Previous Analysis: ${f.analysis || 'NONE'}`).join("\n\n")}
`;

    const executeShellCommandDeclaration = {
      name: 'execute_shell_command',
      description: 'Execute a bash command in your working directory. Use this to run FFmpeg or Python scripts. Returns stdout and stderr.',
      parameters: {
        type: Type.OBJECT,
        properties: { command: { type: Type.STRING } },
        required: ['command']
      }
    };

    const listenToAudioDeclaration = {
      name: 'listen_to_audio',
      description: 'Listen to an audio file. Give the absolute file path, and the system will upload it and pass the audio track to you in the next message.',
      parameters: {
        type: Type.OBJECT,
        properties: { filePath: { type: Type.STRING } },
        required: ['filePath']
      }
    };

    const readFileDeclaration = {
      name: 'read_file',
      description: 'Read the contents of a text file. Use absolute paths.',
      parameters: {
        type: Type.OBJECT,
        properties: { filePath: { type: Type.STRING } },
        required: ['filePath']
      }
    };

    const writeFileDeclaration = {
      name: 'write_file',
      description: 'Write string content to a text file. Use absolute paths.',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          filePath: { type: Type.STRING },
          content: { type: Type.STRING }
        },
        required: ['filePath', 'content']
      }
    };

    const finishMedleyDeclaration = {
      name: 'finish_medley',
      description: 'Call this when you are COMPLETELY SATISFIED. Pass the absolute filepath to the finalized MP3, and your plain-language summary of decisions.',
      parameters: {
        type: Type.OBJECT,
        properties: { 
          finalMp3Path: { type: Type.STRING },
          summary: { type: Type.STRING }
        },
        required: ['finalMp3Path', 'summary']
      }
    };

    const chat = ai.chats.create({
      model: 'gemini-2.5-pro',
      config: {
        systemInstruction,
        tools: [{
          functionDeclarations: [
            executeShellCommandDeclaration,
            listenToAudioDeclaration,
            readFileDeclaration,
            writeFileDeclaration,
            finishMedleyDeclaration,
            {
              name: 'save_file_analysis',
              description: 'Save or update your detailed analysis for a specific library file by ID. Use this after listening to a file so you permanently remember its properties.',
              parameters: {
                type: Type.OBJECT,
                properties: { 
                  fileId: { type: Type.STRING },
                  analysisText: { type: Type.STRING }
                },
                required: ['fileId', 'analysisText']
              }
            }
          ]
        }],
        temperature: 0.2
      }
    });

    logToSession(sessionId, "Prompting Gemini to begin...");
    let result = await chat.sendMessage("Begin your process. The user uploaded the files and said 'Make a medley.' Call 'listen_to_audio' to hear the files, then proceed.");

    let isFinished = false;

    // We implement a custom loop since the SDK's automatic function calling won't handle our custom logic for mapping audio files into the conversation.
    while (!isFinished) {
      if (result.text) {
        logToSession(sessionId, `Gemini: ${result.text}`);
      }

      const functionCalls = result.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        logToSession(sessionId, "Gemini has paused but didn't finish. Nudging to continue...");
        result = await chat.sendMessage("Please continue your process. Remember to call finish_medley when you are completely satisfied.");
        continue;
      }

      for (const call of functionCalls) {
        logToSession(sessionId, `Tool Call: ${call.name}`);
        const args = call.args as any;
        
        let toolResponsePart: any;
        const additionalParts: any[] = [];

        if (call.name === 'execute_shell_command') {
          const command = args.command;
          logToSession(sessionId, `Executing: ${command}`);
          const output = await new Promise<string>((resolve) => {
            exec(command, { cwd: sessionDir }, (err, stdout, stderr) => {
              let res = '';
              if (stdout) res += `STDOUT:\n${stdout}\n`;
              if (stderr) res += `STDERR:\n${stderr}\n`;
              if (err) res += `ERROR:\n${err.message}\n`;
              resolve(res || 'Command executed successfully with no output.');
            });
          });
          toolResponsePart = {
            functionResponse: {
              name: call.name,
              response: { output: output.substring(0, 10000) } // Truncate output if too long
            }
          };
        } 
        else if (call.name === 'listen_to_audio') {
          const filePath = args.filePath;
          logToSession(sessionId, `Uploading ${filePath} to Gemini...`);
          try {
            if (fs.existsSync(filePath)) {
               const uploadRes = await ai.files.upload({
                  file: filePath,
                  mimeType: filePath.endsWith('.mp3') ? 'audio/mp3' : 'audio/wav'
               });
               logToSession(sessionId, `File uploaded successfully. Providing to Gemini...`);
               toolResponsePart = {
                 functionResponse: { name: call.name, response: { status: 'success, audio is attached in this format.' } }
               };
               additionalParts.push({
                 fileData: { fileUri: uploadRes.fileUri, mimeType: uploadRes.mimeType }
               });
            } else {
               toolResponsePart = {
                 functionResponse: { name: call.name, response: { error: 'File not found.' } }
               };
            }
          } catch(e: any) {
            toolResponsePart = {
               functionResponse: { name: call.name, response: { error: e.message } }
            };
          }
        }
        else if (call.name === 'read_file') {
          const filePath = args.filePath;
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            toolResponsePart = {
               functionResponse: { name: call.name, response: { content: content.substring(0, 10000) } }
            };
          } catch(e: any) {
            toolResponsePart = {
               functionResponse: { name: call.name, response: { error: e.message } }
            };
          }
        }
        else if (call.name === 'write_file') {
          const filePath = args.filePath;
          try {
            fs.writeFileSync(filePath, args.content, 'utf-8');
            toolResponsePart = {
               functionResponse: { name: call.name, response: { status: 'success' } }
            };
          } catch(e: any) {
            toolResponsePart = {
               functionResponse: { name: call.name, response: { error: e.message } }
            };
          }
        }
        else if (call.name === 'save_file_analysis') {
          const library = getLibrary();
          const entry = library.find((f: any) => f.id === args.fileId);
          if (entry) {
            entry.analysis = args.analysisText;
            saveLibrary(library);
            logToSession(sessionId, `Saved analysis for file ${args.fileId}.`);
            toolResponsePart = {
               functionResponse: { name: call.name, response: { status: 'success' } }
            };
          } else {
            toolResponsePart = {
               functionResponse: { name: call.name, response: { error: 'File ID not found in library.' } }
            };
          }
        }
        else if (call.name === 'finish_medley') {
          isFinished = true;
          sessions[sessionId].finalAudioPath = args.finalMp3Path;
          sessions[sessionId].summary = args.summary;
          sessions[sessionId].status = 'completed';
          logToSession(sessionId, `Finished! Summary: ${args.summary}`);
          
          toolResponsePart = {
             functionResponse: { name: call.name, response: { status: 'acknowledged' } }
          };
        }

        if (!isFinished) {
          logToSession(sessionId, `Sending response for ${call.name} back to Gemini.`);
          result = await chat.sendMessage([toolResponsePart, ...additionalParts]);
        }
      }
    }
  } catch (error: any) {
    logToSession(sessionId, `Error in Gemini Loop: ${error.message}`);
    sessions[sessionId].status = 'error';
  }
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

app.post('/api/start', (req, res) => {
  const library = getLibrary();
  if (library.length === 0) {
    return res.status(400).json({ error: 'Library is empty. Upload files first.' });
  }
  
  const sessionId = uuidv4();
  
  sessions[sessionId] = {
    status: 'running',
    logs: []
  };

  runGeminiLoop(sessionId, library);

  res.json({ sessionId });
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
