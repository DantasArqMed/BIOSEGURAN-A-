import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  Download, 
  Calendar, 
  Building, 
  Loader2, 
  ShieldCheck,
  User,
  ExternalLink,
  Hash,
  LogOut
} from 'lucide-react';
import { collection, collectionGroup, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import Topbar from '../components/Topbar';

interface ASO {
  id: string;
  funcionarioNome: string;
  funcionarioCpf: string;
  funcionarioCpfLimpo?: string;
  cpfFuncionarioNormalizado?: string;
  pdfUrl: string;
  pdfFileName?: string;
  createdAt: any;
  tipoExame?: string;
  empresaNome: string;
  empresaId: string;
  status?: string;
}

export default function MyAsos() {
  const { userData } = useAuth();
  const [asos, setAsos] = useState<ASO[]>([]);
  const [loading, setLoading] = useState(true);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = '/login';
    } catch (error) {
      console.error("Erro ao deslogar:", error);
    }
  };

  useEffect(() => {
    const DEBUG_LISTAR_ASOS_SALVOS = async () => {
      console.log("--- INICIANDO DEBUG_LISTAR_ASOS_SALVOS ---");
      try {
        // Buscar em asoDocuments
        const qGlobal = query(collection(db, 'asoDocuments'), orderBy('createdAt', 'desc'));
        const snapGlobal = await getDocs(qGlobal);
        console.log(`DEBUG_GLOBAL: Encontrados ${snapGlobal.docs.length} docs em 'asoDocuments'`);
        snapGlobal.docs.forEach(doc => {
          console.log(`DOC_GLOBAL: id=${doc.id}`, doc.data());
        });

        // Buscar via collectionGroup (legado)
        const qGroup = query(collectionGroup(db, 'asos'), orderBy('createdAt', 'desc'));
        const snapGroup = await getDocs(qGroup);
        console.log(`DEBUG_GROUP: Encontrados ${snapGroup.docs.length} docs via collectionGroup 'asos'`);
        snapGroup.docs.forEach(doc => {
          console.log(`DOC_GROUP: id=${doc.id}, path=${doc.ref.path}`, doc.data());
        });
      } catch (e) {
        console.error("ERRO_DEBUG_LISTAR_ASOS:", e);
      }
      console.log("--- FIM DEBUG_LISTAR_ASOS_SALVOS ---");
    };

    const fetchMyAsos = async () => {
      // 1. Logs de Autenticação e Perfil
      const authUser = auth.currentUser;
      const authEmail = authUser?.email || '';
      
      const localPart = authEmail.includes('@') ? authEmail.split('@')[0] : '';
      const extractedCpfFromEmail = /^\d{11}$/.test(localPart) ? localPart : '';

      const perfilCpf = userData?.loginVisivel || userData?.cpfNorm || userData?.cpf || '';
      const cpfFinal = (perfilCpf || extractedCpfFromEmail).replace(/\D/g, '');

      console.log("PORTAL_TRABALHADOR_AUTH_UID:", authUser?.uid);
      console.log("PORTAL_TRABALHADOR_AUTH_EMAIL:", authEmail);
      console.log("PORTAL_TRABALHADOR_CPF_EXTRAIDO_EMAIL:", extractedCpfFromEmail);
      console.log("PORTAL_TRABALHADOR_CPF_FINAL:", cpfFinal);

      if (!cpfFinal || cpfFinal.length < 11) {
        console.warn("PORTAL_TRABALHADOR: CPF final inválido.");
        setLoading(false);
        return;
      }

      // Rodar Debug se nada for encontrado inicialmente ou sempre para garantir rastro
      await DEBUG_LISTAR_ASOS_SALVOS();

      try {
        console.log("PORTAL_QUERY_COLLECTION: asoDocuments");
        console.log("PORTAL_QUERY_CPF:", cpfFinal);
        console.log("PORTAL_TRABALHADOR_QUERY_ASOS_INICIADA...");

        // 1. Prioridade Absoluta: Coleção Centralizada 'asoDocuments'
        const qGlobal = query(
          collection(db, 'asoDocuments'), 
          where('cpfFuncionarioNormalizado', '==', cpfFinal)
        );
        
        // 2. Fallbacks em paralelo
        const qGroup = query(
          collectionGroup(db, 'asos'), 
          where('cpfFuncionarioNormalizado', '==', cpfFinal)
        );

        const legacyFields = ['funcionarioCpfLimpo', 'funcionarioCpf', 'cpf', 'funcionarioId'];
        const legacyQueries = legacyFields.map(f => 
          getDocs(query(collectionGroup(db, 'asos'), where(f, '==', cpfFinal)))
        );

        const [snapGlobal, snapGroup, ...legacySnaps] = await Promise.all([
          getDocs(qGlobal).catch(() => ({ docs: [] })),
          getDocs(qGroup).catch(() => ({ docs: [] })),
          ...legacyQueries.map(p => p.catch(() => ({ docs: [] })))
        ]);

        const resultsMap = new Map<string, ASO>();
        const allSnaps = [snapGlobal, snapGroup, ...legacySnaps];

        allSnaps.forEach(snap => {
          (snap as any).docs?.forEach((doc: any) => {
            const data = doc.data() as ASO;
            const asoId = doc.id;
            resultsMap.set(asoId, { id: asoId, ...data });
          });
        });

        console.log("PORTAL_QUERY_RESULT_COUNT:", resultsMap.size);

        // Caso ainda não tenha nada, ou para diagnóstico completo, buscar TUDO de asoDocuments e filtrar manualmente
        if (resultsMap.size === 0) {
          console.log("NENHUM_ASO_ENCONTRADO_NAS_QUERIES. TENTANDO_BUSCA_EXAUSTIVA...");
          const allDocsSnap = await getDocs(collection(db, 'asoDocuments'));
          
          allDocsSnap.docs.forEach(doc => {
            const data = doc.data() as any;
            const docCpf = (data.cpfFuncionarioNormalizado || data.funcionarioCpfLimpo || data.funcionarioCpf || '').replace(/\D/g, '');
            
            const matchByCpf = docCpf === cpfFinal;
            const matchByName = data.pdfFileName?.includes(cpfFinal) || false;
            const matchByPath = (data.storagePath || '').includes(cpfFinal);
            
            const isMatch = matchByCpf || matchByName || matchByPath;

            if (isMatch) {
              resultsMap.set(doc.id, { id: doc.id, ...data } as ASO);
            }
          });
        }

        const dataList = Array.from(resultsMap.values()).sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
          const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });

        console.log("PORTAL_ASO_DOCS:", dataList.map(a => ({ 
          id: a.id, 
          empresa: a.empresaNome, 
          arquivo: a.pdfFileName 
        })));
        
        console.log("PORTAL_TRABALHADOR_ASOS_FILTRADOS_POR_CPF:", dataList.length);
        setAsos(dataList);
      } catch (error) {
        console.error("ERRO_PORTAL_TRABALHADOR:", error);
      } finally {
        setLoading(false);
      }
    };

    if (userData) {
      fetchMyAsos();
    }
  }, [userData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfdfc] dark:bg-slate-950 transition-colors duration-300">
      <Topbar 
        title="Meus ASOs" 
        subtitle="Consulta de Saúde Ocupacional" 
        icon={<ShieldCheck className="w-5 h-5 text-emerald-500" />}
        extraActions={
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 bg-red-500/5 hover:bg-red-500/10 text-red-500 font-black text-[10px] uppercase tracking-widest rounded-2xl border border-red-500/10 transition-all group"
          >
            <LogOut className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span className="hidden sm:block">Sair</span>
          </button>
        }
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-12">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 mb-6"
          >
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20">
               <User className="text-white w-6 h-6" />
            </div>
            <div>
               <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight">Portal do Trabalhador</h1>
               <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Seus atestados e exames digitais</p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Nome Completo</p>
                <p className="text-lg font-black text-slate-900 dark:text-white uppercase line-clamp-1">{userData?.nome}</p>
             </div>
             <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-5">
                   <Hash className="w-12 h-12" />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CPF Identificado</p>
                <p className="text-lg font-black text-slate-900 dark:text-white font-mono">
                   {userData?.loginVisivel?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                </p>
             </div>
          </div>
        </header>

        <div className="space-y-6">
          {asos.length > 0 ? (
            asos.map((aso, idx) => (
              <motion.div
                key={aso.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all group overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                    <div className="flex-1">
                       <div className="flex items-center gap-3 mb-4">
                          <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-emerald-100 dark:border-emerald-500/20">
                             {aso.tipoExame || 'Ocupacional'}
                          </span>
                          <div className="flex items-center gap-1.5 text-slate-400">
                             <Calendar className="w-3.5 h-3.5" />
                             <span className="text-[10px] font-bold uppercase tracking-widest">
                                {aso.createdAt?.toDate ? aso.createdAt.toDate().toLocaleDateString('pt-BR') : new Date(aso.createdAt).toLocaleDateString('pt-BR')}
                             </span>
                          </div>
                       </div>

                       <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4 group-hover:text-emerald-500 transition-colors">
                          Atestado de Saúde Ocupacional
                       </h3>

                       <div className="flex flex-wrap gap-3 mb-3">
                          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800 w-fit">
                             <Building className="w-4 h-4 text-slate-400" />
                             <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Empresa</p>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase">{aso.empresaNome}</p>
                             </div>
                          </div>

                          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800 w-fit">
                             <User className="w-4 h-4 text-slate-400" />
                             <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Funcionário</p>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase">{aso.funcionarioNome}</p>
                             </div>
                          </div>

                          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800 w-fit">
                             <Hash className="w-4 h-4 text-slate-400" />
                             <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">CPF</p>
                                <p className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">
                                   {aso.funcionarioCpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                                </p>
                             </div>
                          </div>
                       </div>

                       {aso.pdfFileName && (
                         <div className="text-[9px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800/50 inline-block max-w-full truncate">
                           {aso.pdfFileName}
                         </div>
                       )}
                    </div>

                    <div className="flex flex-col gap-3 w-full md:w-auto">
                       <a 
                        href={aso.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-3 px-8 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-black uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-slate-900/10"
                       >
                         <ExternalLink className="w-4 h-4" />
                         Visualizar ASO
                       </a>
                       <a 
                        href={aso.pdfUrl}
                        download={aso.pdfFileName || `ASO_${aso.funcionarioNome}_${aso.id}.pdf`}
                        className="flex items-center justify-center gap-3 px-8 py-5 bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                       >
                         <Download className="w-4 h-4" />
                         Baixar PDF
                       </a>
                    </div>
                  </div>
                </div>
                
                <div className="px-8 py-3 bg-slate-50/50 dark:bg-slate-950/30 border-t border-slate-50 dark:border-slate-800/60 flex justify-between items-center text-[8px] font-black uppercase tracking-[0.2em] text-slate-300 dark:text-slate-700">
                   <span>BioSegurança ArqMed v2.0</span>
                   <span>Documento Digital Criptografado</span>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-[40px] border-2 border-dashed border-slate-100 dark:border-slate-800">
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-950 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10 text-slate-200" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Nenhum Registro Disponível</h3>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest max-w-[280px] mx-auto leading-relaxed">
                Ainda não constam exames digitais vinculados ao seu CPF em nosso banco de dados.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="py-20 text-center opacity-30">
         <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400">ArqMed Segurança do Trabalho</p>
      </footer>
    </div>
  );
}
