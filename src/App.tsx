import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, Play, Loader2, Sparkles, AlertCircle, FileCheck2, Disc3 } from 'lucide-react';

interface LibraryFile {
  id: string;
  originalName: string;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  analysis?: string;
}

export default function App() {
  const [library, setLibrary] = useState<LibraryFile[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'running' | 'completed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchLibrary = async () => {
    try {
      const res = await fetch('/api/library');
      if (res.ok) {
        setLibrary(await res.json());
      }
    } catch(e) {}
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (sessionId && status === 'running') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/session/${sessionId}`);
          if (res.ok) {
            const data = await res.json();
            setLogs(data.logs || []);
            if (data.status === 'completed') {
              setStatus('completed');
              setSummary(data.summary);
            } else if (data.status === 'error') {
              setStatus('error');
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [sessionId, status]);

  const uploadToLibrary = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setStatus('uploading');
    setErrorMessage(null);
    
    try {
       for (const f of newFiles) {
           const formData = new FormData();
           formData.append('files', f);
           const res = await fetch('/api/library', { method: 'POST', body: formData });
           if (!res.ok) {
               const errorText = await res.text();
               throw new Error(errorText || res.statusText);
           }
       }
       await fetchLibrary();
       setStatus('idle');
    } catch(e: any) {
       setStatus('error');
       
       // Handle common payload too large error message
       let msg = e.message;
       if (msg.includes('413') || msg.toLowerCase().includes('payload too large') || msg.includes('Entity Too Large')) {
           msg = 'Payload Too Large: One or more files exceed the 32MB server limit.';
       }
       setErrorMessage(msg);
    }
  };

  const removeFile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
        await fetch(`/api/library/${id}`, { method: 'DELETE' });
        await fetchLibrary();
    } catch(e) {}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadToLibrary(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      uploadToLibrary(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/')));
    }
  };

  const startMedley = async () => {
    if (library.length < 2) return;
    setStatus('running');
    setErrorMessage(null);
    
    try {
      const res = await fetch('/api/start', {
        method: 'POST',
      });

      if (!res.ok) {
        let errorText = await res.text();
        try {
           const json = JSON.parse(errorText);
           if (json.error) errorText = json.error;
        } catch(e) {}
        console.error('Start failed:', res.status, res.statusText, errorText);
        throw new Error(`Start failed: ${errorText || res.statusText}`);
      }
      const data = await res.json();
      setSessionId(data.sessionId);
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setErrorMessage(e.message);
    }
  };

  // Prevent drag and drop whole page
  useEffect(() => {
     const preventDefault = (e: Event) => e.preventDefault();
     window.addEventListener("dragover", preventDefault);
     window.addEventListener("drop", preventDefault);
     return () => {
       window.removeEventListener("dragover", preventDefault);
       window.removeEventListener("drop", preventDefault);
     };
  }, []);

  return (
    <div className="h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans flex flex-col overflow-hidden selection:bg-[#00F0FF]/30">
      
      {/* Header */}
      <header className="h-16 border-b border-[#333] flex items-center justify-between px-6 bg-[#111] shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#00F0FF] rounded-sm flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-[#000]"></div>
          </div>
          <h1 className="text-lg font-bold tracking-tight uppercase">AI Medley Architect <span className="text-[#666] font-mono ml-2 text-xs font-normal">v2.1.0-STABLE</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'running' || status === 'uploading' ? 'bg-[#00F0FF] animate-pulse' : status === 'completed' ? 'bg-[#00F0FF]' : 'bg-[#666]'}`}></div>
            <span className={`text-xs font-mono uppercase tracking-widest ${status === 'running' || status === 'uploading' ? 'text-[#00F0FF]' : 'text-[#666]'}`}>
               {status === 'running' ? 'Autonomous Logic Active' : status === 'idle' ? 'System Ready' : status === 'uploading' ? 'Ingesting Material' : status === 'completed' ? 'Task Completed' : 'System Error'}
            </span>
          </div>
          <div className="h-8 w-[1px] bg-[#333]"></div>
          <button className="px-4 py-1.5 bg-[#E0E0E0] text-[#000] text-xs font-bold uppercase hover:bg-white transition-colors">
            Config
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: Source & Assets */}
        <aside className="w-64 border-r border-[#333] bg-[#0D0D0D] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#333] flex-1 overflow-y-auto custom-scrollbar">
            <div className="text-[10px] uppercase tracking-widest text-[#666] mb-4">Source Material</div>
            {library.length > 0 ? (
              <div className="space-y-3">
                {library.map((file, i) => (
                  <div key={i} className="p-2 bg-[#1A1A1A] border border-[#333] rounded group relative">
                    <div className="text-xs font-bold truncate pr-4">{file.originalName}</div>
                    <div className="flex justify-between mt-1 text-[10px] font-mono text-[#888]">
                      <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                      <span className="uppercase">{file.originalName.split('.').pop()}</span>
                    </div>
                    {(status === 'idle' || status === 'error') && (
                      <button onClick={(e) => removeFile(file.id, e)} className="absolute top-2 right-2 text-[#666] hover:text-[#F27D26] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
               <div className="text-xs font-mono text-[#666] italic border border-dashed border-[#333] p-4 rounded text-center">
                  Awaiting source<br/>audio payloads...
               </div>
            )}
          </div>
          <div className="p-4 shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-[#666] mb-4">Environment Status</div>
            <div className="space-y-2 font-mono text-[11px]">
              <div className="flex justify-between"><span>FFmpeg</span><span className="text-[#00F0FF]">READY</span></div>
              <div className="flex justify-between"><span>Python</span><span className="text-[#00F0FF]">READY</span></div>
              <div className="flex justify-between"><span>Files</span><span className="text-[#00F0FF]">{library.length} LOADED</span></div>
            </div>
          </div>
        </aside>

        {/* Center: Execution & Canvas */}
        <section className="flex-1 flex flex-col bg-[#050505] overflow-hidden">
          
          {status === 'idle' || status === 'error' ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center">
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-lg border border-dashed border-[#333] bg-[#111] p-16 text-center cursor-pointer hover:border-[#00F0FF]/50 transition-all duration-300 group rounded-sm"
              >
                <Upload className="w-10 h-10 text-[#555] group-hover:text-[#00F0FF] transition-colors mx-auto mb-6" />
                <h3 className="text-[14px] font-bold uppercase tracking-widest text-[#E0E0E0] mb-2">Drop Audio Files Here</h3>
                <p className="text-[#666] text-xs font-mono">MP3, WAV, FLAC. Or click to browse.</p>
                <input 
                  type="file" 
                  multiple 
                  accept="audio/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
              </div>

              {status === 'error' && (
                <div className="mt-8 border border-[#F27D26]/50 bg-[#F27D26]/10 text-[#F27D26] p-4 text-xs font-mono uppercase font-bold flex items-center rounded-sm">
                  <AlertCircle className="w-5 h-5 mr-3 shrink-0" />
                  <div>
                    <div>System Integrity Failure</div>
                    {errorMessage && <div className="text-[10px] mt-1 opacity-80 normal-case">{errorMessage}</div>}
                  </div>
                </div>
              )}

              <button
                onClick={startMedley}
                disabled={library.length < 2}
                className="mt-12 px-8 py-3 bg-[#E0E0E0] text-[#000] text-xs font-bold uppercase hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center group"
              >
                <Play className="w-4 h-4 mr-2 group-disabled:opacity-50" />
                Initialize Architecture
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="h-48 p-6 flex flex-col border-b border-[#333] bg-[#0A0A0A]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm uppercase tracking-tighter font-bold flex items-center">
                     {status === 'uploading' ? (
                       <><Loader2 className="w-4 h-4 mr-2 animate-spin text-[#F27D26]" /> INGESTING MATERIAL...</>
                     ) : status === 'running' ? (
                       <><Sparkles className="w-4 h-4 mr-2 text-[#00F0FF]" /> AUTONOMOUS CONSTRUCTION PHASE</>
                     ) : (
                       <><FileCheck2 className="w-4 h-4 mr-2 text-[#00F0FF]" /> TARGET ACHIEVED</>
                     )}
                  </h2>
                </div>
                
                {/* Visual Timeline (Static representation of process) */}
                <div className="flex-1 bg-[#111] rounded-sm border border-[#222] p-4 flex items-center relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none ${status === 'running' ? 'bg-[radial-gradient(circle_at_center,_#00F0FF_0%,_transparent_70%)]' : ''}`}></div>
                  <div className="w-full h-12 flex items-center gap-1 opacity-50">
                    <div className="h-full w-[25%] bg-[#333] rounded-sm"></div>
                    <div className="h-full w-[35%] bg-[#222] rounded-sm border-r-2 border-[#444]"></div>
                    <div className="h-full w-[40%] bg-[#1A1A1A] rounded-sm flex items-center justify-center text-[10px] font-mono text-[#666]">TIMELINE MAPPING</div>
                  </div>
                </div>
              </div>

              {/* Thought Stream / CLI */}
              <div className="flex-1 p-4 font-mono text-[12px] overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 mb-2 border-b border-[#333] pb-2 text-[#666] shrink-0">
                  <span className={`w-2 h-2 ${status === 'running' ? 'bg-[#F27D26] animate-pulse' : 'bg-[#333]'} rounded-full`}></span>
                  <span>LOGS / GEMINI THOUGHT STREAM</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pb-4 pr-4 text-[#888]">
                  {logs.length === 0 ? (
                      <div className="animate-pulse">Awaiting initialization...</div>
                  ) : (
                      logs.map((log, i) => {
                         let colorClass = 'text-[#888]';
                         if (log.includes('Uploading') || log.includes('Executing')) colorClass = 'text-[#00F0FF]';
                         if (log.includes('Error')) colorClass = 'text-[#F27D26]';
                         if (log.includes('Finished!')) colorClass = 'text-[#00F0FF] font-bold';

                         return (
                           <p key={i} className={colorClass}>
                             <span className="text-[#444] mr-2">[{new Date().toISOString().split('T')[1].slice(0,8)}]</span>
                             {log.replace(/\[.*?\]\s*/, '')}
                           </p>
                         );
                      })
                  )}
                  {status === 'running' && <p className="text-[#666] animate-pulse">_</p>}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar: Stats & Refinements */}
        <aside className="w-72 border-l border-[#333] bg-[#0D0D0D] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#333]">
            <div className="text-[10px] uppercase tracking-widest text-[#666] mb-4">Refinement Metrics</div>
            <div className="space-y-4 opacity-50">
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span>EMOTIONAL ARC</span>
                  <span className="text-[#00F0FF]">--%</span>
                </div>
                <div className="h-1 bg-[#222]"><div className="h-full bg-[#333] w-[0%]"></div></div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span>TRANSITION SMOOTHNESS</span>
                  <span className="text-[#00F0FF]">--%</span>
                </div>
                <div className="h-1 bg-[#222]"><div className="h-full bg-[#333] w-[0%]"></div></div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span>PERFORMER IDENTITY</span>
                  <span className="text-[#00F0FF]">--%</span>
                </div>
                <div className="h-1 bg-[#222]"><div className="h-full bg-[#333] w-[0%]"></div></div>
              </div>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="text-[10px] uppercase tracking-widest text-[#666] mb-4">Decision Summary</div>
            <div className="flex-1">
              {summary ? (
                <div className="text-xs leading-relaxed text-[#AAA] italic font-serif">
                  "{summary}"
                </div>
              ) : (
                <div className="text-xs text-[#444] font-mono italic">
                  Awaiting final synthesis...
                </div>
              )}
            </div>
            
            {status === 'completed' && sessionId && (
               <div className="mt-6 pt-6 border-t border-[#333]">
                 <a 
                   href={`/api/audio/${sessionId}`} 
                   download
                   className="block w-full text-center px-4 py-2 bg-[#00F0FF] text-black text-xs font-bold uppercase hover:bg-white transition-colors"
                 >
                   Export Output
                 </a>
               </div>
            )}
          </div>
        </aside>
      </main>

      {/* Footer Player */}
      <footer className="h-20 border-t border-[#333] bg-[#111] flex items-center px-4 md:px-8 gap-4 md:gap-10 shrink-0">
        {status === 'completed' && sessionId ? (
           <audio 
             controls 
             src={`/api/audio/${sessionId}`} 
             className="w-full max-w-5xl h-10" 
           />
        ) : (
           <>
             <div className="flex items-center gap-4 opacity-30 pointer-events-none">
               <div className="w-10 h-10 rounded-full border border-[#444] flex items-center justify-center">
                 <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-1"></div>
               </div>
               <div className="flex flex-col">
                 <div className="text-xs font-bold uppercase">No Active Output</div>
                 <div className="text-[10px] text-[#666] font-mono">--:-- / --:-- MP3</div>
               </div>
             </div>
             <div className="flex-1 h-2 bg-[#222] rounded-full relative opacity-30 pointer-events-none"></div>
           </>
        )}
        <div className="flex items-center gap-6 hidden md:flex opacity-30">
          <div className="text-[10px] font-mono text-[#888]">44100Hz / STEREO</div>
          <div className="w-10 h-1 bg-[#333] relative">
            <div className="absolute left-0 top-0 h-full w-3/4 bg-[#888]"></div>
          </div>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.2);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}} />
    </div>
  );
}
