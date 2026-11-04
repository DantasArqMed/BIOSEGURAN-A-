import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  Search, 
  Download, 
  ExternalLink, 
  Calendar, 
  User, 
  Hash, 
  Loader2, 
  Building2,
  Filter,
  ChevronRight,
  LogOut,
  ChevronDown
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy, collectionGroup } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import Topbar from '../components/Topbar';

interface ASO {
  id: string;
  funcionarioNome: string;
  funcionarioCpf: string;
  funcionarioCpfLimpo?: string;
  pdfUrl: string;
  pdfFileName?: string;
  createdAt: any;
  tipoExame?: string;
  status?: string;
  empresaId: string;
  empresaNome: string;
}

interface EmployeeGroup {
  nome: string;
  cpf: string;
  asos: ASO[];
  isExpanded: boolean;
}

export default function CompanyDashboard() {
  const { userData } = useAuth();
  const [employees, setEmployees] = useState<EmployeeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = '/login';
    } catch (error) {
      console.error("Erro ao deslogar:", error);
    }
  };

  useEffect(() => {
    const fetchAsos = async () => {
      const cnpjRaw = userData?.loginVisivel || userData?.empresaId || '';
      const cnpj = cnpjRaw.replace(/\D/g, '');
      
      console.log("PORTAL_EMPRESA_UID:", userData?.uid);
      console.log("PORTAL_EMPRESA_CNPJ_PERFIL:", cnpjRaw);
      console.log("PORTAL_EMPRESA_CNPJ_NORMALIZADO:", cnpj);

      if (!cnpj) {
        console.log("BUSCA_EMPRESA_CANCELADA: CNPJ não identificado");
        setLoading(false);
        return;
      }

      try {
        console.log("PORTAL_EMPRESA_BUSCANDO_ASOS...");
        
        // Buscar ASOs da empresa
        // Tentar primeiro no caminho direto /companies/{cnpj}/asos
        const asosRef = collection(db, 'companies', cnpj, 'asos');
        const snap = await getDocs(asosRef).catch(e => {
            console.warn("Erro ao buscar na coleção direta, tentando collectionGroup:", e);
            return null;
        });

        let docs = snap?.docs || [];

        // Fallback: Se não encontrou nada no caminho direto, tenta por campo cnpjEmpresaNormalizado via collectionGroup
        if (docs.length === 0) {
            const qGroup = query(
                collectionGroup(db, 'asos'),
                where('cnpjEmpresaNormalizado', '==', cnpj)
            );
            const snapGroup = await getDocs(qGroup);
            docs = snapGroup.docs;
        }

        console.log("PORTAL_EMPRESA_TOTAL_ASOS_ENCONTRADOS:", docs.length);
        
        const allAsos = docs.map(doc => ({ id: doc.id, ...doc.data() })) as ASO[];

        // Agrupar por Funcionário
        const groups: { [key: string]: EmployeeGroup } = {};

        allAsos.forEach(aso => {
           const cpf = (aso.funcionarioCpfLimpo || aso.funcionarioCpf || '').replace(/\D/g, '');
           const key = cpf || aso.funcionarioNome;

           if (!groups[key]) {
              groups[key] = {
                 nome: aso.funcionarioNome,
                 cpf: aso.funcionarioCpf,
                 asos: [],
                 isExpanded: false
              };
           }
           groups[key].asos.push(aso);
        });

        // Ordenar ASOs de cada grupo por data decrescente
        Object.values(groups).forEach(group => {
           group.asos.sort((a, b) => {
              const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
              const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
              return dateB.getTime() - dateA.getTime();
           });
        });

        const sortedGroups = Object.values(groups).sort((a, b) => a.nome.localeCompare(b.nome));
        console.log("PORTAL_EMPRESA_FUNCIONARIOS_AGRUPADOS:", sortedGroups.length);
        
        setEmployees(sortedGroups);
      } catch (error) {
        console.error("Erro ao carregar ASOs da empresa:", error);
      } finally {
        setLoading(false);
      }
    };

    if (userData) {
      fetchAsos();
    }
  }, [userData]);

  const toggleExpand = (cpf: string) => {
     setEmployees(prev => prev.map(emp => {
        if (emp.cpf === cpf) return { ...emp, isExpanded: !emp.isExpanded };
        return emp;
     }));
  };

  const filteredEmployees = employees.filter(emp => 
    emp.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.cpf.replace(/\D/g, '').includes(searchTerm.replace(/\D/g, ''))
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Topbar 
        title="Portal Empresa" 
        subtitle={userData?.nome || 'Minha Empresa'} 
        icon={<Building2 className="w-5 h-5" />}
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Portal da Empresa</h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">
            Bem-vindo, <span className="text-emerald-500">{userData?.nome}</span> • Gestão de Saúde Ocupacional
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <div className="bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <Hash className="w-4 h-4 text-emerald-500" />
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">CNPJ</p>
                <p className="text-sm font-black text-slate-900 dark:text-white font-mono">
                  {userData?.loginVisivel?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                </p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-3">
              <User className="w-4 h-4 text-emerald-500" />
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Funcionários</p>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {employees.length} Cadastrados
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Busca */}
        <div className="relative group mb-12">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <input 
            type="text"
            placeholder="Buscar por funcionário ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-16 pr-6 py-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[32px] shadow-sm focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all text-sm font-bold"
          />
        </div>

        {/* Lista de Funcionários Agrupados */}
        <div className="space-y-6">
          {filteredEmployees.length > 0 ? (
            filteredEmployees.map((emp) => (
              <div
                key={emp.cpf || emp.nome}
                className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                <div 
                   onClick={() => toggleExpand(emp.cpf)}
                   className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-700">
                      <User className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1">{emp.nome}</h4>
                      <div className="flex items-center gap-4">
                         <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-400">
                            {emp.cpf}
                         </div>
                         <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest rounded-full">
                            {emp.asos.length} {emp.asos.length === 1 ? 'ASO' : 'ASOs'}
                         </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-auto">
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {emp.isExpanded ? 'Ocultar Detalhes' : 'Ver ASOs'}
                     </span>
                     <div className={`p-2 rounded-xl bg-slate-50 dark:bg-slate-800 transition-transform ${emp.isExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                     </div>
                  </div>
                </div>

                {emp.isExpanded && (
                   <motion.div 
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: 'auto', opacity: 1 }}
                     className="px-8 pb-8 border-t border-slate-50 dark:border-slate-800"
                   >
                      <div className="pt-8 space-y-4">
                         {emp.asos.map(aso => (
                            <div key={aso.id} className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-slate-50/50 dark:bg-slate-950/30 rounded-2xl border border-slate-100 dark:border-slate-800 gap-4">
                               <div className="flex items-center gap-6">
                                  <div className="flex flex-col">
                                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Data do Exame</p>
                                     <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                                        <Calendar className="w-4 h-4 text-emerald-500" />
                                        {aso.createdAt?.toDate ? aso.createdAt.toDate().toLocaleDateString('pt-BR') : new Date(aso.createdAt).toLocaleDateString('pt-BR')}
                                     </div>
                                  </div>
                                  <div className="flex flex-col">
                                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo / Status</p>
                                     <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-slate-900 dark:text-white uppercase">{aso.tipoExame || 'Ocupacional'}</span>
                                        <span className="px-2 py-0.5 bg-white dark:bg-slate-800 text-[8px] font-black text-emerald-500 rounded border border-emerald-100 dark:border-emerald-500/20 uppercase tracking-tighter">
                                           {aso.status || 'Finalizado'}
                                        </span>
                                     </div>
                                  </div>
                               </div>

                               <div className="flex items-center gap-3">
                                  <a 
                                     href={aso.pdfUrl}
                                     target="_blank"
                                     rel="noreferrer"
                                     className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-all shadow-sm"
                                  >
                                     <ExternalLink className="w-3.5 h-3.5" />
                                     Visualizar
                                  </a>
                                  <a 
                                     href={aso.pdfUrl}
                                     download={aso.pdfFileName || `ASO_${emp.nome}_${aso.id}.pdf`}
                                     className="flex items-center gap-2 px-5 py-3 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/10"
                                  >
                                     <Download className="w-3.5 h-3.5" />
                                     Baixar
                                  </a>
                               </div>
                            </div>
                         ))}
                      </div>
                   </motion.div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-[40px] border-2 border-dashed border-slate-100 dark:border-slate-800 transition-colors">
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-950 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10 text-slate-200" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2 transition-colors">Nenhum Funcionário Encontrado</h3>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest max-w-[280px] mx-auto leading-relaxed transition-colors">
                Não localizamos funcionários vinculados ao CNPJ desta empresa com ASOs digitais.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
