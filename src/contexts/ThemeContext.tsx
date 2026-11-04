import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isForcedLight: boolean;
  scale: number;
  increaseScale: () => void;
  decreaseScale: () => void;
  resetScale: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem('theme');
  return saved === 'dark' ? 'dark' : 'light';
};

const getInitialScale = (): number => {
  const saved = localStorage.getItem('app-scale');
  if (saved) {
    const val = parseFloat(saved);
    if (!isNaN(val) && val >= 0.9 && val <= 1.1) {
      return val;
    }
  }
  return 1.0;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [scale, setScale] = useState<number>(getInitialScale);

  const isForcedLight = location.pathname.startsWith('/site');

  const increaseScale = () => {
    setScale((prev) => {
      const next = Math.min(1.1, +(prev + 0.05).toFixed(2));
      localStorage.setItem('app-scale', next.toString());
      return next;
    });
  };

  const decreaseScale = () => {
    setScale((prev) => {
      const next = Math.max(0.9, +(prev - 0.05).toFixed(2));
      localStorage.setItem('app-scale', next.toString());
      return next;
    });
  };

  const resetScale = () => {
    setScale(1.0);
    localStorage.setItem('app-scale', '1.0');
  };

  const applyTheme = (nextTheme: Theme) => {
    const root = document.documentElement;
    if (nextTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", nextTheme);
  };

  const toggleTheme = () => {
    setTheme((prev) => {
      const nextTheme = prev === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      return nextTheme;
    });
  };

  useEffect(() => {
    if (isForcedLight) {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      return;
    }

    applyTheme(theme);
  }, [theme, location.pathname]);

  useEffect(() => {
    const isInstitutional = location.pathname === '/' || location.pathname.startsWith('/site');
    const targetScale = isInstitutional ? 1.0 : scale;
    (document.body.style as any).zoom = targetScale.toString();
    document.documentElement.style.setProperty('--app-scale', targetScale.toString());
  }, [scale, location.pathname]);

  const currentTheme = isForcedLight ? 'light' : theme;

  return (
    <ThemeContext.Provider value={{ 
      theme: currentTheme, 
      toggleTheme, 
      isForcedLight,
      scale,
      increaseScale,
      decreaseScale,
      resetScale
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
