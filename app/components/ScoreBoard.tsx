'use client';

import { useEffect, useState, useRef } from 'react';

interface ScoreBoardProps {
  score: number;
  combo?: number;
  isAnimating?: boolean;
}

const DURATION_MS = 3000;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function ScoreBoard({ score, combo = 0, isAnimating = false }: ScoreBoardProps) {
  const [displayScore, setDisplayScore] = useState(score);
  const prevScoreRef = useRef(score);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (score === prevScoreRef.current) {
      setDisplayScore(score);
      return;
    }
    const startScore = prevScoreRef.current;
    const diff = score - startScore;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION_MS, 1);
      const eased = easeOutExpo(progress);
      setDisplayScore(Math.floor(startScore + diff * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevScoreRef.current = score;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score]);

  return (
    <div className="text-center py-4">
      <div className="text-4xl md:text-5xl font-black text-yellow-400 font-mono tracking-wider">
        {displayScore.toLocaleString()}
      </div>
      <div className="text-sm text-gray-400 mt-1">BATTLE SCORE</div>
      {combo > 1 && (
        <div className={`text-sm mt-1 ${isAnimating ? 'text-red-400 animate-pulse' : 'text-gray-500'}`}>
          COMBO x{combo}
        </div>
      )}
    </div>
  );
}
