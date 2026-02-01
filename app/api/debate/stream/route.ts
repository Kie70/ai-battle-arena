import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import {
  JUDGE_SYSTEM_PROMPT,
  KIMI_SYSTEM_PROMPT,
  KIMI_SYSTEM_PROMPT_BY_CHOICE,
  DEEPSEEK_SYSTEM_PROMPT,
  DEEPSEEK_SYSTEM_PROMPT_BY_CHOICE,
} from '@/config/prompts';
import type {
  AttackType,
  HistoryEntry,
  CurrentState,
  JudgeResult,
} from '@/types/battle';

// 当前统一使用 Kimi (Moonshot) 完成所有调用
function getApiClient() {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) throw new Error('MOONSHOT_API_KEY is not set');
  return new OpenAI({ apiKey: key, baseURL: 'https://api.moonshot.cn/v1' });
}

const MAX_HISTORY = 6;

function trimHistory(history: HistoryEntry[]): HistoryEntry[] {
  if (history.length <= MAX_HISTORY) return history;
  return history.slice(-MAX_HISTORY);
}

function getLastSideContent(history: HistoryEntry[], side: 'pro' | 'con'): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === side) return history[i].content;
  }
  return '';
}

function cleanThinking(content: string): string {
  // 移除所有括号内的内容，这些是思考部分
  return content.replace(/\([^)]*\)/g, '').trim();
}

function extractThinking(content: string): string {
  const match = content.match(/\(([^)]*)\)/);
  return match ? match[1] : '';
}

function summarizeContent(content: string): string {
  const cleaned = cleanThinking(content);
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 60) + '…';
}

function formatHistoryForKimi(history: HistoryEntry[], opponentLastWords: string): string {
  if (history.length === 0 && !opponentLastWords) {
    return '这是第一回合，请先发表正方观点。';
  }
  const lines = history.map((h) => `${h.role === 'pro' ? '【我方】' : '【对方】'} ${cleanThinking(h.content)}`);
  let text = lines.join('\n\n');
  if (opponentLastWords) {
    const summary = summarizeContent(opponentLastWords);
    text += `\n\n对方观点总结：${summary}\n请发表你的观点`;
  } else {
    text += '\n请发表你的观点';
  }
  return text;
}

function formatHistoryForDeepSeek(history: HistoryEntry[], kimiLastWords: string): string {
  const summary = summarizeContent(kimiLastWords);
  if (history.length === 0) {
    return `对方观点总结：${summary}\n请反击`;
  }
  const lines = history.map((h) => `${h.role === 'pro' ? '【对方】' : '【我方】'} ${cleanThinking(h.content)}`);
  return lines.join('\n\n') + `\n\n对方观点总结：${summary}\n请反击`;
}

function determineCounterStyle(userChoice: AttackType): AttackType {
  if (userChoice === 'A') return 'B';
  if (userChoice === 'B') return 'C';
  return 'A';
}

function parseJudgeResponse(raw: string): JudgeResult {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const parsed = JSON.parse(cleaned) as JudgeResult;
  if (typeof parsed.isOffTopic !== 'boolean') parsed.isOffTopic = false;
  if (typeof parsed.commentary !== 'string') parsed.commentary = '';
  return parsed;
}

