import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Minus, Plus } from 'lucide-react';

export default function ScaleControl() {
  const { scale, increaseScale, decreaseScale, resetScale } = useTheme();

  return (
    <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/50 p-1 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm backdrop-blur-sm flex-shrink-0">
      <button
        type="button"
        onClick={decreaseScale}
        title="Diminuir Escala (A-)"
        disabled={scale <= 0.9}
        className="flex h-7 w-7 xs:h-8 xs:w-8 items-center justify-center rounded-xl text-slate-500 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-all font-bold"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={resetScale}
        title="Restaurar Escala (100%)"
        className="px-1.5 xs:px-2.5 h-7 xs:h-8 flex items-center justify-center gap-1 rounded-xl text-[9px] xs:text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-900 transition-all"
      >
        <span>{Math.round(scale * 100)}%</span>
      </button>

      <button
        type="button"
        onClick={increaseScale}
        title="Aumentar Escala (A+)"
        disabled={scale >= 1.1}
        className="flex h-7 w-7 xs:h-8 xs:w-8 items-center justify-center rounded-xl text-slate-500 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-all font-bold"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
