'use client';

import { useEffect, useRef, useState } from 'react';
import type { BattleStatus } from '@/types/battle';
import { useBattleStore } from '@/store/battleStore';

interface VictoryModalProps {
  winner: BattleStatus;
  finalScore: number;
  onReset: () => void;
}

const DURATION_MS = 2200;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function VictoryModal({ winner, finalScore, onReset }: VictoryModalProps) {
  const reset = useBattleStore((s) => s.reset);
  const [displayScore, setDisplayScore] = useState(0);
  const rafRef = useRef<number>(0);

  const handleAgain = () => {
    reset();
    onReset();
  };

  const isProWin = winner === 'pro_win';
  const title = isProWin ? 'Kimi 胜' : 'DeepSeek 胜';
  const sub = isProWin ? '恭喜，你赢得了这场思辨对决！' : '再接再厉，下次一定！';

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / DURATION_MS, 1);
      const eased = easeOutExpo(progress);
      setDisplayScore(Math.floor(finalScore * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [finalScore]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-xl border border-slate-600">
        <h2 className="text-2xl font-bold text-yellow-400 mb-2">{title}</h2>
        <p className="text-gray-300 mb-4">{sub}</p>
        <div className="rounded-2xl bg-black/40 border border-yellow-400/40 px-6 py-4 mb-6 shadow-[0_0_25px_rgba(255,190,40,0.45)]">
          <div className="text-xs uppercase tracking-widest text-yellow-200/80 mb-1">Final Score</div>
          <div className="text-4xl md:text-5xl font-black text-yellow-300 font-mono drop-shadow-[0_0_18px_rgba(255,200,40,0.85)]">
            {displayScore.toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAgain}
          className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
        >
          再来一局
        </button>
      </div>
    </div>
  );
}