const DAMAGE_MIN = 100;
const DAMAGE_MAX = 200;
const CRIT_BONUS_PRO = [
  '更关键的是，这恰恰暴露了对方论证的缺口。',
  '因此，我方立场在此处更具解释力。',
];
const CRIT_BONUS_CON = [
  '这正好说明对方的结论缺乏稳固基础。',
  '归根结底，对方的前提并不成立。',
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function computeDamage(isCritical: boolean, isOffTopic: boolean): number {
  let damage = randomInt(DAMAGE_MIN, DAMAGE_MAX);
  if (isCritical) damage *= 2;
  if (isOffTopic) damage = Math.round(damage * 0.5);
  return damage;
}

function computeScoreDelta(damage: number): number {
  const mult = 0.3 + Math.random() * (2 - 0.3);
  const base = damage * 1000 * mult;
  const bonus = 1 + Math.random() * 999;
  return Math.max(1, Math.round(base + bonus));
}

function applyDamage(attacker: 'pro' | 'con', currentState: CurrentState, damage: number) {
  if (attacker === 'pro') {
    return {
      pro: currentState.proHP,
      con: Math.max(0, currentState.conHP - damage),
    };
  }
  return {
    pro: Math.max(0, currentState.proHP - damage),
    con: currentState.conHP,
  };
}

function appendCriticalBonus(content: string, side: 'pro' | 'con'): string {
  const pool = side === 'pro' ? CRIT_BONUS_PRO : CRIT_BONUS_CON;
  const bonus = pool[Math.floor(Math.random() * pool.length)];
  return `${content} ${bonus}`;
}

async function callJudge(
  topic: string,
  round: number,
  attacker: 'pro' | 'con',
  type: AttackType | string,
  content: string,
  currentState: CurrentState,
  prevTotalScore: number
): Promise<JudgeResult> {
  const userContent = JSON.stringify({
    topic,
    round,
    attacker,
    content,
  });

  const client = getApiClient();
  const response = await client.chat.completions.create({
    model: 'moonshot-v1-8k',
    messages: [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 150,
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  try {
    const result = parseJudgeResponse(raw);
    const avgScore = ((result.logicScore ?? 70) + (result.rhetoricScore ?? 70) + (result.counterScore ?? 70)) / 3;
    const critProb = Math.max(0, (avgScore - 85) * 0.05);
    const isCritical = Math.random() < critProb;
    const damage = computeDamage(isCritical, !!result.isOffTopic);
    const nextHP = applyDamage(attacker, currentState, damage);
    const totalScore = prevTotalScore + computeScoreDelta(damage);
    result.damage = damage;
    result.isCritical = isCritical;
    result.currentHP = { pro: nextHP.pro, con: nextHP.con };
    result.totalScore = totalScore;
    result.comboCount = currentState.combo + 1;
    result.battleStatus = nextHP.pro <= 0 ? 'con_win' : nextHP.con <= 0 ? 'pro_win' : 'ongoing';
    return result;
  } catch {
    const damage = computeDamage(false, false);
    const nextHP = applyDamage(attacker, currentState, damage);
    const totalScore = prevTotalScore + computeScoreDelta(damage);
    return {
      damage,
      isCritical: false,
      isOffTopic: false,
      logicScore: 70,
      rhetoricScore: 70,
      counterScore: 70,
      currentHP: { pro: nextHP.pro, con: nextHP.con },
      totalScore,
      comboCount: currentState.combo + 1,
      battleStatus: nextHP.pro <= 0 ? 'con_win' : nextHP.con <= 0 ? 'pro_win' : 'ongoing',
      commentary: '判定解析备用',
    };
  }
}

function sendSSE(controller: ReadableStreamDefaultController<Uint8Array>, data: object) {
  controller.enqueue(
    new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
  );
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  try {
    const body = await req.json();
    const {
      topic,
      round,
      userChoice,
      currentState,
      history,
      userSide = 'pro',
      phase = 'full',
    }: {
      topic: string;
      round: number;
      userChoice: AttackType | string;
      currentState: CurrentState;
      history: HistoryEntry[];
      userSide?: 'pro' | 'con';
      phase?: 'full' | 'kimi_only' | 'deepseek_only';
    } = body;

    if (!topic || !userChoice || !currentState) {
      return Response.json(
        { error: 'Missing topic, userChoice or currentState', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const isLegacyChoice = userChoice === 'A' || userChoice === 'B' || userChoice === 'C';
    const trimmedHistory = trimHistory(history ?? []);
    const kimiStyle: AttackType = userSide === 'con' ? 'B' : (isLegacyChoice ? (userChoice as AttackType) : 'B');
    const useKimiChoicePrompt = userSide !== 'con' && phase !== 'kimi_only' && !isLegacyChoice;
    const kimiSystemContent = useKimiChoicePrompt
      ? KIMI_SYSTEM_PROMPT_BY_CHOICE(topic, String(userChoice), currentState.proHP, round)
      : KIMI_SYSTEM_PROMPT(topic, kimiStyle, currentState.proHP, round);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (phase !== 'deepseek_only') {
            const kimi = getApiClient();
            const opponentLastWords = getLastSideContent(trimmedHistory, 'con');
            const kimiUserContent = formatHistoryForKimi(trimmedHistory, opponentLastWords);

            sendSSE(controller, { type: 'kimi_start' });

            const kimiStream = await kimi.chat.completions.create({
              model: 'moonshot-v1-8k',
              messages: [
                { role: 'system', content: kimiSystemContent },
                { role: 'user', content: kimiUserContent },
              ],
              stream: true,
              max_tokens: 600,
            });

            let kimiContent = '';
            for await (const chunk of kimiStream) {
              const piece = chunk.choices[0]?.delta?.content ?? '';
              if (piece) {
                kimiContent += piece;
                sendSSE(controller, { type: 'kimi_token', content: piece });
              }
            }

            sendSSE(controller, { type: 'kimi_end' });

            const prevTotalScore1 = currentState.totalScore ?? 0;
            const judgeType1 = isLegacyChoice ? kimiStyle : (phase === 'kimi_only' ? kimiStyle : String(userChoice));
            const judgeResult1 = await callJudge(
              topic,
              round,
              'pro',
              judgeType1,
              kimiContent.trim() || '（正方暂无发言）',
              currentState,
              prevTotalScore1
            );

            if (judgeResult1.isCritical) {
              const bonus = appendCriticalBonus('', 'pro').trim();
              kimiContent = `${kimiContent.trim()} ${bonus}`.trim();
              sendSSE(controller, { type: 'kimi_token', content: ` ${bonus}` });
            }

            sendSSE(controller, { type: 'judge_kimi', payload: judgeResult1 });

            if (judgeResult1.battleStatus !== 'ongoing') {
              sendSSE(controller, { type: 'done', winner: 'pro' });
              controller.close();
              return;
            }

            if (phase === 'kimi_only') {
              sendSSE(controller, { type: 'done' });
              controller.close();
              return;
            }

            const dsStyle: AttackType = userSide === 'con'
              ? (isLegacyChoice ? (userChoice as AttackType) : 'B')
              : (isLegacyChoice ? determineCounterStyle(userChoice as AttackType) : 'B');
            const dsSystemContent = isLegacyChoice
              ? DEEPSEEK_SYSTEM_PROMPT(topic, dsStyle, judgeResult1.currentHP.con, round)
              : DEEPSEEK_SYSTEM_PROMPT_BY_CHOICE(topic, String(userChoice), judgeResult1.currentHP.con, round);
            const deepseek = getApiClient();
            const historyWithKimi: HistoryEntry[] = [
              ...trimmedHistory,
              { role: 'pro', content: kimiContent.trim() },
            ];
            const dsUserContent = formatHistoryForDeepSeek(historyWithKimi, kimiContent.trim());

            sendSSE(controller, { type: 'deepseek_start' });

            const dsStream = await deepseek.chat.completions.create({
              model: 'moonshot-v1-8k',
              messages: [
                { role: 'system', content: dsSystemContent },
                { role: 'user', content: dsUserContent },
              ],
              stream: true,
              max_tokens: 600,
            });

            let dsContent = '';
            for await (const chunk of dsStream) {
              const piece = chunk.choices[0]?.delta?.content ?? '';
              if (piece) {
                dsContent += piece;
                sendSSE(controller, { type: 'deepseek_token', content: piece });
              }
            }

            sendSSE(controller, { type: 'deepseek_end' });

            const stateAfterKimi: CurrentState = {
              proHP: judgeResult1.currentHP.pro,
              conHP: judgeResult1.currentHP.con,
              combo: judgeResult1.comboCount,
            };

            const judgeResult2 = await callJudge(
              topic,
              round,
              'con',
              dsStyle,
              dsContent.trim() || '（反方暂无发言）',
              stateAfterKimi,
              judgeResult1.totalScore
            );

            if (judgeResult2.isCritical) {
              const bonus = appendCriticalBonus('', 'con').trim();
              dsContent = `${dsContent.trim()} ${bonus}`.trim();
              sendSSE(controller, { type: 'deepseek_token', content: ` ${bonus}` });
            }

            sendSSE(controller, {
              type: 'judge_deepseek',
              payload: judgeResult2,
            });
            sendSSE(controller, {
              type: 'done',
              winner: judgeResult2.battleStatus === 'con_win' ? 'con' : undefined,
            });
            controller.close();
            return;
          }

          const dsStyle: AttackType = userSide === 'con'
            ? (isLegacyChoice ? (userChoice as AttackType) : 'B')
            : (isLegacyChoice ? determineCounterStyle(userChoice as AttackType) : 'B');
          const dsSystemContent = isLegacyChoice
            ? DEEPSEEK_SYSTEM_PROMPT(topic, dsStyle, currentState.conHP, round)
            : DEEPSEEK_SYSTEM_PROMPT_BY_CHOICE(topic, String(userChoice), currentState.conHP, round);
          const deepseek = getApiClient();
          const kimiLastWords = getLastSideContent(trimmedHistory, 'pro');
          const dsUserContent = formatHistoryForDeepSeek(trimmedHistory, kimiLastWords);

          sendSSE(controller, { type: 'deepseek_start' });

          const dsStream = await deepseek.chat.completions.create({
            model: 'moonshot-v1-8k',
            messages: [
              { role: 'system', content: dsSystemContent },
              { role: 'user', content: dsUserContent },
            ],
            stream: true,
            max_tokens: 600,
          });

          let dsContent = '';
          for await (const chunk of dsStream) {
            const piece = chunk.choices[0]?.delta?.content ?? '';
            if (piece) {
              dsContent += piece;
              sendSSE(controller, { type: 'deepseek_token', content: piece });
            }
          }

          sendSSE(controller, { type: 'deepseek_end' });

          const judgeResult2 = await callJudge(
            topic,
            round,
            'con',
            isLegacyChoice ? dsStyle : String(userChoice),
            dsContent.trim() || '（反方暂无发言）',
            currentState,
            currentState.totalScore ?? 0
          );

          if (judgeResult2.isCritical) {
            const bonus = appendCriticalBonus('', 'con').trim();
            dsContent = `${dsContent.trim()} ${bonus}`.trim();
            sendSSE(controller, { type: 'deepseek_token', content: ` ${bonus}` });
          }

          sendSSE(controller, {
            type: 'judge_deepseek',
            payload: judgeResult2,
          });
          sendSSE(controller, {
            type: 'done',
            winner: judgeResult2.battleStatus === 'con_win' ? 'con' : undefined,
          });
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          sendSSE(controller, { type: 'error', error: message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: message, code: 'MODEL_ERROR' },
      { status: 500 }
    );
  }
}
