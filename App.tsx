
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Message, ConnectionStatus } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audioUtils';
import ZulimCharacter from './components/ZulimCharacter';

const SYSTEM_INSTRUCTION = "Você é a Zulim, do aplicativo 'Zulim sabe-tudo'. Agora você é representada por um emoji animado e expressivo. Você continua sendo uma pequena gênio em ciência, história e geopolítica. Responda sempre em Português do Brasil com entusiasmo e clareza. Mantenha as respostas curtas (máximo 3 frases) para que a conversa seja dinâmica. Fale diretamente com o usuário de forma amigável, como uma criança prodígio que adora compartilhar conhecimento.";

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentOutputTranscriptionRef = useRef('');

  const initializeAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      analyserRef.current = outputAudioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 64; 
      analyserRef.current.smoothingTimeConstant = 0.5;
      analyserRef.current.connect(outputAudioContextRef.current.destination);
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    if (outputAudioContextRef.current.state === 'suspended') {
      await outputAudioContextRef.current.resume();
    }
  }, []);

  const updateLipSync = useCallback(() => {
    if (!analyserRef.current || !isSpeaking) {
      setAudioVolume(0);
      return;
    }
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    // Normalize and scale for visibility (0 to 1 range)
    setAudioVolume(Math.min(1, average / 100)); 
    requestAnimationFrame(updateLipSync);
  }, [isSpeaking]);

  useEffect(() => {
    if (isSpeaking) {
      updateLipSync();
    }
  }, [isSpeaking, updateLipSync]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const connectToZulim = async (forceNoMic: boolean = false) => {
    try {
      setErrorMessage(null);
      
      // Check for API Key selection
      if (typeof window !== 'undefined' && (window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await (window as any).aistudio.openSelectKey();
        }
      }

      setStatus(ConnectionStatus.CONNECTING);
      await initializeAudio();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      let stream: MediaStream | null = null;
      let micAvailable = false;

      if (!forceNoMic) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micAvailable = true;
          setIsMicEnabled(true);
        } catch (micErr: any) {
          console.warn('Microphone access denied, proceeding in text-only mode:', micErr);
          setIsMicEnabled(false);
          // If the user didn't explicitly ask for "no mic", we show an error message but offer a "Continue" button
          if (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError' || micErr.message?.includes('denied')) {
             setStatus(ConnectionStatus.ERROR);
             setErrorMessage("Acesso ao microfone negado pelo sistema. Você pode continuar apenas por texto.");
             return;
          }
        }
      } else {
        setIsMicEnabled(false);
      }
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, 
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            if (stream && audioContextRef.current) {
              const source = audioContextRef.current.createMediaStreamSource(stream);
              const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
              
              scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };
              
              source.connect(scriptProcessor);
              scriptProcessor.connect(audioContextRef.current.destination);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              setIsSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(analyserRef.current!);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsSpeaking(false);
                }
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.outputTranscription) {
              currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const fullText = currentOutputTranscriptionRef.current;
              if (fullText) {
                setMessages(prev => [...prev, { role: 'zulim', text: fullText }]);
              }
              currentOutputTranscriptionRef.current = '';
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (e: any) => {
            console.error('Gemini error:', e);
            if (e?.message?.includes('Requested entity was not found')) {
              (window as any).aistudio?.openSelectKey();
            }
            setStatus(ConnectionStatus.ERROR);
            setErrorMessage("Erro na conexão com a Zulim. Verifique sua internet.");
          },
          onclose: () => {
            setStatus(ConnectionStatus.DISCONNECTED);
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error('Connection failed:', err);
      setStatus(ConnectionStatus.ERROR);
      setErrorMessage(err.message || "Falha na conexão.");
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !sessionRef.current) return;

    const userMsg = inputText.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInputText('');

    sessionRef.current.sendRealtimeInput({
      text: userMsg
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col min-h-screen">
      <header className="text-center mb-16 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 bg-amber-200/20 blur-[100px] -z-10" />
        <h1 className="text-5xl md:text-6xl font-black text-amber-950 mb-3 tracking-tighter drop-shadow-sm">
          Zulim <span className="text-amber-500">sabe-tudo</span>
        </h1>
        <p className="text-amber-800/60 text-xl font-medium max-w-lg mx-auto leading-relaxed">
          Sua pequena gênia agora em versão emoji! Pronto para aprender hoje?
        </p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center space-y-20">
        <ZulimCharacter isSpeaking={isSpeaking} audioVolume={audioVolume} />

        <div className="w-full max-w-2xl bg-white/70 backdrop-blur-2xl p-8 md:p-10 rounded-[3rem] border border-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.05)] flex flex-col gap-8">
          {status === ConnectionStatus.DISCONNECTED && (
            <div className="space-y-8 py-4">
              <div className="text-center space-y-4">
                <div className="inline-flex p-4 bg-amber-100 rounded-3xl text-amber-600 mb-2">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.989-2.386l-.548-.547z" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-amber-950">Vamos começar?</h2>
                <p className="text-amber-800/70 font-medium px-4">
                  Zulim está pronta para conversar. Clique abaixo para ativar o modo voz ou use apenas texto.
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => connectToZulim(false)}
                  className="group w-full py-6 bg-amber-500 hover:bg-amber-600 text-white rounded-[2rem] font-black text-xl transition-all shadow-2xl shadow-amber-200 flex items-center justify-center gap-4 active:scale-[0.96]"
                >
                  <svg className="w-7 h-7 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  FALAR POR VOZ
                </button>
                <button 
                  onClick={() => connectToZulim(true)}
                  className="w-full py-4 bg-white hover:bg-amber-50 text-amber-900 border-2 border-amber-100 rounded-[2rem] font-bold text-lg transition-all active:scale-[0.96]"
                >
                  USAR APENAS TEXTO
                </button>
              </div>
            </div>
          )}

          {status === ConnectionStatus.CONNECTING && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="relative">
                <div className="w-20 h-20 border-8 border-amber-100 rounded-full" />
                <div className="absolute top-0 left-0 w-20 h-20 border-8 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-amber-900 font-black text-xl animate-pulse">Ativando a Zulim...</p>
            </div>
          )}

          {status === ConnectionStatus.ERROR && (
            <div className="bg-red-50 p-8 rounded-[2.5rem] border border-red-100 text-center space-y-6">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <p className="text-red-900 font-bold text-lg leading-snug">
                {errorMessage || "Algo deu errado!"}
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => connectToZulim(true)} 
                  className="px-10 py-4 bg-amber-500 text-white rounded-2xl font-black hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 active:scale-95"
                >
                  Continuar apenas por Texto
                </button>
                <button 
                  onClick={() => window.location.reload()} 
                  className="text-red-600 font-bold hover:underline"
                >
                  Tentar Reiniciar
                </button>
              </div>
            </div>
          )}

          {status === ConnectionStatus.CONNECTED && (
            <div className="space-y-6 flex flex-col">
              <div 
                ref={scrollRef}
                className="h-64 overflow-y-auto space-y-6 px-2 custom-scrollbar scroll-smooth"
              >
                {!isMicEnabled && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3 text-amber-800 text-xs font-bold">
                    <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    Microfone desativado. Zulim ouvirá apenas seu texto, mas ela continuará falando!
                  </div>
                )}
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-amber-800/30 text-center px-8">
                    <p className="font-bold text-lg leading-relaxed italic">
                      "Pode falar comigo sobre o Sistema Solar, as Guerras Mundiais ou o que quiser saber!"
                    </p>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] px-6 py-4 rounded-[1.8rem] text-[15px] leading-relaxed font-bold shadow-sm border ${
                        m.role === 'user' 
                          ? 'bg-amber-100 text-amber-950 border-amber-200 rounded-tr-none' 
                          : 'bg-white text-amber-900 border-amber-50 rounded-tl-none'
                      }`}>
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendText} className="relative group pt-4 border-t border-amber-100">
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={isMicEnabled ? "Zulim está ouvindo... ou digite aqui" : "Digite sua pergunta aqui..."}
                  className="w-full bg-amber-50/50 border-2 border-transparent rounded-[2rem] pl-6 pr-16 py-5 text-amber-950 placeholder-amber-900/40 focus:outline-none focus:bg-white focus:border-amber-400 focus:ring-8 focus:ring-amber-400/5 shadow-inner transition-all font-bold"
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim()}
                  className="absolute right-3 top-7 aspect-square h-10 bg-amber-500 hover:bg-amber-600 disabled:opacity-30 disabled:grayscale text-white rounded-2xl transition-all shadow-lg active:scale-90 flex items-center justify-center"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-20 py-8 text-center border-t border-amber-900/5">
        <p className="text-amber-900/20 text-xs font-black uppercase tracking-[0.3em]">
          Zulim Sabe-Tudo &bull; {new Date().getFullYear()}
        </p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #f59e0b40;
          border-radius: 10px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background: #f59e0b;
        }
      `}</style>
    </div>
  );
};

export default App;
