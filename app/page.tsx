'use client';

import { useEffect, useState } from 'react';
import BattleArena from './components/BattleArena';

const PRESET_TOPICS = [
  'AI是否具有意识',
  '远程办公利大于弊还是弊大于利',
  '预制菜是否应该被禁止',
  '高校应不应该取消四六级要求',
  '短视频是否在削弱阅读能力',
  '无人驾驶应先上路还是先完善法规',
  '直播带货是否利大于弊',
  '城市该不该限制私家车',
  '大学教育更重要的是就业还是通识',
  '算法推荐是中立的还是有立场',
  '未成年人应不应该全面禁游',
  'AI作曲能否算艺术创作',
  '公共场所该不该全面禁烟',
  '在线教育能否替代线下课堂',
  '高考是否应该取消',
  '企业应否公开薪资范围',
  '环保与经济增长是否必然冲突',
  '全球化是否在走向终结',
  '社交媒体是否让人更孤独',
  '人类是否该移民火星',
  '应不应该推行四天工作制',
  '博物馆该不该全面免费',
  '人工智能是否会取代大部分医生',
  '高铁无座票是否应该限制',
  '极端气候下是否该强制限电',
  '考试应不应该允许开卷',
  '高校应不应该实行宿舍禁酒',
  '职场该不该推行匿名评价',
  '电影票价是否应该分级定价',
  '城市夜经济是否值得大力发展',
];

function pickRandomTopics(list: string[], count: number): string[] {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

export type UserSide = 'pro' | 'con';

export default function Home() {
  const [topic, setTopic] = useState<string | null>(null);
  const [userSide, setUserSide] = useState<UserSide | null>(null);
  const [customTopic, setCustomTopic] = useState('');
  const [presetTopics, setPresetTopics] = useState<string[]>([]);

  const trimmedTopic = customTopic.trim();

  useEffect(() => {
    setPresetTopics(pickRandomTopics(PRESET_TOPICS, 3));
  }, []);

  const startDebate = () => {
    if (!trimmedTopic) return;
    setTopic(trimmedTopic);
  };

  const selectPreset = (t: string) => {
    setCustomTopic(t);
  };

  const rerollTopics = () => {
    const remaining = PRESET_TOPICS.filter(t => !presetTopics.includes(t));
    if (remaining.length < 3) {
      setPresetTopics(pickRandomTopics(PRESET_TOPICS, 3));
    } else {
      setPresetTopics(pickRandomTopics(remaining, 3));
    }
  };

  if (topic && userSide !== null) {
    return (
      <BattleArena
        topic={topic}
        userSide={userSide}
        onBackToTopic={() => {
          setTopic(null);
          setUserSide(null);
        }}
      />
    );
  }

  if (topic) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-purple-900 text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-800/80 rounded-2xl p-8 shadow-xl border border-slate-600">
          <h1 className="text-2xl font-bold text-center mb-2 text-yellow-400">选择立场</h1>
          <p className="text-center text-gray-400 text-sm mb-6">辩题：{topic}</p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setUserSide('pro')}
              className="w-full px-4 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-medium transition-colors text-left"
            >
              支持方 · 操控 Kimi
            </button>
            <button
              type="button"
              onClick={() => setUserSide('con')}
              className="w-full px-4 py-4 rounded-xl bg-red-600 hover:bg-red-500 font-medium transition-colors text-left"
            >
              反对方 · 操控 DeepSeek
            </button>
          </div>
          <button
            type="button"
            onClick={() => setTopic(null)}
            className="w-full mt-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            返回修改辩题
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-purple-900 text-white flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-slate-800/80 rounded-2xl p-8 shadow-xl border border-slate-600">
        <h1 className="text-2xl font-bold text-center mb-2 text-yellow-400">思辨竞技场</h1>
        <p className="text-center text-gray-400 text-sm mb-8">Kimi vs DeepSeek · 选择辩题开始</p>

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">预设辩题（点击填入下方，再点开始辩论）</p>
            <button
              type="button"
              onClick={rerollTopics}
              className="px-3 py-1 text-xs rounded-lg bg-slate-600 hover:bg-slate-500 transition-colors"
            >
              🎲 随机
            </button>
          </div>
          {presetTopics.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => selectPreset(t)}
              className="w-full text-left px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors"
            >
              {t}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm text-gray-400">或输入自定义辩题</p>
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startDebate()}
            placeholder="例如：AI是否会取代人类工作"
            className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {!trimmedTopic && (
            <p className="text-xs text-amber-400/90">请选择上方预设或输入辩题后再点「开始辩论」</p>
          )}
          <button
            type="button"
            onClick={startDebate}
            disabled={!trimmedTopic}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            开始辩论
          </button>
        </div>
      </div>
    </div>
  );
}
