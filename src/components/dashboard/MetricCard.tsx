interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: string;
  onClick?: () => void;
  progress?: { current: number; target: number };
  accent?: string;
}

export default function MetricCard({ 
  title, 
  value, 
  subtitle = 'gelin', 
  icon, 
  onClick,
  progress,
  accent = 'text-stone-800'
}: MetricCardProps) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl p-3 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-stone-400 text-[10px] font-medium uppercase tracking-wide">{title}</p>
          <p className={`text-2xl font-bold mt-0.5 ${accent}`}>
            {value}
            {progress && (
              <span className="text-xs text-stone-300 font-normal ml-0.5">/{progress.target}</span>
            )}
          </p>
          <p className="text-stone-400 text-[10px] mt-0.5">{subtitle}</p>
        </div>
        <span className="text-lg opacity-60">{icon}</span>
      </div>
      {progress && progress.target > 0 && (
        <div className="mt-2">
          <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${Math.min((progress.current / progress.target) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
