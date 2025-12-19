
import React, { useMemo } from 'react';

interface ZulimCharacterProps {
  isSpeaking: boolean;
  audioVolume: number; // 0 to 1
}

const ZulimCharacter: React.FC<ZulimCharacterProps> = ({ isSpeaking, audioVolume }) => {
  // Mouth height based on audio volume
  const mouthHeight = useMemo(() => {
    if (!isSpeaking) return '4px';
    // Dynamic height from 4px to 40px
    return `${4 + (audioVolume * 45)}px`;
  }, [isSpeaking, audioVolume]);

  // Subtle eye movement
  const eyeScale = useMemo(() => {
    if (!isSpeaking) return 1;
    return 1 + (audioVolume * 0.1);
  }, [isSpeaking, audioVolume]);

  return (
    <div className="relative group perspective-1000">
      {/* Radiant glow that reacts to speech */}
      <div 
        className={`absolute inset-0 rounded-full transition-all duration-300 blur-[60px] -z-10 ${
          isSpeaking ? 'bg-amber-400/40 scale-150' : 'bg-amber-200/10 scale-100'
        }`} 
      />
      
      {/* The Emoji Figure (Zulim) */}
      <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center animate-float">
        
        {/* Face Base - Stylized Yellow Sphere */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 shadow-[inset_-10px_-10px_40px_rgba(0,0,0,0.2),0_20px_50px_rgba(0,0,0,0.1)] border-4 border-yellow-200/50">
          
          {/* Hair / Bow Area (Representing "Zulim" the girl) */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-1">
             <div className="w-16 h-16 bg-amber-900 rounded-full -rotate-12 translate-x-4 translate-y-2 shadow-lg" />
             <div className="w-16 h-16 bg-amber-900 rounded-full rotate-12 -translate-x-4 translate-y-2 shadow-lg" />
          </div>
          
          {/* The Bow */}
          <div className="absolute top-2 right-12 z-20">
            <div className="relative flex items-center justify-center scale-75 md:scale-100">
              <div className="w-8 h-8 bg-pink-400 rounded-md rotate-45 shadow-md" />
              <div className="absolute w-4 h-4 bg-pink-300 rounded-full shadow-inner" />
              <div className="w-8 h-8 bg-pink-400 rounded-md -rotate-45 shadow-md -ml-2" />
            </div>
          </div>

          {/* Eyes */}
          <div className="absolute top-1/3 left-0 right-0 flex justify-center gap-12 md:gap-16">
            {/* Left Eye */}
            <div className="relative w-10 h-10 md:w-12 md:h-12 bg-white rounded-full shadow-inner overflow-hidden flex items-center justify-center">
              <div 
                className="w-6 h-6 md:w-8 md:h-8 bg-amber-950 rounded-full transition-transform duration-100"
                style={{ transform: `scale(${eyeScale})` }}
              >
                 <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full opacity-80" />
              </div>
            </div>
            {/* Right Eye */}
            <div className="relative w-10 h-10 md:w-12 md:h-12 bg-white rounded-full shadow-inner overflow-hidden flex items-center justify-center">
              <div 
                className="w-6 h-6 md:w-8 md:h-8 bg-amber-950 rounded-full transition-transform duration-100"
                style={{ transform: `scale(${eyeScale})` }}
              >
                 <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full opacity-80" />
              </div>
            </div>
          </div>

          {/* Mouth (Lip Sync) */}
          <div className="absolute bottom-[22%] left-1/2 -translate-x-1/2 w-24 flex flex-col items-center">
             {/* Cheeks */}
             <div className="absolute -left-4 -top-2 w-8 h-6 bg-pink-400/20 blur-md rounded-full" />
             <div className="absolute -right-4 -top-2 w-8 h-6 bg-pink-400/20 blur-md rounded-full" />
             
             {/* Mouth Shape */}
             <div 
               className="bg-[#4a1c14] rounded-full transition-all duration-75 border-t-2 border-black/20"
               style={{ 
                 height: mouthHeight,
                 width: isSpeaking ? `${40 + (audioVolume * 20)}px` : '40px',
                 opacity: isSpeaking ? 0.9 : 0.6,
                 boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.5)'
               }}
             />
             
             {/* Subtle smile when not speaking */}
             {!isSpeaking && (
               <div className="w-10 h-2 border-b-4 border-amber-900/30 rounded-full -mt-1" />
             )}
          </div>
        </div>
      </div>

      {/* Status Badge - Only shown when explaining */}
      <div className={`absolute -bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 transition-all duration-300 ${isSpeaking ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
        <div className="px-8 py-3 bg-white/95 backdrop-blur-md rounded-[2rem] text-sm font-black text-amber-900 shadow-[0_15px_40px_rgba(0,0,0,0.1)] border border-amber-100 flex items-center gap-4 transition-all duration-300 hover:scale-105 active:scale-95">
          <div className="flex gap-1.5 items-end justify-center h-5 w-8">
            <div className="w-1.5 bg-amber-400 rounded-full transition-all duration-75" style={{ height: `${30 + audioVolume * 70}%` }} />
            <div className="w-1.5 bg-amber-500 rounded-full transition-all duration-75" style={{ height: `${50 + audioVolume * 50}%` }} />
            <div className="w-1.5 bg-amber-600 rounded-full transition-all duration-75" style={{ height: `${40 + audioVolume * 60}%` }} />
          </div>
          <span className="tracking-tight text-lg">
            Zulim está explicando...
          </span>
        </div>
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
      `}</style>
    </div>
  );
};

export default ZulimCharacter;
