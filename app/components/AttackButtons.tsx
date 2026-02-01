'use client';

interface AttackButtonsProps {
  options: string[];
  optionsLoading: boolean;
  onAttack: (choice: string) => void;
  disabled: boolean;
}

export function AttackButtons({ options, optionsLoading, onAttack, disabled }: AttackButtonsProps) {
  if (optionsLoading) {
    return (
      <div className="text-center py-6 text-gray-400">
        正在生成本回合选项...
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        暂无选项，请稍候
      </div>
    );
  }
  return (
    <div className="flex flex-col sm:flex-row justify-center gap-4 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onAttack(opt)}
          disabled={disabled}
          className="min-h-[72px] px-6 py-4 rounded-xl bg-slate-600 hover:bg-slate-500 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 text-left max-w-md"
        >
          <span className="font-medium">{opt}</span>
        </button>
      ))}
    </div>
  );
}
