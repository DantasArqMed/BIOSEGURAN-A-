import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Beaker, ArrowLeft, Construction, Info, FileUp, Building2, Users, ChevronRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggleButton from '../components/ThemeToggleButton';
import ScaleControl from '../components/ScaleControl';
import ASOReader from '../components/ASOReader';
import TestCompanies from '../components/TestCompanies';
import TestEmployees from '../components/TestEmployees';
import ResetContracts from '../components/ResetContracts';

type TabType = 'menu' | 'import' | 'companies' | 'employees' | 'reset';

export default function TestArea() {
  const { user, userData } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('menu');

  const menuOptions = [
    {
      id: 'import' as const,
      title: 'Importar ASO',
      description: 'Importe um ASO em PDF, leia automaticamente funcionário, CPF, empresa e CNPJ, e salve no banco de dados.',
      icon: FileUp,
      color: 'emerald'
    },
    {
      id: 'companies' as const,
      title: 'Empresas/Convênios',
      description: 'Acesse a base real de empresas do sistema e visualize os ASOs vinculados a cada uma.',
      icon: Building2,
      color: 'blue'
    },
    {
      id: 'employees' as const,
      title: 'Funcionários',
      description: 'Visualize a base de funcionários vinculados às empresas com ASOs já importados.',
      icon: Users,
      color: 'purple'
    },
    {
      id: 'reset' as const,
      title: 'Reset de Contratos',
      description: 'Apague permanentemente todos os contratos do Firestore e os respectivos PDFs do Firebase Storage.',
      icon: Trash2,
      color: 'red'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-500 overflow-x-hidden">
      {/* Header Fixo */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => activeTab === 'menu' ? navigate('/dashboard') : setActiveTab('menu')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <Beaker className="w-5 h-5 text-emerald-500" />
              Área de Testes
            </h1>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">BioSegurança ArqMed</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ScaleControl />
          <ThemeToggleButton />
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{userData?.nome || user?.email}</span>
            <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{userData?.tipo === 'admin' ? 'Administrador' : 'Desenvolvedor'}</span>
          </div>
        </div>
      </nav>

      {/* Conteúdo Principal */}
      <main className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto min-h-[calc(100vh-80px)] flex flex-col">
        <AnimatePresence mode="wait">
          {activeTab === 'menu' ? (
            <motion.div 
              key="menu"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col"
            >
              <div className="mb-8 md:mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full border border-amber-200 dark:border-amber-900/30 text-[10px] font-black uppercase tracking-wider mb-4">
                  <Info className="w-3 h-3" />
                  Ambiente Experimental
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Laboratório de Funções</h2>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-sm max-w-2xl">
                  Selecione uma ferramenta experimental para testar. Esses módulos utilizam coleções de teste e não afetam o banco real do sistema.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {menuOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setActiveTab(option.id)}
                    className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all text-left flex flex-col items-start group relative overflow-hidden"
                  >
                    <div className={`w-16 h-16 bg-${option.color}-500/10 rounded-2xl flex items-center justify-center mb-8 border border-${option.color}-500/20 group-hover:scale-110 transition-transform duration-500`}>
                      <option.icon className={`w-8 h-8 text-${option.color}-500`} />
                    </div>

                    <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-3 flex items-center gap-2">
                      {option.title}
                      <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase leading-relaxed tracking-tight">
                      {option.description}
                    </p>

                    <div className={`absolute top-0 right-0 w-32 h-32 bg-${option.color}-500/5 blur-[60px] rounded-full -mr-16 -mt-16`} />
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-12 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Próximos em Desenvolvimento</span>
                  <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-50">
                  {['Gerador de Relatórios', 'Smart Notifications', 'Advanced Analytics'].map((label) => (
                    <div key={label} className="bg-slate-100/50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                        <Construction className="w-5 h-5 text-slate-400" />
                      </div>
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="tab-content"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4 mb-4">
                <button 
                  onClick={() => setActiveTab('menu')}
                  className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Voltar ao Lab
                </button>
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                  {menuOptions.find(o => o.id === activeTab)?.title}
                </span>
              </div>

              {activeTab === 'import' && <ASOReader />}
              {activeTab === 'companies' && <TestCompanies />}
              {activeTab === 'employees' && <TestEmployees />}
              {activeTab === 'reset' && <ResetContracts />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-12 border-t border-slate-100 dark:border-slate-800 mt-auto text-center px-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Experimental Build Alpha 1.0.0
          </p>
        </div>
        <p className="text-[10px] font-bold text-slate-300 dark:text-slate-700 uppercase tracking-tight">
          Safe Test Environment - BioSegurança ArqMed Internal Use Only
        </p>
      </footer>
    </div>
  );
}
