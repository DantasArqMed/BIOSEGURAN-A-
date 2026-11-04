import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Search, Fingerprint, Building, Calendar, Loader2, FileText, X, ExternalLink, Hash, Trash2 } from 'lucide-react';
import { collectionGroup, query, orderBy, onSnapshot, where, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Employee {
  id: string;
  nome: string;
  cpf: string;
  cpfLimpo: string;
  empresaNome: string;
  empresaCnpj: string;
  empresaId: string;
  updatedAt: any;
}

interface ASO {
  id: string;
  funcionarioNome: string;
  funcionarioCpf: string;
  pdfUrl: string;
  storagePath?: string;
  createdAt: any;
  empresaNome: string;
  empresaId?: string;
  funcionarioCpfLimpo?: string;
}

export default function TestEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeAsos, setEmployeeAsos] = useState<ASO[]>([]);
  const [loadingAsos, setLoadingAsos] = useState(false);
  const { userData, isAdmin: authIsAdmin } = useAuth();
  const isInternalAccount = authIsAdmin || userData?.tipo === 'equipe' || userData?.role === 'equipe';

  useEffect(() => {
    // Usar collectionGroup para buscar funcionários em todas as empresas
    const q = query(collectionGroup(db, 'funcionarios'), orderBy('updatedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Employee[];
      
      // Filtrar duplicados (mesmo CPF em diferentes empresas ou atualizações)
      // Como o ID é o CPF limpo dentro de cada empresa, um funcionário pode aparecer múltiplas vezes se estiver em várias empresas.
      // Para fins de teste, mostraremos todos os vínculos.
      setEmployees(data);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar funcionários:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchEmployeeAsos = async (employee: Employee) => {
    setLoadingAsos(true);
    try {
      // Buscar na subcoleção de ASOs da empresa específica do funcionário
      const asosRef = collection(db, 'companies', employee.empresaId, 'asos');
      const q = query(asosRef, where('funcionarioCpfLimpo', '==', employee.cpfLimpo), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ASO[];
      setEmployeeAsos(data);
    } catch (error) {
      console.error("Erro ao carregar ASOs do funcionário:", error);
    } finally {
      setLoadingAsos(false);
    }
  };

  const handleVerAsos = (employee: Employee) => {
    setSelectedEmployee(employee);
    fetchEmployeeAsos(employee);
  };

  const handleDeleteAso = async (aso: ASO, empresaId: string) => {
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
      // 1. Deletar do Storage primeiro
      if (aso.storagePath) {
        try {
          const sRef = ref(storage, aso.storagePath);
          await deleteObject(sRef);
          console.log("DELETE_ASO_STORAGE_SUCCESS", true);
        } catch (storageErr: any) {
          console.error("DELETE_ASO_STORAGE_ERROR:", storageErr);
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
      await deleteDoc(doc(db, 'companies', empresaId, 'asos', aso.id));
      console.log("DELETE_ASO_FIRESTORE_SUCCESS:", true);

      toast.success("ASO excluído com sucesso.", { id: toastId });
      console.log("DELETE_ASO_FINAL_SUCCESS:", true);
      
      // Atualizar lista
      if (selectedEmployee) fetchEmployeeAsos(selectedEmployee);
    } catch (error: any) {
      console.error("DELETE_ASO_ERROR:", error);
      toast.error(`Erro ao excluir ASO: ${error.message || 'Erro desconhecido'}`, { id: toastId });
    }
  };

  const filteredEmployees = employees.filter(e => 
    e.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.cpf.includes(searchTerm) ||
    e.empresaNome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Funcionários Identificados</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Base Real de Funcionários por Empresa</p>
        </div>

        <div className="relative group max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <input 
            type="text"
            placeholder="Buscar por nome, CPF ou empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p className="text-[10px] font-black uppercase tracking-widest">Carregando funcionários...</p>
        </div>
      ) : filteredEmployees.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEmployees.map((employee, idx) => (
            <motion.div 
              key={`${employee.id}-${idx}`}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group overflow-hidden relative flex flex-col h-full"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 transition-transform group-hover:scale-110">
                  <User className="w-6 h-6 text-emerald-500" />
                </div>
              </div>

              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4 line-clamp-2 min-h-[2.5rem]">
                {employee.nome}
              </h4>

              <div className="space-y-4 pt-4 border-t border-slate-50 dark:border-slate-800 mb-6">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">CPF: {employee.cpf}</span>
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Building className="w-3 h-3 text-emerald-500" />
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Empresa Vinculada</span>
                  </div>
                  <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase leading-tight line-clamp-2">
                    {employee.empresaNome}
                  </p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">CNPJ: {employee.empresaCnpj}</p>
                </div>

                <div className="flex items-center gap-2 opacity-50">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Vinc. em: {employee.updatedAt?.toDate().toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleVerAsos(employee)}
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
            <User className="w-8 h-8 text-slate-200 dark:text-slate-700" />
          </div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Nenhum funcionário encontrado</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tente importar um ASO para identificar novos funcionários automaticamente.</p>
        </div>
      )}

      {/* Modal Ver ASOs do Funcionário */}
      <AnimatePresence>
        {selectedEmployee && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEmployee(null)}
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
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase leading-tight mb-1">
                      ASOs do Funcionário
                    </h3>
                    <p className="text-xs font-black text-emerald-500 uppercase tracking-widest">
                      {selectedEmployee.nome}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEmployee(null)}
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
                ) : employeeAsos.length > 0 ? (
                  <div className="space-y-4">
                    {employeeAsos.map((aso) => (
                      <div key={aso.id} className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center border border-emerald-100 dark:border-emerald-800">
                            <FileText className="w-5 h-5 text-emerald-500" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight line-clamp-1">{aso.empresaNome}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Importado em: {aso.createdAt?.toDate().toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isInternalAccount && (
                            <button 
                              onClick={() => handleDeleteAso(aso, selectedEmployee.empresaId)}
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
                            className="p-3 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Ver PDF</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <FileText className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Nenhum ASO encontrado para este funcionário nesta empresa.</p>
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

