interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: string;
  onClick?: () => void;
  progress?: { current: number; target: number };
  color: 'pink' | 'purple' | 'blue' | 'green' | 'amber';
}

const themes = {
  pink: {
    bg: 'bg-[#F7F7F7]',
    iconBg: 'bg-[#EAF2ED]',
    border: 'border-[#E5E5E5]',
  },
  purple: {
    bg: 'bg-[#F7F7F7]',
    iconBg: 'bg-[#EAF2ED]',
    border: 'border-[#E5E5E5]',
  },
  blue: {
    bg: 'bg-[#EAF2ED]',
    iconBg: 'bg-white',
    border: 'border-[#8FAF9A]/20',
  },
  green: {
    bg: 'bg-[#F7F7F7]',
    iconBg: 'bg-[#EAF2ED]',
    border: 'border-[#E5E5E5]',
  },
  amber: {
    bg: 'bg-[#F7F7F7]',
    iconBg: 'bg-[#EAF2ED]',
    border: 'border-[#E5E5E5]',
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
          <p className="text-[#8A8A8A] text-[10px] font-semibold uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-0.5 text-[#2F2F2F]">
            {value}
            {progress && (
              <span className="text-xs text-[#8A8A8A] font-normal ml-0.5">/{progress.target}</span>
            )}
          </p>
          <p className="text-[#8A8A8A] text-[10px] mt-0.5">{subtitle}</p>
        </div>
        <div className={`w-8 h-8 ${t.iconBg} rounded-lg flex items-center justify-center`}>
          <span className="text-sm">{icon}</span>
        </div>
      </div>
      {progress && progress.target > 0 && (
        <div className="mt-2">
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#8FAF9A] rounded-full transition-all"
              style={{ width: `${Math.min((progress.current / progress.target) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
