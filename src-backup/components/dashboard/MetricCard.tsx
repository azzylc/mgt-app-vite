interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: string;
  color: 'pink' | 'purple' | 'blue' | 'green';
  onClick?: () => void;
  progress?: { current: number; target: number };
}

const colorClasses = {
  pink: 'bg-rose-50 text-rose-500',
  purple: 'bg-violet-50 text-violet-500',
  blue: 'bg-sky-50 text-sky-500',
  green: 'bg-emerald-50 text-emerald-500',
};

const textColorClasses = {
  pink: 'text-rose-500',
  purple: 'text-violet-500',
  blue: 'text-sky-500',
  green: 'text-emerald-500',
};

const progressColors = {
  pink: 'bg-rose-400',
  purple: 'bg-violet-400',
  blue: 'bg-sky-400',
  green: 'bg-emerald-400',
};

export default function MetricCard({ 
  title, 
  value, 
  subtitle = 'gelin', 
  icon, 
  color,
  onClick,
  progress 
}: MetricCardProps) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white p-2.5 md:p-3 rounded-lg border border-stone-100 ${onClick ? 'cursor-pointer hover:border-stone-200 hover:shadow-sm transition' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-stone-500 text-[10px] md:text-[11px] font-medium">{title}</p>
          <p className={`text-lg md:text-xl font-semibold mt-0.5 ${textColorClasses[color]}`}>
            {value}
            {progress && (
              <span className="text-xs text-stone-400 font-normal">/{progress.target}</span>
            )}
          </p>
          <p className="text-stone-400 text-[10px]">{subtitle}</p>
        </div>
        <div className={`w-8 h-8 ${colorClasses[color]} rounded-lg flex items-center justify-center`}>
          <span className="text-sm">{icon}</span>
        </div>
      </div>
      {progress && progress.target > 0 && (
        <div className="mt-1.5">
          <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
            <div 
              className={`h-full ${progressColors[color]} rounded-full transition-all`}
              style={{ width: `${Math.min((progress.current / progress.target) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
