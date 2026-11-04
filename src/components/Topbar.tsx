import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Home, ArrowLeft } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ScaleControl from './ScaleControl';

interface TopbarProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  icon?: React.ReactNode;
  extraActions?: React.ReactNode;
}

export default function Topbar({ 
  title, 
  subtitle, 
  showBackButton = false, 
  onBackClick,
  icon,
  extraActions
}: TopbarProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme, isForcedLight } = useTheme();

  const handleToggle = () => {
    console.log("CLICOU NO BOTÃO DE TEMA", { currentTheme: theme });
    toggleTheme();
  };

  return (
    <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-emerald-500/10 dark:border-emerald-500/5 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] transition-all">
      <div className="flex items-center gap-4 min-w-0">
        {showBackButton && (
          <button 
            onClick={onBackClick || (() => navigate(-1))}
            className="p-2.5 hover:bg-emerald-500/5 hover:text-emerald-500 rounded-2xl transition-all text-slate-400 border border-transparent hover:border-emerald-500/10 group flex-shrink-0"
          >
            <ArrowLeft className="w-6 h-6 transition-transform group-hover:-translate-x-1" />
          </button>
        )}
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div className="w-11 h-11 bg-slate-900 dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-900/20 border border-emerald-500/20 flex-shrink-0">
              <div className="text-emerald-400">
                {icon}
              </div>
            </div>
          )}
          <div className="min-w-0 overflow-hidden">
            <h1 className="text-[13px] font-black text-slate-900 dark:text-white leading-tight uppercase tracking-[0.2em] truncate">{title}</h1>
            {subtitle && (
              <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] opacity-80 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 ml-4">
        {extraActions}
        
        <ScaleControl />
        
        {!isForcedLight && (
          <button
            type="button"
            onClick={handleToggle}
            aria-label="Alternar tema"
            className="relative z-50 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/50 bg-white text-slate-400 shadow-sm transition-all hover:bg-emerald-500/5 hover:text-emerald-500 hover:border-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 dark:hover:bg-emerald-500/5"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
        )}

          <a 
            href="https://www.biosegurancaarqmed.com.br"
            className="text-slate-400 dark:text-slate-500 hover:text-emerald-500 transition-all p-2 rounded-2xl hover:bg-emerald-500/5 flex items-center gap-2 group border border-transparent hover:border-emerald-500/10"
            title="Voltar ao site"
          >
            <Home className="w-5 h-5 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] hidden md:block">Site Institucional</span>
          </a>
      </div>
    </nav>
  );
}
