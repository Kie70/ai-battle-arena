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
  DebateResponseKimiOrDeepSeek,
} from '@/types/battle';

// 当前统一使用 Kimi (Moonshot) 完成所有调用，后续可拆分为不同 API
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

function cleanThinking(content: string): string {
  return content.split('\n').filter(line => !line.includes('【思考】')).join('\n').trim();
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
  const text = lines.join('\n\n') + `\n\n对方观点总结：${summary}\n请反击`;
  return text;
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
  } catch (e) {
    console.error('Judge JSON parse failed, raw:', raw);
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

function toDebateResponsePayload(judgeResult: JudgeResult, content: string): DebateResponseKimiOrDeepSeek {
  return {
    content,
    damage: judgeResult.damage,
    isCritical: judgeResult.isCritical,
    isOffTopic: judgeResult.isOffTopic,
    currentHP: judgeResult.currentHP,
    totalScore: judgeResult.totalScore,
    comboCount: judgeResult.comboCount,
    battleStatus: judgeResult.battleStatus,
    commentary: judgeResult.commentary,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      topic,
      round,
      userChoice,
      currentState,
      history,
      userSide = 'pro',
    }: {
      topic: string;
      round: number;
      userChoice: AttackType | string;
      currentState: CurrentState;
      history: HistoryEntry[];
      userSide?: 'pro' | 'con';
    } = body;

    if (!topic || !userChoice || !currentState) {
      return Response.json(
        { error: 'Missing topic, userChoice or currentState', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const kimi = getApiClient();
    const opponentLastWords =
      history.length > 0 && history[history.length - 1].role === 'con'
        ? history[history.length - 1].content
        : '';

    const trimmedHistory = trimHistory(history);
    const kimiUserContent = formatHistoryForKimi(trimmedHistory, opponentLastWords);

    const isLegacyChoice = userChoice === 'A' || userChoice === 'B' || userChoice === 'C';
    const kimiStyle: AttackType = userSide === 'con' ? 'B' : (isLegacyChoice ? (userChoice as AttackType) : 'B');
    const kimiSystemContent = userSide === 'con' || isLegacyChoice
      ? KIMI_SYSTEM_PROMPT(topic, kimiStyle, currentState.proHP, round)
      : KIMI_SYSTEM_PROMPT_BY_CHOICE(topic, String(userChoice), currentState.proHP, round);
    const kimiCompletion = await kimi.chat.completions.create({
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'system', content: kimiSystemContent },
        { role: 'user', content: kimiUserContent },
      ],
      stream: false,
      max_tokens: 600,
    });

    const kimiContent = (kimiCompletion.choices[0]?.message?.content ?? '').trim() || '（正方暂无发言）';

    const prevTotalScore1 = currentState.totalScore ?? 0;
    const judgeType = isLegacyChoice ? (userChoice as AttackType) : String(userChoice);
    const judgeResult1 = await callJudge(
      topic,
      round,
      'pro',
      judgeType,
      kimiContent,
      currentState,
      prevTotalScore1
    );

    const kimiFinalContent = judgeResult1.isCritical ? appendCriticalBonus(kimiContent, 'pro') : kimiContent;

    if (judgeResult1.battleStatus !== 'ongoing') {
      return Response.json({
        kimi: toDebateResponsePayload(judgeResult1, kimiFinalContent),
        winner: 'pro',
        finalData: judgeResult1,
      });
    }

    const dsStyle: AttackType = userSide === 'con'
      ? (isLegacyChoice ? (userChoice as AttackType) : 'B')
      : (isLegacyChoice ? determineCounterStyle(userChoice as AttackType) : 'B');
    const dsSystemContent = isLegacyChoice
      ? DEEPSEEK_SYSTEM_PROMPT(topic, dsStyle, judgeResult1.currentHP.con, round)
      : DEEPSEEK_SYSTEM_PROMPT_BY_CHOICE(topic, String(userChoice), judgeResult1.currentHP.con, round);
    const deepseek = getApiClient();
    const historyWithKimi: HistoryEntry[] = [...trimmedHistory, { role: 'pro', content: kimiFinalContent }];
    const dsUserContent = formatHistoryForDeepSeek(historyWithKimi, kimiFinalContent);

    const dsCompletion = await deepseek.chat.completions.create({
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'system', content: dsSystemContent },
        { role: 'user', content: dsUserContent },
      ],
      stream: false,
      max_tokens: 600,
    });

    const dsContent = (dsCompletion.choices[0]?.message?.content ?? '').trim() || '（反方暂无发言）';

    const stateAfterKimi: CurrentState = {
      proHP: judgeResult1.currentHP.pro,
      conHP: judgeResult1.currentHP.con,
      combo: judgeResult1.comboCount,
    };

    const judgeType2 = isLegacyChoice ? dsStyle : String(userChoice);
    const judgeResult2 = await callJudge(
      topic,
      round,
      'con',
      judgeType2,
      dsContent,
      stateAfterKimi,
      judgeResult1.totalScore
    );

    const dsFinalContent = judgeResult2.isCritical ? appendCriticalBonus(dsContent, 'con') : dsContent;

    return Response.json({
      kimi: toDebateResponsePayload(judgeResult1, kimiFinalContent),
      deepseek: toDebateResponsePayload(judgeResult2, dsFinalContent),
      state: judgeResult2,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('MOONSHOT_API_KEY')) {
      return Response.json(
        { error: '请配置 .env.local 中的 MOONSHOT_API_KEY', code: 'AUTH_FAILED' },
        { status: 500 }
      );
    }
    console.error('Debate API error:', err);
    return Response.json(
      { error: message || 'AI服务暂时不可用', code: 'MODEL_ERROR' },
      { status: 500 }
    );
  }
}
