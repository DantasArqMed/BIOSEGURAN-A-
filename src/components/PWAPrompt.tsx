import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePWA } from '../hooks/usePWA';

export default function PWAPrompt() {
  const { isInstallable, isInstalled, installApp } = usePWA();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // iOS detection
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isInstallable) {
      setShowPrompt(true);
    }

    // Show prompt for iOS if not installed
    if (isIOSDevice && !window.matchMedia('(display-mode: standalone)').matches) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isInstallable]);

  if (isInstalled || !showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-6 right-6 z-[100] max-w-sm w-full mx-auto px-4 sm:px-0"
      >
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-emerald-100 dark:border-emerald-900/30 p-6 relative overflow-hidden group">
          {/* Decorative background */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <button 
            onClick={() => setShowPrompt(false)}
            className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
              {isIOS ? <Smartphone className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
            </div>
            <div>
              <h4 className="text-slate-900 dark:text-white font-black text-lg">Instalar Sistema</h4>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                Instale o ArqMed para acesso rápido e melhor experiência.
              </p>
            </div>
          </div>

          {isIOS ? (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">Como instalar no iPhone:</p>
                <ol className="text-sm text-slate-500 dark:text-slate-400 font-medium space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-white dark:bg-slate-700 rounded-md flex items-center justify-center text-[10px] border">1</span>
                    Clique no botão de <span className="font-bold text-emerald-600">Compartilhar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-white dark:bg-slate-700 rounded-md flex items-center justify-center text-[10px] border">2</span>
                    Role e clique em <span className="font-bold text-emerald-600">Tela de Início</span>
                  </li>
                </ol>
              </div>
              <button 
                onClick={() => setShowPrompt(false)}
                className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-slate-200 dark:shadow-none hover:scale-[1.02] active:scale-95 transition-all"
              >
                Entendi
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button 
                onClick={installApp}
                className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-200 dark:shadow-none flex items-center justify-center gap-2 hover:bg-emerald-700 hover:scale-[1.02] active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                Instalar Agora
              </button>
              <button 
                onClick={() => setShowPrompt(false)}
                className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Depois
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
