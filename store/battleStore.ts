import { create } from 'zustand';
import type { AttackType, BattleStatus, CurrentState, DebateLogEntry, HistoryEntry, JudgeResult } from '@/types/battle';

const PRO_THINKING_LINES = [
  '先抓住对方论证的薄弱环节，再回到题面。',
  '题目的关键在于价值取舍，我要把尺度摆清楚。',
  '要用更清晰的结构回应，避免被带偏。',
  '这一步必须讲清因果链，不能只停在观点上。',
];

const CON_THINKING_LINES = [
  '对方在偷换概念，我要先界定边界。',
  '我要把证据链拆开，再逐点回应。',
  '题目核心是标准之争，我要把标准说清。',
  '不能被情绪带走，保持冷静、抓逻辑。',
];

const LOW_HP_LINES = [
  '血量不多了，必须更精准地反击。',
  '形势紧张，得把关键点一击命中。',
];

function getLastOpponentSnippet(history: HistoryEntry[], side: 'pro' | 'con'): string {
  const opponent = side === 'pro' ? 'con' : 'pro';
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === opponent) {
      return history[i].content.replace(/\s+/g, ' ').trim().slice(0, 12);
    }
  }
  return '';
}

function pickThinkingLine(side: 'pro' | 'con', hp: number, topic: string, history: HistoryEntry[]): string {
  const base = side === 'pro' ? PRO_THINKING_LINES : CON_THINKING_LINES;
  const pool = hp < 250 ? [...base, ...LOW_HP_LINES] : base;
  const line = pool[Math.floor(Math.random() * pool.length)];
  const snippet = getLastOpponentSnippet(history, side);
  if (snippet) {
    return `对方说“${snippet}…”，${line}`;
  }
  return `回到题面「${topic}」，${line}`;
}

interface BattleState {
  proHP: number;
  conHP: number;
  totalScore: number;
  combo: number;
  round: number;
  status: BattleStatus;
  logs: DebateLogEntry[];
  options: string[];
  optionsLoading: boolean;
  isLoading: boolean;
  isScoring: boolean;
  isProcessing: boolean;
  error: string | null;
  revealSpeed: number;
  thinkingDelayMs: number;

  sendAttack: (topic: string, type: AttackType, userSide?: 'pro' | 'con') => Promise<void>;
  sendAttackStream: (
    topic: string,
    choiceText: string,
    userSide?: 'pro' | 'con',
    options?: { phase?: 'full' | 'kimi_only' | 'deepseek_only' }
  ) => Promise<void>;
  fetchOptions: (topic: string, side?: 'pro' | 'con') => Promise<void>;
  setRevealSpeed: (speed: number) => void;
  reset: () => void;
  clearError: () => void;
}

const initialState = {
  proHP: 1000,
  conHP: 1000,
  totalScore: 0,
  combo: 0,
  round: 1,
  status: 'ongoing' as BattleStatus,
  logs: [] as DebateLogEntry[],
  options: [] as string[],
  optionsLoading: false,
  isLoading: false,
  isScoring: false,
  isProcessing: false,
  error: null as string | null,
  revealSpeed: 1,
  thinkingDelayMs: 700,
};

