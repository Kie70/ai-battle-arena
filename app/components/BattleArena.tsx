'use client';

import { useEffect, useRef } from 'react';
import type { UserSide } from '@/app/page';
import { useBattleStore } from '@/store/battleStore';
import { HPBar } from './HPBar';
import { ScoreBoard } from './ScoreBoard';
import { AttackButtons } from './AttackButtons';
import { DialogueBox } from './DialogueBox';
import { VictoryModal } from './VictoryModal';

function playSound(filename: string) {
  try {
    const audio = new Audio(filename);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {
    // ignore if file missing or autoplay blocked
  }
}

interface BattleArenaProps {
  topic: string;
  userSide: UserSide;
  onBackToTopic?: () => void;
}

export default function BattleArena({ topic, userSide, onBackToTopic }: BattleArenaProps) {
  const {
    proHP,
    conHP,
    totalScore,
    combo,
    round,
    status,
    logs,
    options,
    optionsLoading,
    isLoading,
    isProcessing,
    error,
    sendAttackStream,
    fetchOptions,
    clearError,
    revealSpeed,
    setRevealSpeed,
  } = useBattleStore();

  const playedForIndexRef = useRef(0);
  const openingTriggeredRef = useRef<number | null>(null);
  useEffect(() => {
    for (let i = playedForIndexRef.current; i < logs.length; i++) {
      if (logs[i].damage !== undefined) {
        if (logs[i].isCritical || logs[i].isOffTopic) {
          playSound(logs[i].isCritical ? '/audio/applause.mp3' : '/audio/confusion.mp3');
        }
        playedForIndexRef.current = i + 1;
        break;
      }
    }
  }, [logs, userSide]);

  useEffect(() => {
    openingTriggeredRef.current = null;
  }, [topic, userSide]);

  const showVictory = status === 'pro_win' || status === 'con_win';
  const lastSide = logs.length > 0 ? logs[logs.length - 1].side : null;
  const isUserTurn =
    status === 'ongoing' &&
    !isLoading &&
    !isProcessing &&
    proHP > 0 &&
    conHP > 0 &&
    (userSide === 'pro' ? lastSide !== 'pro' : lastSide === 'pro');

  useEffect(() => {
    if (isUserTurn && options.length === 0 && !optionsLoading) {
      fetchOptions(topic, userSide);
    }
  }, [isUserTurn, options.length, optionsLoading, topic, fetchOptions, userSide]);

  useEffect(() => {
    if (userSide !== 'con') return;
    if (status !== 'ongoing') return;
    if (lastSide !== 'pro') return;
    if (options.length > 0 || optionsLoading) return;
    if (isLoading || isProcessing) return;
    fetchOptions(topic, userSide);
  }, [userSide, status, lastSide, options.length, optionsLoading, isLoading, isProcessing, topic, fetchOptions]);

  useEffect(() => {
    if (userSide !== 'con') return;
    if (status !== 'ongoing' || isLoading || isProcessing) return;
    if (lastSide === 'pro') return;
    if (openingTriggeredRef.current === round) return;
    openingTriggeredRef.current = round;
    sendAttackStream(topic, '__AUTO_OPENING__', userSide, { phase: 'kimi_only' });
  }, [userSide, status, isLoading, isProcessing, lastSide, round, topic, sendAttackStream]);

  const kimiLabel = userSide === 'pro' ? 'Kimi（支持） (你)' : 'Kimi（支持）';
  const deepseekLabel = userSide === 'con' ? 'DeepSeek（反对） (你)' : 'DeepSeek（反对）';

  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const kimiTypeSoundRef = useRef<HTMLAudioElement | null>(null);
  const dsTypeSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // 播放背景音乐
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio('/audio/bgm.mp3');
      bgMusicRef.current.loop = true;
      bgMusicRef.current.volume = 0.3;
    }

    // 初始化打字音效
    if (!kimiTypeSoundRef.current) {
      kimiTypeSoundRef.current = new Audio('/audio/kimi_type.mp3');
      kimiTypeSoundRef.current.loop = true;
      kimiTypeSoundRef.current.volume = 0.4;
    }
    if (!dsTypeSoundRef.current) {
      dsTypeSoundRef.current = new Audio('/audio/ds_type.mp3');
      dsTypeSoundRef.current.loop = true;
      dsTypeSoundRef.current.volume = 0.4;
    }
    
    const playBgm = () => {
      bgMusicRef.current?.play().catch(() => {});
    };

    window.addEventListener('click', playBgm, { once: true });
    return () => {
      window.removeEventListener('click', playBgm);
      bgMusicRef.current?.pause();
      kimiTypeSoundRef.current?.pause();
      dsTypeSoundRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    // 监听新 token 产生音效
    if (logs.length > 0) {
      const lastLog = logs[logs.length - 1];
      // 如果正在流式输出（没有 damage）
      if (lastLog.damage === undefined) {
        if (lastLog.side === 'pro') {
          kimiTypeSoundRef.current?.play().catch(() => {});
          dsTypeSoundRef.current?.pause();
        } else {
          dsTypeSoundRef.current?.play().catch(() => {});
          kimiTypeSoundRef.current?.pause();
        }
      } else {
        // 输出完成，停止音效
        kimiTypeSoundRef.current?.pause();
        dsTypeSoundRef.current?.pause();
      }
    } else {
      kimiTypeSoundRef.current?.pause();
      dsTypeSoundRef.current?.pause();
    }
  }, [logs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isUserScrollingRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [logs, isLoading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
    isUserScrollingRef.current = !isAtBottom;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-purple-900 text-white p-4">
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
        <h1 className="text-center text-xl font-bold mb-2 text-gray-200">思辨竞技场</h1>
        <p className="text-center text-sm text-gray-400 mb-4">辩题：{topic}</p>

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          <HPBar name={kimiLabel} hp={proHP} max={1000} color="blue" />
          <div className="text-2xl font-bold text-yellow-400">VS</div>
          <HPBar name={deepseekLabel} hp={conHP} max={1000} color="red" />
        </div>

        <ScoreBoard score={totalScore} combo={combo} isAnimating={false} />
        
        <div 
          className="flex-1 min-h-[300px] flex flex-col mt-4 bg-black/20 rounded-xl border border-white/5 overflow-hidden"
          style={{ height: '500px', resize: 'vertical' }}
        >
          <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
            <div className="text-sm text-gray-400">回合 {round} · 战斗记录</div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>浮现速度</span>
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.1}
                value={revealSpeed}
                onChange={(e) => setRevealSpeed(parseFloat(e.target.value))}
                className="w-24 accent-yellow-400"
              />
              <span className="text-yellow-300 font-medium w-8">{revealSpeed.toFixed(1)}x</span>
            </div>
          </div>

          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 space-y-6"
          >
            {logs.length === 0 && !isLoading && (
              <p className="text-gray-500 text-center py-8">选择下方回复方向开始辩论</p>
            )}
            {logs.map((log, i) => (
              <DialogueBox key={i} {...log} userSide={userSide} />
            ))}
            {isLoading && (
              <p className="text-center text-gray-400 py-4 animate-pulse">Kimi 与 DeepSeek 正在交锋...</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="text-sm underline opacity-80 hover:opacity-100"
              >
                关闭
              </button>
            </div>
          )}

          {isUserTurn && (
            <AttackButtons
              options={options}
              optionsLoading={optionsLoading}
              onAttack={(choice) =>
                sendAttackStream(topic, choice, userSide, {
                  phase: userSide === 'con' ? 'deepseek_only' : 'full',
                })}
              disabled={isLoading || proHP <= 0 || conHP <= 0}
            />
          )}
        </div>

        {showVictory && (
          <VictoryModal winner={status} finalScore={totalScore} onReset={onBackToTopic ?? (() => {})} />
        )}
      </div>
    </div>
  );
}
