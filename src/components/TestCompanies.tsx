import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building, Search, Hash, Calendar, Loader2, FileText, X, ExternalLink, User, Trash2 } from 'lucide-react';
import { collection, query, orderBy, getDocs, onSnapshot, where, deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { companyService, CompanyData } from '../services/companyService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface ASO {
  id: string;
  funcionarioNome: string;
  funcionarioCpf: string;
  pdfUrl: string;
  storagePath?: string;
  createdAt: any;
  originalFileName: string;
  funcionarioCpfLimpo?: string;
}

export default function TestCompanies() {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  const [companyAsos, setCompanyAsos] = useState<ASO[]>([]);
  const [loadingAsos, setLoadingAsos] = useState(false);
  const { userData, isAdmin: authIsAdmin } = useAuth();
  const isInternalAccount = authIsAdmin || userData?.tipo === 'equipe' || userData?.role === 'equipe';

  useEffect(() => {
    // Escutar a coleção real de empresas
    const q = query(collection(db, 'companies'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data() })) as CompanyData[];
      setCompanies(data);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar empresas:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchAsos = async (cnpjLimpo: string) => {
    setLoadingAsos(true);
    try {
      const asosRef = collection(db, 'companies', cnpjLimpo, 'asos');
      const q = query(asosRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ASO[];
      setCompanyAsos(data);
    } catch (error) {
      console.error("Erro ao carregar ASOs:", error);
    } finally {
      setLoadingAsos(false);
    }
  };

  const handleVerAsos = (company: CompanyData) => {
    setSelectedCompany(company);
    fetchAsos(company.cnpj);
  };

  const handleDeleteAso = async (aso: ASO, cnpjLimpo: string) => {
    if (!isInternalAccount) {
      toast.error("Permissão negada. Apenas contas ArqMed podem excluir ASOs.");
      return;
    }

    if (!window.confirm("Tem certeza que deseja excluir este ASO? Esta ação não poderá ser desfeita.")) {
      return;
    }

    const toastId = toast.loading("Excluindo ASO...");
    console.log("DELETE_ASO_REQUEST:", aso.id);
    console.log("DELETE_ASO_USER_ROLE:", userData?.tipo || userData?.role);
    console.log("DELETE_ASO_STORAGE_PATH:", aso.storagePath);

    try {
      // 1. Deletar do Storage primeiro (se falhar aqui, paramos ou avisamos)
      if (aso.storagePath) {
        try {
          const sRef = ref(storage, aso.storagePath);
          await deleteObject(sRef);
          console.log("DELETE_ASO_STORAGE_SUCCESS", true);
        } catch (storageErr: any) {
          console.error("DELETE_ASO_STORAGE_ERROR:", storageErr);
          // Se for erro de permissão, avisamos e paramos para não deixar arquivo órfão se possível
          if (storageErr.code === 'storage/unauthorized' || storageErr.status === 403) {
             console.log("DELETE_ASO_STORAGE_FAILED", "Permission Denied");
             throw new Error("Erro de permissão no Storage. O PDF não pôde ser removido.");
          }
          console.warn("Storage delete failed (continuing firestore):", storageErr);
        }
      } else {
        console.warn("DELETE_ASO_STORAGE_PATH_MISSING", true);
      }

      // 2. Deletar do Índice Global (asoDocuments)
      if (aso.storagePath || aso.pdfUrl) {
          const globalRef = collection(db, 'asoDocuments');
          const q = query(globalRef, where('storagePath', '==', aso.storagePath || ''));
          const snap = await getDocs(q);
          for (const d of snap.docs) {
              await deleteDoc(doc(db, 'asoDocuments', d.id));
              console.log("DELETE_ASO_FIRESTORE_GLOBAL_ID:", d.id);
          }
      }

      // 3. Deletar da subcoleção da empresa
      await deleteDoc(doc(db, 'companies', cnpjLimpo, 'asos', aso.id));
      console.log("DELETE_ASO_FIRESTORE_SUCCESS:", true);

      toast.success("ASO excluído com sucesso.", { id: toastId });
      console.log("DELETE_ASO_FINAL_SUCCESS:", true);
      
      // Atualizar lista
      fetchAsos(cnpjLimpo);
    } catch (error: any) {
      console.error("DELETE_ASO_ERROR:", error);
      toast.error(`Erro ao excluir ASO: ${error.message || 'Erro desconhecido'}`, { id: toastId });
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.cnpj.includes(searchTerm.replace(/\D/g, ''))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Empresas & Convênios</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Base Real de Clientes</p>
        </div>

        <div className="relative group max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <input 
            type="text"
            placeholder="Buscar por nome ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p className="text-[10px] font-black uppercase tracking-widest">Carregando empresas...</p>
        </div>
      ) : filteredCompanies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompanies.map((company) => (
            <motion.div 
              key={company.cnpj}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group flex flex-col h-full"
            >
              <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 dark:border-slate-800 transition-transform group-hover:scale-110">
                <Building className="w-6 h-6 text-slate-400" />
              </div>

              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4 line-clamp-2 min-h-[2.5rem]">
                {company.nome}
              </h4>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <Hash className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">CNPJ: {company.cnpjFormatado || company.cnpj}</span>
                </div>
                {company.updatedAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Atualizado em: {new Date(company.updatedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleVerAsos(company)}
                className="mt-auto w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
              >
                <FileText className="w-3.5 h-3.5" />
                Ver ASOs
              </button>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-[32px] p-12 border border-slate-100 dark:border-slate-800 text-center">
          <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building className="w-8 h-8 text-slate-200 dark:text-slate-700" />
          </div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Nenhuma empresa encontrada</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tente importar um ASO para vincular empresas reais aqui.</p>
        </div>
      )}

      {/* Modal Ver ASOs */}
      <AnimatePresence>
        {selectedCompany && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCompany(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/50">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase leading-tight mb-1">
                      ASOs Importados
                    </h3>
                    <p className="text-xs font-black text-emerald-500 uppercase tracking-widest">
                      {selectedCompany.nome}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCompany(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                {loadingAsos ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-4" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carregando documentos...</p>
                  </div>
                ) : companyAsos.length > 0 ? (
                  <div className="space-y-4">
                    {companyAsos.map((aso) => (
                      <div key={aso.id} className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-100 dark:border-slate-700">
                            <User className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{aso.funcionarioNome}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">CPF: {aso.funcionarioCpf}</span>
                              <span className="text-[10px] text-slate-300">•</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">
                                {aso.createdAt?.toDate().toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isInternalAccount && (
                            <button 
                              onClick={() => handleDeleteAso(aso, selectedCompany.cnpj)}
                              className="p-3 bg-red-50 dark:bg-red-900/10 text-red-400 hover:text-red-600 rounded-xl border border-red-100 dark:border-red-900/20 shadow-sm transition-all hover:scale-105"
                              title="Excluir ASO"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <a 
                            href={aso.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-3 bg-white dark:bg-slate-800 text-slate-400 hover:text-emerald-500 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:scale-105"
                            title="Abrir PDF"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <FileText className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Nenhum ASO encontrado para esta empresa.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

