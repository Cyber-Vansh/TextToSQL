"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, Server, Globe, Zap } from "lucide-react";

interface HealthResponse {
  status: string;
  service: string;
  aiService?: string;
}

export default function ServiceAwakener({ onReady }: { onReady: () => void }) {
  const [backendStatus, setBackendStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [aiStatus, setAiStatus] = useState<'pending' | 'ok' | 'error'>('pending');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        if (!res.ok) throw new Error("Backend not ready");
        
        const data: HealthResponse = await res.json();
        
        if (data.status === 'ok') {
          setBackendStatus('ok');
          
          if (data.aiService === 'ok') {
            setAiStatus('ok');
            setTimeout(() => {
              onReady();
            }, 800); 
          } else {
            setAiStatus('error');
          }
        }
      } catch {
        setBackendStatus('error');
        setAiStatus('pending');
      }
    };

    const interval = setInterval(() => {
      if (backendStatus === 'ok' && aiStatus === 'ok') {
        clearInterval(interval);
        return;
      }
      checkHealth();
    }, 3000);

    checkHealth();

    return () => clearInterval(interval);
  }, [API_URL, backendStatus, aiStatus, onReady]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-white selection:bg-indigo-500/30">
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md p-8 bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800">
        
        <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Initializing AI Services
            </h1>
            <p className="text-zinc-400 text-center mt-2 text-sm leading-relaxed">
            Establishing secure connection to the Neural Engine.<br/>
            This may take a moment...
            </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-zinc-950/50 border border-zinc-800 rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${backendStatus === 'ok' ? 'bg-emerald-500/10' : 'bg-zinc-800'}`}>
                <Server className={`w-4 h-4 ${backendStatus === 'ok' ? 'text-emerald-400' : 'text-zinc-400'}`} />
              </div>
              <span className="font-medium text-zinc-200">Backend API</span>
            </div>
            {backendStatus === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-950/50 border border-zinc-800 rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${aiStatus === 'ok' ? 'bg-emerald-500/10' : 'bg-zinc-800'}`}>
                <Globe className={`w-4 h-4 ${aiStatus === 'ok' ? 'text-emerald-400' : 'text-zinc-400'}`} />
              </div>
              <span className="font-medium text-zinc-200">AI Neural Engine</span>
            </div>
            {aiStatus === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <div className="flex items-center gap-3">
                {backendStatus === 'ok' && <span className="text-xs text-zinc-500 font-medium">~30s</span>}
                <Loader2 className={`w-5 h-5 animate-spin ${backendStatus === 'ok' ? 'text-indigo-400' : 'text-zinc-600'}`} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