export const useBattleStore = create<BattleState>((set, get) => ({
  ...initialState,

  sendAttack: async (topic: string, type: AttackType, userSide: 'pro' | 'con' = 'pro') => {
    if (get().isProcessing) return;
    const state = get();
    if (state.status !== 'ongoing' || state.proHP <= 0 || state.conHP <= 0) return;

    set({
      isProcessing: true,
      isLoading: true,
      error: null,
    });

    const currentState: CurrentState = {
      proHP: get().proHP,
      conHP: get().conHP,
      combo: get().combo,
      totalScore: get().totalScore,
    };

    const history: HistoryEntry[] = get().logs.map((log) => ({
      role: log.side,
      content: log.content,
    }));

    try {
      const response = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          round: get().round,
          userChoice: type,
          currentState,
          history,
          userSide,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        set({
          isProcessing: false,
          isLoading: false,
          error: data.error ?? '请求失败',
        });
        return;
      }

      set((s) => ({
        logs: [
          ...s.logs,
          {
            side: 'pro',
            content: data.kimi.content,
            damage: data.kimi.damage,
            isCritical: data.kimi.isCritical,
            isOffTopic: data.kimi.isOffTopic,
            commentary: data.kimi.commentary,
          },
        ],
        conHP: data.kimi.currentHP.con,
        totalScore: data.kimi.totalScore,
        combo: data.kimi.comboCount,
      }));

      if (data.winner === 'pro') {
        set({
          status: 'pro_win',
          isProcessing: false,
          isLoading: false,
        });
        return;
      }

      if (data.deepseek) {
        set((s) => ({
          logs: [
            ...s.logs,
            {
              side: 'con',
              content: data.deepseek.content,
              damage: data.deepseek.damage,
              isCritical: data.deepseek.isCritical,
              isOffTopic: data.deepseek.isOffTopic,
              commentary: data.deepseek.commentary,
            },
          ],
          proHP: data.deepseek.currentHP.pro,
          totalScore: data.deepseek.totalScore,
          combo: data.deepseek.comboCount,
          round: s.round + 1,
          status: data.deepseek.battleStatus,
        }));
      }

      set({ isProcessing: false, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络错误';
      set({
        isProcessing: false,
        isLoading: false,
        error: message,
      });
    }
  },

  fetchOptions: async (topic: string, side: 'pro' | 'con' = 'pro') => {
    const state = get();
    if (state.optionsLoading || state.isLoading || state.status !== 'ongoing') return;
    set({ optionsLoading: true, error: null });
    try {
      const history: HistoryEntry[] = get().logs.map((log) => ({ role: log.side, content: log.content }));
      const response = await fetch('/api/debate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, round: get().round, history, side }),
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.options)) {
        set({ options: data.options, optionsLoading: false });
      } else {
        set({ options: [], optionsLoading: false });
      }
    } catch {
      set({ options: [], optionsLoading: false });
    }
  },

  sendAttackStream: async (
    topic: string,
    choiceText: string,
    userSide: 'pro' | 'con' = 'pro',
    options?: { phase?: 'full' | 'kimi_only' | 'deepseek_only' }
  ) => {
    if (get().isProcessing) return;
    const state = get();
    if (state.status !== 'ongoing' || state.proHP <= 0 || state.conHP <= 0) return;

    set({ isProcessing: true, isLoading: true, error: null, options: [] });

    const currentState: CurrentState = {
      proHP: get().proHP,
      conHP: get().conHP,
      combo: get().combo,
      totalScore: get().totalScore,
    };
    const history: HistoryEntry[] = get().logs.map((log) => ({
      role: log.side,
      content: log.content,
    }));

    try {
      const thinkingDelayMs = get().thinkingDelayMs;
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const getRevealDelayMs = () => {
        const speed = Math.max(0.1, Math.min(3, get().revealSpeed));
        return Math.max(8, Math.round(30 / speed));
      };
      let kimiReady = false;
      let deepseekReady = false;
      const kimiBuffer: string[] = [];
      const deepseekBuffer: string[] = [];
      let kimiChain = Promise.resolve();
      let deepseekChain = Promise.resolve();

      const appendToLast = (side: 'pro' | 'con', chunk: string) => {
        set((s) => {
          const logs = [...s.logs];
          for (let i = logs.length - 1; i >= 0; i -= 1) {
            if (logs[i].side === side) {
              const prev = logs[i].content;
              const next = prev.startsWith('【思考】') && !prev.includes('\n') ? `${prev}\n${chunk}` : prev + chunk;
              logs[i] = { ...logs[i], content: next };
              break;
            }
          }
          return { logs };
        });
      };

      const scheduleAppend = (side: 'pro' | 'con', chunk: string) => {
        if (side === 'pro') {
          kimiChain = kimiChain.then(() => sleep(getRevealDelayMs())).then(() => appendToLast('pro', chunk));
        } else {
          deepseekChain = deepseekChain
            .then(() => sleep(getRevealDelayMs()))
            .then(() => appendToLast('con', chunk));
        }
      };

      const flushBuffer = (side: 'pro' | 'con') => {
        const buffer = side === 'pro' ? kimiBuffer : deepseekBuffer;
        while (buffer.length > 0) {
          scheduleAppend(side, buffer.shift() ?? '');
        }
      };

      const scheduleAppendImmediate = (side: 'pro' | 'con', chunk: string) => {
        scheduleAppend(side, chunk);
      };

      const response = await fetch('/api/debate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          round: get().round,
          userChoice: choiceText,
          currentState,
          history,
          userSide,
          phase: options?.phase ?? 'full',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        set({
          isProcessing: false,
          isLoading: false,
          error: data.error ?? '请求失败',
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        set({ isProcessing: false, isLoading: false, error: '无法读取流' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const dataLine = line.startsWith('data: ') ? line.slice(6) : null;
          if (!dataLine || dataLine === '[DONE]') continue;
          try {
            const data = JSON.parse(dataLine) as {
              type: string;
              content?: string;
              payload?: JudgeResult;
              error?: string;
              winner?: string;
            };

            if (data.type === 'kimi_start') {
              set((s) => ({
                logs: [...s.logs, { side: 'pro', content: '' }],
              }));
              kimiReady = true;
            } else if (data.type === 'kimi_token' && data.content) {
              scheduleAppendImmediate('pro', data.content);
            } else if (data.type === 'kimi_end') {
              // 等待 Kimi 的文字全部浮现完成
              await kimiChain;
            } else if (data.type === 'judge_kimi' && data.payload) {
              const p = data.payload;
              set((s) => {
                const logs = [...s.logs];
                const last = logs[logs.length - 1];
                if (last && last.side === 'pro') {
                  logs[logs.length - 1] = {
                    ...last,
                    damage: p.damage,
                    isCritical: p.isCritical,
                    isOffTopic: p.isOffTopic,
                    commentary: p.commentary,
                  };
                }
                return {
                  logs,
                  conHP: p.currentHP.con,
                  totalScore: p.totalScore,
                  combo: p.comboCount,
                };
              });
              if (p.battleStatus !== 'ongoing') {
                set({ status: 'pro_win', isProcessing: false, isLoading: false });
                return;
              }
            } else if (data.type === 'deepseek_start') {
              set((s) => ({
                logs: [...s.logs, { side: 'con', content: '' }],
              }));
              deepseekReady = true;
            } else if (data.type === 'deepseek_token' && data.content) {
              scheduleAppendImmediate('con', data.content);
            } else if (data.type === 'deepseek_end') {
              // 等待 DeepSeek 的文字全部浮现完成
              await deepseekChain;
            } else if (data.type === 'judge_deepseek' && data.payload) {
              const p = data.payload;
              set((s) => {
                const logs = [...s.logs];
                const last = logs[logs.length - 1];
                if (last && last.side === 'con') {
                  logs[logs.length - 1] = {
                    ...last,
                    damage: p.damage,
                    isCritical: p.isCritical,
                    isOffTopic: p.isOffTopic,
                    commentary: p.commentary,
                  };
                }
                return {
                  logs,
                  proHP: p.currentHP.pro,
                  totalScore: p.totalScore,
                  combo: p.comboCount,
                  round: s.round + 1,
                  status: p.battleStatus,
                };
              });
            } else if (data.type === 'done') {
              set({ isProcessing: false, isLoading: false });
            } else if (data.type === 'error') {
              set({
                isProcessing: false,
                isLoading: false,
                error: data.error ?? '流式请求出错',
              });
            }
          } catch (_) {
            // ignore parse errors for partial chunks
          }
        }
      }

      set({ isProcessing: false, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络错误';
      set({
        isProcessing: false,
        isLoading: false,
        error: message,
      });
    }
  },

  setRevealSpeed: (speed: number) => set({ revealSpeed: Math.max(0.1, Math.min(3, speed)) }),

  reset: () => set(initialState),

  clearError: () => set({ error: null }),
}));
