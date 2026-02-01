'use client';

import type { DebateLogEntry } from '@/types/battle';

type UserSide = 'pro' | 'con';

interface DialogueBoxProps extends DebateLogEntry {
  userSide?: UserSide;
}

function normalizeContent(content: string): string {
  // 提取思考部分
  const thinkingMatch = content.match(/\(([^)]*)\)/);
  const thinking = thinkingMatch ? thinkingMatch[1] : '';
  
  // 提取辩论部分
  const debate = content.replace(/\(([^)]*)\)/, '').trim();

  const result: string[] = [];
  if (thinking) {
    // 思考部分字数限制在 50 字
    const truncatedThinking = thinking.length > 50 ? thinking.slice(0, 47) + '...' : thinking;
    result.push(`(${truncatedThinking})`);
  }
  if (debate) {
    result.push(`    ${debate}`);
  }
  
  return result.join('\n').trim();
}

export function DialogueBox({ side, content, damage, isCritical, commentary, userSide }: DialogueBoxProps) {
  const isPro = side === 'pro';
  const displayContent = normalizeContent(content);
  const speakerLabel = isPro
    ? (userSide === 'pro' ? 'Kimi（支持） (你)' : 'Kimi（支持）')
    : (userSide === 'con' ? 'DeepSeek（反对） (你)' : 'DeepSeek（反对）');

  // 判断是否正在输入中（如果没有 damage 且不是正在加载，说明是流式传输中）
  // 这里的逻辑需要配合 BattleArena 的 isLoading 状态
  const isStreaming = damage === undefined;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className={`flex ${isPro ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`
            max-w-[85%] rounded-2xl px-4 py-3 transition-shadow duration-300
            ${isPro ? 'bg-blue-600/80 text-left' : 'bg-red-600/80 text-left'}
            ${isCritical ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30' : ''}
            resize-x overflow-auto min-w-[200px]
          `}
        >
          <div className="text-xs opacity-80 mb-1">
            {speakerLabel}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{displayContent}</p>
        </div>
      </div>
      
      {!isStreaming && (damage !== undefined || commentary) && (
        <div className="flex justify-center w-full py-2">
          <div className="bg-black/40 px-6 py-2 rounded-full border border-white/10 text-center">
            <div className="text-xs opacity-90 flex flex-col gap-1">
              {damage !== undefined && (
                <span className="font-bold text-yellow-400">
                  造成伤害 {damage}
                  {isCritical && <span className="ml-1 animate-pulse">! 暴击 !</span>}
                </span>
              )}
              {commentary && <span className="font-bold text-gray-200">观众评价：{commentary}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
