'use client';

const colorMap = {
  blue: 'bg-blue-500',
  red: 'bg-red-500',
};

type Color = keyof typeof colorMap;

interface HPBarProps {
  name: string;
  hp: number;
  max: number;
  color?: Color;
}

export function HPBar({ name, hp, max, color = 'blue' }: HPBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const barClass = colorMap[color];
  const isLow = hp < 200 && hp > 0;

  return (
    <div
      className={`
        w-full max-w-xs rounded-xl p-2 transition-all duration-300
        ${isLow ? 'ring-2 ring-amber-400 ring-opacity-80 animate-pulse' : ''}
      `}
    >
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{name}</span>
        <span>{hp} / {max}</span>
      </div>
      <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${barClass} transition-[width] duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
