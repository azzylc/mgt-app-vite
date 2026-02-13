import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleScroll = () => onClose();
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Ekran taşma kontrolü
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      ref.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      ref.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-white rounded-xl shadow-xl border border-[#E5E5E5]/80 py-1.5 min-w-[180px] animate-in fade-in"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 border-t border-[#E5E5E5]" />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full text-left px-3.5 py-2 text-sm flex items-center gap-2.5 transition ${
              item.danger
                ? "text-[#D96C6C] hover:bg-red-50"
                : "text-[#2F2F2F] hover:bg-[#F7F7F7]"
            }`}
          >
            {item.icon && <span className="text-sm w-5 text-center">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}
