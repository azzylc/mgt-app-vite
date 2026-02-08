interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: string;
  onClick?: () => void;
  progress?: { current: number; target: number };
  color: 'pink' | 'purple' | 'blue' | 'green';
}

const themes = {
  pink: {
    bg: 'bg-gradient-to-br from-rose-50 to-pink-50',
    text: 'text-rose-600',
    iconBg: 'bg-rose-100',
    progress: 'bg-rose-400',
    border: 'border-rose-100/80',
  },
  purple: {
    bg: 'bg-gradient-to-br from-violet-50 to-purple-50',
    text: 'text-violet-600',
    iconBg: 'bg-violet-100',
    progress: 'bg-violet-400',
    border: 'border-violet-100/80',
  },
  blue: {
    bg: 'bg-gradient-to-br from-sky-50 to-blue-50',
    text: 'text-sky-600',
    iconBg: 'bg-sky-100',
    progress: 'bg-sky-400',
    border: 'border-sky-100/80',
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    text: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    progress: 'bg-emerald-400',
    border: 'border-emerald-100/80',
  },
};

export default function MetricCard({ 
  title, 
  value, 
  subtitle = 'gelin', 
  icon, 
  onClick,
  progress,
  color
}: MetricCardProps) {
  const t = themes[color];
  return (
    <div 
      onClick={onClick}
      className={`${t.bg} rounded-xl p-3 border ${t.border} ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-stone-500 text-[10px] font-semibold uppercase tracking-wider">{title}</p>
          <p className={`text-2xl font-bold mt-0.5 ${t.text}`}>
            {value}
            {progress && (
              <span className="text-xs text-stone-300 font-normal ml-0.5">/{progress.target}</span>
            )}
          </p>
          <p className="text-stone-400 text-[10px] mt-0.5">{subtitle}</p>
        </div>
        <div className={`w-8 h-8 ${t.iconBg} rounded-lg flex items-center justify-center`}>
          <span className="text-sm">{icon}</span>
        </div>
      </div>
      {progress && progress.target > 0 && (
        <div className="mt-2">
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div 
              className={`h-full ${t.progress} rounded-full transition-all`}
              style={{ width: `${Math.min((progress.current / progress.target) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
