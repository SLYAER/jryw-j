/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Sparkles, Moon, Coffee } from 'lucide-react';

export default function App() {
  const [time, setTime] = useState('');
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [mode, setMode] = useState<'breathe' | 'idle'>('idle');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Relaxing ambient sound generator using Web Audio API (white/pink noise filtered into gentle rain)
  const toggleSound = () => {
    if (soundPlaying) {
      if (audioCtxRef.current) {
        audioCtxRef.current.suspend();
      }
      setSoundPlaying(false);
    } else {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;

        // Generate gentle rain-like brown noise buffer
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          lastOut = (lastOut + 0.02 * white) / 1.02;
          data[i] = lastOut * 3.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        gainNodeRef.current = gainNode;

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        noise.start(0);
      } else {
        audioCtxRef.current.resume();
      }
      setSoundPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-[#0d0f14] text-zinc-300 flex flex-col items-center justify-between p-6 select-none overflow-hidden font-sans">
      {/* Soft background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[140px]" />
      </div>

      {/* Top Bar */}
      <header className="w-full max-w-xl flex items-center justify-between z-10 pt-2">
        <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-widest">
          <Moon className="w-3.5 h-3.5 text-indigo-400" />
          <span>chill mode</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === 'idle' ? 'breathe' : 'idle')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 flex items-center gap-1.5 border ${
              mode === 'breathe'
                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-700/50'
                : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{mode === 'breathe' ? 'Breathe: On' : 'Box Breathe'}</span>
          </button>

          <button
            onClick={toggleSound}
            aria-label={soundPlaying ? 'Mute ambient sound' : 'Play ambient sound'}
            className="p-2 rounded-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {soundPlaying ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* Centerpiece */}
      <main className="z-10 flex flex-col items-center justify-center text-center my-auto px-4">
        {mode === 'breathe' ? (
          <div className="flex flex-col items-center">
            <div className="relative flex items-center justify-center w-56 h-56">
              <div className="absolute inset-0 rounded-full bg-indigo-500/15 animate-ping opacity-25" />
              <div
                className="w-40 h-40 rounded-full border border-indigo-500/30 bg-gradient-to-tr from-indigo-950/50 to-purple-950/30 backdrop-blur-md flex items-center justify-center shadow-2xl transition-all duration-1000 animate-pulse"
              >
                <span className="text-sm font-light tracking-widest text-indigo-200 uppercase">
                  Breathe
                </span>
              </div>
            </div>
            <p className="mt-8 text-xs text-zinc-500 tracking-wider">
              Inhale slow • Hold • Exhale • Relax
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="text-5xl md:text-6xl font-extralight tracking-tight text-zinc-200 mb-3 font-mono">
              {time || '--:--:--'}
            </div>
            <p className="text-zinc-400 text-base font-light tracking-wide flex items-center gap-2">
              <Coffee className="w-4 h-4 text-amber-400/80" />
              Just chilling. No rush, no worries.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="z-10 text-center pb-2 text-[11px] text-zinc-600 tracking-wider">
        peaceful vibes only
      </footer>
    </div>
  );
}
