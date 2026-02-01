import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import { OPTIONS_GENERATION_PROMPT } from '@/config/prompts';
import type { HistoryEntry } from '@/types/battle';

function getApiClient() {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) throw new Error('MOONSHOT_API_KEY is not set');
  return new OpenAI({ apiKey: key, baseURL: 'https://api.moonshot.cn/v1' });
}

const MAX_HISTORY = 2;
const MAX_SNIPPET = 40;

const PRESET_OPTIONS = [
  ['质疑数据来源', '从伦理角度回应', '举反例'],
  ['反驳逻辑链', '强调实践效果', '引用权威观点'],
  ['分析成本收益', '指出前提错误', '类比其他案例'],
  ['强调长期影响', '质疑可行性', '澄清定义'],
  ['从历史视角反驳', '强调风险', '提出替代方案'],
  ['指出双重标准', '强调社会共识', '分析利益相关'],
];

function trimHistory(history: HistoryEntry[]): HistoryEntry[] {
  if (history.length <= MAX_HISTORY) return history;
  return history.slice(-MAX_HISTORY);
}

function formatHistoryForOptions(history: HistoryEntry[]): string {
  if (history.length === 0) return '';
  return history
    .map((h) => {
      const text = h.content.replace(/\s+/g, ' ').trim();
      const snippet = text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET)}…` : text;
      return `${h.role === 'pro' ? '【正方】' : '【反方】'} ${snippet}`;
    })
    .join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      topic,
      round,
      history = [],
      side = 'pro',
    }: { topic: string; round: number; history: HistoryEntry[]; side?: 'pro' | 'con' } = body;

    if (!topic) {
      return Response.json({ error: 'Missing topic', code: 'BAD_REQUEST' }, { status: 400 });
    }

    if (round <= 2 || Math.random() < 0.6) {
      const idx = Math.floor(Math.random() * PRESET_OPTIONS.length);
      const options = PRESET_OPTIONS[idx];
      return Response.json({ options });
    }

    const client = getApiClient();
    const historyText = formatHistoryForOptions(trimHistory(history));

    const response = await client.chat.completions.create({
      model: 'moonshot-v1-8k',
      messages: [
        {
          role: 'user',
          content: OPTIONS_GENERATION_PROMPT(topic, round, historyText, side),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 100,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as { options?: string[] };
    let options = Array.isArray(parsed.options) ? parsed.options.slice(0, 3) : [];
    
    if (options.length === 0 || options.some(opt => !opt || opt.trim().length === 0)) {
      const idx = Math.floor(Math.random() * PRESET_OPTIONS.length);
      options = PRESET_OPTIONS[idx];
    }

    return Response.json({ options });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('MOONSHOT_API_KEY')) {
      return Response.json(
        { error: '请配置 .env.local 中的 MOONSHOT_API_KEY', code: 'AUTH_FAILED' },
        { status: 500 }
      );
    }
    console.error('Options API error:', err);
    return Response.json(
      { error: message || '生成选项失败', code: 'MODEL_ERROR' },
      { status: 500 }
    );
  }
}
