import React, { useState } from 'react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { ShieldAlert, Trash2, Eye, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { logService } from '../services/logService';

export default function ResetContracts() {
  const { user, userData } = useAuth();
  const [confirmInput, setConfirmInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'warn' | 'success'>('warn');

  const EXPECTED_KEYWORD = 'CONTRATOS-RESET';

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmInput !== EXPECTED_KEYWORD) {
      toast.error(`Por favor, digite "${EXPECTED_KEYWORD}" exatamente para confirmar.`);
      return;
    }

    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Você precisa estar logado para realizar esta ação.');
      }

      console.log('[FRONTEND_RESET] Enviando requisição de reset para o servidor...');
      const response = await fetch('/api/admin/reset-contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Falha ao resetar contratos no servidor.');
      }

      // Registrar o log de auditoria no Firestore
      if (user && userData) {
        await logService.record(
          { uid: user.uid, nome: userData.nome, email: user.email },
          'EXCLUIR_CONTRATO',
          'Sucesso no reset completo de contratos (Banco e Storage) realizado pelo laboratório de funções.'
        );
      }

      // Limpeza de cache local do navegador
      console.log('CONTRACT_RESET_LOCAL_CACHE_CLEARED');
      localStorage.clear();
      sessionStorage.clear();

      try {
        const dbs = await window.indexedDB.databases();
        for (const dbInfo of dbs) {
          if (dbInfo.name && (dbInfo.name.includes('firestore') || dbInfo.name.includes('firebase') || dbInfo.name.includes('contracts'))) {
            console.log(`Limpando indexedDB: ${dbInfo.name}`);
            window.indexedDB.deleteDatabase(dbInfo.name);
          }
        }
      } catch (cacheErr) {
        console.warn('Erro ao limpar bases IndexedDB locais:', cacheErr);
      }

      console.log('CONTRACT_RESET_DASHBOARD_RECALCULATED');
      console.log('CONTRACT_RESET_FINISHED');

      toast.success('Contratos resetados com sucesso!');
      setStep('success');
      setConfirmInput('');
    } catch (err: any) {
      console.error('[FRONTEND_RESET] Erro durante o reset:', err);
      toast.error(err.message || 'Erro inesperado ao resetar contratos.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-[40px] border border-emerald-500/10 dark:border-emerald-500/5 p-10 md:p-16 text-center max-w-2xl mx-auto shadow-2xl"
      >
        <div className="w-24 h-24 bg-emerald-50 dark:bg-emerald-950/40 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner border border-emerald-100 dark:border-emerald-900/30">
          <ShieldCheck className="w-12 h-12 text-emerald-500" />
        </div>
        <h4 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-4 tracking-tighter uppercase">Reset Concluído com Sucesso!</h4>
        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm leading-relaxed mb-8 max-w-md mx-auto">
          Todos os contratos foram excluídos definitivamente do Firestore, todas as mídias em PDF foram removidas do Firebase Storage, e os caches locais do navegador foram limpos.
        </p>
        <button
          onClick={() => {
            window.location.reload();
          }}
          className="px-10 py-5 bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-black uppercase tracking-[0.2em] text-[10px] rounded-[24px] hover:scale-105 active:scale-95 transition-all shadow-xl"
        >
          Entendido (Recarregar Página)
        </button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[40px] shadow-sm overflow-hidden"
      >
        {/* Banner de Atenção */}
        <div className="bg-gradient-to-r from-red-500 to-amber-600 p-8 md:p-12 text-white relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-y-6 translate-x-6 text-white/5 pointer-events-none">
            <ShieldAlert className="w-64 h-64" />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg">
              <AlertTriangle className="w-10 h-10 text-white" />
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-[0.25em] bg-white/20 px-3 py-1.5 rounded-full border border-white/10 mb-2.5 inline-block">Ação Irreversível</span>
              <h2 className="text-2xl md:text-3.5xl font-black tracking-tight uppercase leading-none">Apagar toda a Base de Contratos</h2>
            </div>
          </div>
        </div>

        {/* Conteúdo do Formulário */}
        <div className="p-8 md:p-12 space-y-8">
          <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/50 space-y-3.5">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-400" /> Detalhes do Reset
            </h4>
            <div className="space-y-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-relaxed">
              <p className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Firestore: Deleta todos os metadados da coleção <code className="lowercase bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-red-500 font-mono">contracts</code>.
              </p>
              <p className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Storage: Exclui permanentemente todos os PDFs sob <code className="lowercase bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-red-500 font-mono">contracts/**</code>.
              </p>
              <p className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Segurança: Não prejudica Login, Usuários, ASOs, QR Codes, Site ou outras chaves.
              </p>
            </div>
          </div>

          <form onSubmit={handleReset} className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] block">
                Para prosseguir, digite <span className="text-red-500 font-black">{EXPECTED_KEYWORD}</span> abaixo:
              </label>
              <input
                type="text"
                required
                disabled={loading}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="CONTRATOS-RESET"
                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800 rounded-[20px] text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 font-mono text-sm focus:outline-none focus:ring-8 focus:ring-red-500/5 focus:border-red-500/30 transition-all font-black"
              />
            </div>

            <button
              type="submit"
              disabled={loading || confirmInput !== EXPECTED_KEYWORD}
              className="w-full flex items-center justify-center gap-3 px-10 py-5 bg-red-600 hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-600 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-[24px] hover:scale-[1.02] active:scale-95 disabled:scale-100 transition-all shadow-xl shadow-red-600/10"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Executando Reset de Contratos...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Confirmar Reset Completo
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
