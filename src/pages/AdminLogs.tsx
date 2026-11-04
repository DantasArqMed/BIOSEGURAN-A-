import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Search, 
  Filter, 
  ArrowLeft, 
  Loader2, 
  Clock, 
  User as UserIcon,
  Activity,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Home
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  getDocs, 
  orderBy, 
  limit, 
  startAfter,
  where,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

interface ActivityLog {
  id: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  acao: string;
  detalhes: string;
  data: string;
}

const PAGE_SIZE = 20;

export default function AdminLogs() {
  const navigate = useNavigate();
  const { userData, isAdmin } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/dashboard');
      return;
    }
    loadLogs(true);
  }, [isAdmin, loading, actionFilter]);

  const loadLogs = async (isInitial = false) => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const logsRef = collection(db, 'logs');
      let q = query(logsRef, orderBy('data', 'desc'), limit(PAGE_SIZE));

      if (actionFilter) {
        q = query(logsRef, where('acao', '==', actionFilter), orderBy('data', 'desc'), limit(PAGE_SIZE));
      }

      if (!isInitial && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snap = await getDocs(q);
      const newLogs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));

      if (isInitial) {
        setLogs(newLogs);
      } else {
        setLogs(prev => [...prev, ...newLogs]);
      }

      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error("Erro ao carregar logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => 
    log.usuarioNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.usuarioEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.detalhes.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  const getActionColor = (acao: string) => {
    switch (acao) {
      case 'LOGIN': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      case 'GERAR_CONTRATO': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
      case 'CRIAR_USUARIO': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
      case 'EDITAR_USUARIO': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
      case 'ALTERAR_STATUS_USUARIO': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400';
    }
  };

  const getActionIcon = (acao: string) => {
    switch (acao) {
      case 'LOGIN': return <Clock className="w-3.5 h-3.5" />;
      case 'GERAR_CONTRATO': return <Activity className="w-3.5 h-3.5" />;
      case 'CRIAR_USUARIO': return <UserIcon className="w-3.5 h-3.5" />;
      default: return <ClipboardList className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300">
      {/* Header Fixo */}
      <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-emerald-500/10 dark:border-emerald-500/5 px-6 py-2.5 lg:py-3 xl:py-4 flex items-center justify-between sticky top-0 z-50 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] transition-all">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2.5 hover:bg-emerald-500/5 hover:text-emerald-500 rounded-2xl transition-all text-slate-400 border border-transparent hover:border-emerald-500/10 group"
          >
            <ArrowLeft className="w-5 h-5 xl:w-6 xl:h-6 transition-transform group-hover:-translate-x-1" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 xl:w-11 xl:h-11 bg-slate-900 dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-900/20 border border-emerald-500/20 transition-all">
              <ClipboardList className="text-emerald-400 w-5 h-5 xl:w-6 xl:h-6" />
            </div>
            <div>
              <h1 className="text-[11px] xl:text-[13px] font-black text-slate-900 dark:text-white leading-tight uppercase tracking-[0.2em] transition-all">Logs de Auditoria</h1>
              <p className="text-[8px] xl:text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] opacity-80 mt-0.5 transition-all">Segurança & Monitoramento</p>
            </div>
          </div>
        </div>

          <a 
            href="https://www.biosegurancaarqmed.com.br"
            className="text-slate-400 dark:text-slate-500 hover:text-emerald-500 transition-all p-2 rounded-2xl hover:bg-emerald-500/5 flex items-center gap-2 group border border-transparent hover:border-emerald-500/10"
            title="Voltar ao site"
          >
            <Home className="w-5 h-5 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] hidden sm:block">Site Institucional</span>
          </a>
      </nav>

      <main className="flex-1 p-6 md:p-8 lg:p-8 xl:p-12 max-w-7xl w-full mx-auto">
        <div className="mb-8 xl:mb-12 flex flex-col lg:flex-row lg:items-end justify-between gap-10 lg:gap-6 xl:gap-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em]">Trilha Criptografada</span>
            </div>
            <h2 className="text-4xl lg:text-3xl xl:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9] transition-all">
              Atividades <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-500 dark:from-white dark:to-slate-400">Recentes</span>
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold mt-4 opacity-80 text-xs xl:text-sm leading-relaxed transition-all">Registro imutável de operações internas. Monitore acessos, edições e emissões em tempo real para garantir a integridade da bio-auditoria.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-5">
             <div className="relative group w-full sm:w-64 xl:w-80 transition-all">
              <Search className="w-5 h-5 text-slate-300 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-emerald-500 transition-all" />
              <input 
                type="text"
                placeholder="Usuário ou detalhes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-3.5 xl:py-4 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-[24px] text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 font-bold text-sm focus:outline-none focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 transition-all shadow-sm"
              />
            </div>

            <div className="relative w-full sm:w-48 xl:w-56 transition-all">
              <Filter className="w-4 h-4 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2 z-10" />
              <select 
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setLastDoc(null);
                }}
                className="w-full pl-11 pr-10 py-3.5 xl:py-4 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-[24px] text-slate-900 dark:text-white font-black text-[9px] xl:text-[10px] uppercase tracking-widest focus:outline-none focus:ring-8 focus:ring-emerald-500/5 appearance-none shadow-sm cursor-pointer relative transition-all"
              >
                <option value="">Eventos: Todos</option>
                <option value="LOGIN">LOGIN</option>
                <option value="GERAR_CONTRATO">GERAR CONTRATO</option>
                <option value="CRIAR_USUARIO">CRIAR USUÁRIO</option>
                <option value="EDITAR_USUARIO">EDITAR USUÁRIO</option>
                <option value="ALTERAR_STATUS_USUARIO">ALTERAR STATUS</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {logs.length === 0 && !loading && (
            <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm">
               <ClipboardList className="w-16 h-16 text-slate-100 dark:text-slate-800 mx-auto mb-4" />
               <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-xs">Nenhum log encontrado.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            {filteredLogs.map((log, index) => (
              <motion.div 
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-white dark:bg-slate-900 p-6 xl:p-8 rounded-[40px] border border-slate-200/50 dark:border-slate-800/80 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.03)] hover:shadow-2xl hover:shadow-emerald-500/5 hover:border-emerald-500/20 transition-all flex flex-col md:flex-row md:items-center gap-6 xl:gap-8 group"
              >
                <div className="flex items-center gap-6 min-w-[280px]">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 dark:border-slate-800 group-hover:scale-105 transition-transform group-hover:bg-emerald-500/5 group-hover:border-emerald-500/20">
                    <Calendar className="w-7 h-7 text-slate-300 dark:text-slate-700 group-hover:text-emerald-500 transition-colors" />
                  </div>
                  <div>
                    <p className="text-[13px] font-black text-slate-900 dark:text-white tracking-tight">{formatDate(log.data)}</p>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-1 group-hover:text-emerald-600 transition-colors">{log.usuarioNome}</p>
                  </div>
                </div>

                <div className="flex-1 md:border-l md:border-slate-100 dark:md:border-slate-800 md:pl-8">
                  <div className="flex items-center gap-4 mb-2 flex-wrap">
                    <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-2 border border-transparent transition-all shadow-sm ${getActionColor(log.acao).replace('bg-', 'border-').replace('/30', '/10') + ' ' + getActionColor(log.acao)}`}>
                      {getActionIcon(log.acao)}
                      {log.acao.replace(/_/g, ' ')}
                    </span>
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 truncate">{log.usuarioEmail}</span>
                    </div>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 font-bold text-sm leading-relaxed group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{log.detalhes}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {hasMore && (
            <div className="pt-8 text-center">
              <button 
                onClick={() => loadLogs()}
                disabled={loading}
                className="px-8 py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-900/10 dark:shadow-white/5 disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4 rotate-90" />}
                Carregar Mais Logs
              </button>
            </div>
          )}

          {loading && logs.length > 0 && (
            <div className="flex justify-center py-4">
               <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
            </div>
          )}
        </div>
      </main>

      {/* Footer Sutil */}
      <footer className="p-16 text-center">
        <div className="h-px w-20 bg-emerald-500/20 mx-auto mb-8" />
        <p className="text-[10px] uppercase font-black tracking-[0.4em] text-slate-300 dark:text-slate-700 italic">
          Audit Trial Secured - BioSegurança ArqMed
        </p>
      </footer>
    </div>
  );
}
