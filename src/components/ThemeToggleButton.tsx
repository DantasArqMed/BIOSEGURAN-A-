import React from 'react';
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

export default function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent dropdown closing or other parent actions
    console.log("CLICOU NO BOTÃO DE TEMA", { theme });
    toggleTheme();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Alternar tema"
      title={theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}
      className="relative z-[100] inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </button>
  );
}
