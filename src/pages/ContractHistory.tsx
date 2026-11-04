import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import ThemeToggleButton from '../components/ThemeToggleButton';
import ScaleControl from '../components/ScaleControl';
import { 
  FileText, 
  ArrowLeft, 
  Download, 
  Search, 
  Calendar, 
  Building2, 
  ShieldCheck,
  History,
  Home,
  ExternalLink, 
  Loader2, 
  Trash2, 
  AlertTriangle, 
  X, 
  ChevronDown, 
  ChevronRight, 
  TrendingUp, 
  RefreshCw 
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, orderBy, getDocs, where, updateDoc, doc, deleteDoc, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getBrandingConfig, BrandingData } from '../services/brandingService';
import { siteImages } from '../config/siteImages';
import { contractService } from '../services/contractService';
import { logService } from '../services/logService';
import { isAsoWorker, canUserAccessContract } from '../utils/userClassification';

interface ContractRecord {
  id: string;
  empresa: string;
  tipoContrato: string;
  data: string;
  arquivoUrl: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  cidade: string;
  status?: 'pendente' | 'sucesso' | 'erro_upload';
  storagePath?: string;
  dataVencimentoContrato?: string;
  templateData?: any;
  formData?: any;
}

interface CompanyGroup {
  name: string;
  cnpj?: string;
  contracts: ContractRecord[];
  latestDate: number;
  count: number;
  status: 'active' | 'expiring' | 'expired';
  statusLabel: string;
  statusColor: string;
}

export default function ContractHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userData, isAdmin } = useAuth();
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeExpirationFilter, setActiveExpirationFilter] = useState<'all' | '30days' | '7days' | 'expired'>('all');
  const [expandedCompanies, setExpandedCompanies] = useState<string[]>([]);
  const [contractToDelete, setContractToDelete] = useState<ContractRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Guard access for ASO worker
  useEffect(() => {
    if (userData && isAsoWorker(userData)) {
      console.log("CONTRACT_ROUTE_BLOCKED_ASO_USER", userData.email);
      navigate("/meus-asos", { replace: true });
    }
  }, [userData, navigate]);

  // Handle highlight state from notifications
  useEffect(() => {
    if (location.state?.highlightCompany) {
      setExpandedCompanies(prev => [...new Set([...prev, location.state.highlightCompany])]);
      setSearchTerm(location.state.highlightCompany);
    }
  }, [location.state]);

  const fetchData = async (isLoadMore = false) => {
    console.log('HISTORICO_LOAD_START');
    try {
      setErrorState(null);
      if (!isLoadMore) {
        setLoading(true);
        setContracts([]);
        setLastVisible(null);
        setHasMore(true);
      } else {
        setIsFetchingMore(true);
      }

      if (!branding) {
        const brandingData = await getBrandingConfig();
        setBranding(brandingData);
      }

      if (user && userData) {
        // Run background migration for missing names (once per load)
        contractService.enrichMissingNames().then(count => {
          if (count > 0) {
            console.log(`[History] Migração: ${count} nomes de usuários corrigidos.`);
          }
        }).catch(() => {});

        console.log('CONTRACT_HISTORY_QUERY_START');
        const contractsRef = collection(db, 'contracts');
        let querySnapshot;
        let isUsingFallback = false;

        try {
          const constraints: any[] = [
            orderBy("createdAt", "desc")
          ];
          
          if (isLoadMore && lastVisible) {
            constraints.push(startAfter(lastVisible));
          }
          constraints.push(limit(500));

          const q = query(contractsRef, ...constraints);
          querySnapshot = await getDocs(q);
        } catch (queryErr: any) {
          console.warn('[History] Query primária ordenada falhou. Usando consulta fallback.', queryErr);
          
          isUsingFallback = true;
          const fallbackConstraints: any[] = [];
          if (isLoadMore && lastVisible) {
            fallbackConstraints.push(startAfter(lastVisible));
          }
          fallbackConstraints.push(limit(500));

          const fbQ = query(contractsRef, ...fallbackConstraints);
          querySnapshot = await getDocs(fbQ);
        }
        
        if (querySnapshot.empty) {
          setHasMore(false);
          if (!isLoadMore) setContracts([]);
          console.log('CONTRACT_HISTORY_QUERY_SUCCESS', { count: 0 });
          console.log('HISTORICO_LOAD_SUCCESS', { count: 0 });
          console.log('CONTRACT_QUERY_RESULT_COUNT', 0);
          return;
        }

        const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        setLastVisible(lastDoc);
        if (querySnapshot.size < 20) {
          setHasMore(false);
        }

        let newDocs: ContractRecord[] = [];
        const now = new Date().getTime();
        const fifteenMinutes = 15 * 60 * 1000;

        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const contractObj = { id: docSnap.id, ...data };

          // Filter by secure contract permissions
          if (!canUserAccessContract(userData, contractObj)) {
            return;
          }
          
          const getSafeTime = (fieldVal: any) => {
            if (!fieldVal) return null;
            if (typeof fieldVal === 'object' && fieldVal.seconds !== undefined) {
              return fieldVal.seconds * 1000;
            }
            if (typeof fieldVal === 'object' && fieldVal.toDate) {
              return fieldVal.toDate().getTime();
            }
            const parsed = new Date(fieldVal).getTime();
            return isNaN(parsed) ? null : parsed;
          };

          const rawCreatedAt = getSafeTime(data.createdAt) 
            || getSafeTime(data.updatedAt) 
            || getSafeTime(data.dataCriacao) 
            || getSafeTime(data.data) 
            || now;
          
          let status = data.status;
          if (status === 'pendente' && (now - rawCreatedAt) > fifteenMinutes) {
            status = 'erro_upload';
            updateDoc(doc(db, 'contracts', docSnap.id), { 
              status: 'erro_upload', 
              errorMsg: 'Tempo limite excedido (Cleanup automático)' 
            }).catch(() => {});
          }

          newDocs.push({ 
            id: docSnap.id, 
            ...data, 
            status,
            _sortTimestamp: rawCreatedAt 
          } as ContractRecord);
        });

        if (isUsingFallback) {
          newDocs.sort((a: any, b: any) => b._sortTimestamp - a._sortTimestamp);
        }

        if (isLoadMore) {
          setContracts(prev => [...prev, ...newDocs]);
        } else {
          setContracts(newDocs);
        }
        
        console.log('CONTRACT_HISTORY_QUERY_SUCCESS', { count: newDocs.length });
        console.log('HISTORICO_LOAD_SUCCESS', { count: newDocs.length });
        console.log('CONTRACT_QUERY_RESULT_COUNT', newDocs.length);
      }
    } catch (error) {
      console.error('HISTORICO_LOAD_ERROR', error);
      console.error('Error fetching contracts:', error);
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      setErrorState('Não foi possível carregar o histórico de contratos.');

      if (user && userData) {
        logService.record(
          { uid: user.uid, nome: userData.nome, email: user.email },
          'ERRO_HISTORICO',
          `Erro ao buscar contratos: ${errorMsg}`
        ).catch(() => {});
      }

      // If index error occurs, we might need a fallback or message
      if (errorMsg.includes('requires an index')) {
        toast.error('Filtro avançado requer configuração de índice no Firestore.');
      }
    } finally {
      setLoading(false);
      setIsFetchingMore(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, activeExpirationFilter]);

  useEffect(() => {
    if (!loading) {
      console.log("COMPANY_CARD_ACTIVE_BADGE_LAYOUT_FIXED");
      console.log("UI_CONTRACTS_RENDER_COUNT", contracts.length);
      console.log("UI_PERMISSION_FILTER_APPLIED", {
        view: "contracts",
        userEmail: userData?.email,
        permission: userData?.verContratos || userData?.cidade || "Todos",
        count: contracts.length
      });
    }
  }, [contracts, loading, userData]);

  const handleDeleteRequest = (contract: ContractRecord) => {
    if (!isAdmin) {
      console.warn('[History] Tentativa de exclusão por usuário não-admin');
      toast.error('Somente um administrador pode excluir contratos.', {
        duration: 4000,
        position: 'top-center',
        style: {
          background: '#FEF2F2',
          border: '1px solid #FEE2E2',
          color: '#B91C1C',
          fontWeight: '900',
          fontSize: '12px'
        }
      });
      
      // Record unauthorized attempt
      if (userData) {
        logService.record(
          { uid: userData.uid, nome: userData.nome, email: userData.email },
          'EXCLUIR_CONTRATO',
          `BLOQUEADO: Tentativa de exluir contrato da empresa ${contract.empresa} (tipo ${contract.tipoContrato}) por funcionário.`
        ).catch(() => {});
      }
      return;
    }

    console.log('[History] Exclusão permitida para admin');
    setContractToDelete(contract);
  };

  const confirmDelete = async () => {
    if (!contractToDelete) return;
    
    // Safety check repeated in confirmation to be sure
    if (!isAdmin) {
      toast.error('Operação não permitida.');
      return;
    }
    
    console.log('[History] Confirmação aceita');
    console.log(`[History] Exclusão iniciada: ID=${contractToDelete.id}`);
    
    setIsDeleting(true);
    const toastId = toast.loading('Excluindo contrato...');

    try {
      await contractService.deleteContract(contractToDelete.id, contractToDelete.storagePath);
      
      // Record success log
      if (userData) {
        logService.record(
          { uid: userData.uid, nome: userData.nome, email: userData.email },
          'EXCLUIR_CONTRATO',
          `SUCESSO: Contrato da empresa ${contractToDelete.empresa} (tipo ${contractToDelete.tipoContrato}) excluído por administrador.`
        ).catch(() => {});
      }

      toast.success('Contrato excluído com sucesso!', { id: toastId });
      setContracts(prev => prev.filter(c => c.id !== contractToDelete.id));
      console.log(`[History] Exclusão concluída: ID=${contractToDelete.id}`);
      setContractToDelete(null);
    } catch (error: any) {
      console.error(`[History] Erro ao excluir: ${error.message || error}`);
      toast.error('Erro ao excluir contrato.', { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    console.log('[History] Exclusão cancelada pelo usuário');
    setContractToDelete(null);
  };

  const toggleCompany = (companyName: string) => {
    setExpandedCompanies(prev => 
      prev.includes(companyName) 
        ? prev.filter(name => name !== companyName)
        : [...prev, companyName]
    );
  };

  const getExpirationInfo = (vencimento: string | null | undefined) => {
    if (!vencimento) return { status: 'none' as const, label: 'Vencimento não informado', color: 'text-slate-400 bg-slate-50 border-slate-100', days: null };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vencDate = new Date(vencimento);
    vencDate.setHours(0, 0, 0, 0);
    const diffTime = vencDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { 
        status: 'expired' as const,
        label: `Vencido há ${Math.abs(diffDays)} dia${Math.abs(diffDays) === 1 ? '' : 's'}`, 
        color: 'text-red-700 bg-red-50 border-red-200',
        days: diffDays 
      };
    } else if (diffDays === 0) {
      return { status: 'expired' as const, label: 'Vence hoje', color: 'text-red-700 bg-red-50 border-red-200', days: 0 };
    } else if (diffDays < 30) {
      return { status: 'expiring' as const, label: `Vence em ${diffDays} dias`, color: 'text-red-700 bg-red-50 border-red-200', days: diffDays };
    } else if (diffDays <= 60) {
      return { status: 'active' as const, label: `Vence em ${diffDays} dias`, color: 'text-amber-700 bg-amber-50 border-amber-200', days: diffDays };
    } else {
      return { status: 'active' as const, label: `Vence em ${diffDays} dias`, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', days: diffDays };
    }
  };

  const filteredGroups = React.useMemo(() => {
    // 1. Local Search & Expiration Filter (Partial matches and expiration fallback)
    const filtered = contracts.filter(c => {
      // Expiration fallback filtering
      if (activeExpirationFilter !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString().split('T')[0];

        const venc = c.dataVencimentoContrato;
        if (!venc) return false;
        const vencDate = venc.split('T')[0];

        if (activeExpirationFilter === 'expired') {
          if (vencDate > todayIso) return false;
        } else if (activeExpirationFilter === '30days') {
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(today.getDate() + 30);
          const thirtyDaysIso = thirtyDaysFromNow.toISOString().split('T')[0];
          if (vencDate > thirtyDaysIso || vencDate < todayIso) return false;
        } else if (activeExpirationFilter === '7days') {
          const sevenDaysFromNow = new Date();
          sevenDaysFromNow.setDate(today.getDate() + 7);
          const sevenDaysIso = sevenDaysFromNow.toISOString().split('T')[0];
          if (vencDate > sevenDaysIso || vencDate < todayIso) return false;
        }
      }

      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        return c.empresa.toLowerCase().includes(term) || 
               c.tipoContrato.toLowerCase().includes(term);
      }
      return true;
    });

    // 2. Group
    const groupsMap = new Map<string, ContractRecord[]>();
    filtered.forEach(c => {
      if (!groupsMap.has(c.empresa)) {
        groupsMap.set(c.empresa, []);
      }
      groupsMap.get(c.empresa)!.push(c);
    });

    // 3. Create Group Objects
    const groups: CompanyGroup[] = Array.from(groupsMap.entries()).map(([name, groupContracts]) => {
      // Sort contracts within group from newest to oldest
      const sortedInGroup = [...groupContracts].sort((a, b) => 
        new Date(b.data).getTime() - new Date(a.data).getTime()
      );
      
      const latestContract = sortedInGroup[0];
      const cnpj = latestContract.templateData?.CNPJ || latestContract.formData?.cnpj || 'CNPJ não informado';
      
      // Determine overall status
      let overallStatus: 'active' | 'expiring' | 'expired' = 'active';
      let hasExpired = false;
      let hasExpiring = false;

      sortedInGroup.forEach(c => {
        const info = getExpirationInfo(c.dataVencimentoContrato);
        if (info.status === 'expired') hasExpired = true;
        if (info.status === 'expiring') hasExpiring = true;
      });

      if (hasExpired) overallStatus = 'expired';
      else if (hasExpiring) overallStatus = 'expiring';

      const statusConfig = {
        expired: { label: 'Possui contrato vencido', color: 'bg-red-500 shadow-red-500/20' },
        expiring: { label: 'Contrato próximo do vencimento', color: 'bg-amber-500 shadow-amber-500/20' },
        active: { label: 'Contratos ativos', color: 'bg-emerald-500 shadow-emerald-500/20' }
      };

      return {
        name,
        cnpj,
        contracts: sortedInGroup,
        latestDate: new Date(latestContract.data).getTime(),
        count: sortedInGroup.length,
        status: overallStatus,
        statusLabel: statusConfig[overallStatus].label,
        statusColor: statusConfig[overallStatus].color
      };
    });

    // 4. Sort Groups by latestDate (newest companies first)
    return groups.sort((a, b) => b.latestDate - a.latestDate);
  }, [contracts, searchTerm, activeExpirationFilter]);

  const formattedDate = (dateVal: any) => {
    if (!dateVal) return '---';
    try {
      let date: Date;
      if (typeof dateVal === 'object' && dateVal.seconds !== undefined) {
        date = new Date(dateVal.seconds * 1000);
      } else if (typeof dateVal === 'object' && dateVal.toDate) {
        date = dateVal.toDate();
      } else {
        date = new Date(dateVal);
      }
      if (isNaN(date.getTime())) return 'Inválido';
      return date.toLocaleDateString('pt-BR');
    } catch (e) {
      return 'Erro';
    }
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'Data não disponível';
    try {
      let date: Date;
      if (typeof dateVal === 'object' && dateVal.seconds !== undefined) {
        date = new Date(dateVal.seconds * 1000);
      } else if (typeof dateVal === 'object' && dateVal.toDate) {
        date = dateVal.toDate();
      } else {
        date = new Date(dateVal);
      }
      if (isNaN(date.getTime())) return 'Data inválida';
      
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Erro na data';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300">
      {/* Header fixo */}
      <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-emerald-500/10 dark:border-emerald-500/5 px-6 py-2.5 lg:py-3 xl:py-4 flex items-center justify-between sticky top-0 z-50 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] transition-all">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2.5 hover:bg-emerald-500/5 hover:text-emerald-500 rounded-2xl transition-all text-slate-400 border border-transparent hover:border-emerald-500/10 group"
          >
            <ArrowLeft className="w-5 h-5 xl:w-6 xl:h-6 transition-transform group-hover:-translate-x-1" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center p-1.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10 transition-all">
              <img 
                src={siteImages.logoPrincipal} 
                className="h-6 lg:h-7 xl:h-8 w-auto object-contain dark:brightness-110" 
                alt="Logo BioSegurança ArqMed" 
              />
            </div>
            <div className="hidden xs:flex items-center gap-2">
              <h1 className="text-[11px] xl:text-[13px] font-black text-slate-900 dark:text-white leading-tight uppercase tracking-[0.2em] transition-all">
                {branding?.companyName || 'BioSegurança ArqMed'}
              </h1>
              <span className="text-slate-200 dark:text-slate-800 mx-1">/</span>
              <h1 className="text-[11px] xl:text-[13px] font-black text-emerald-500 leading-tight uppercase tracking-[0.2em] transition-all">Todos os Contratos</h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ScaleControl />
          <ThemeToggleButton />
          
          <a 
            href="https://www.biosegurancaarqmed.com.br"
            className="text-slate-400 dark:text-slate-500 hover:text-emerald-500 transition-all p-2 rounded-2xl hover:bg-emerald-500/5 flex items-center gap-2 group border border-transparent hover:border-emerald-500/10"
            title="Voltar ao site"
          >
            <Home className="w-5 h-5 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] hidden lg:block">Site Institucional</span>
          </a>
        </div>
      </nav>

      <main className="flex-1 p-6 md:p-8 lg:p-8 xl:p-12 max-w-7xl w-full mx-auto">
        <div className="mb-8 xl:mb-12 flex flex-col lg:flex-row lg:items-end justify-between gap-10 lg:gap-6 xl:gap-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em]">Arquivo de Contratos</span>
            </div>
            <h2 className="text-4xl lg:text-3xl xl:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9] transition-all">
              Registro de <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-emerald-400">Emissões</span>
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold mt-4 max-w-xl opacity-80 text-xs xl:text-sm leading-relaxed transition-all">Repositório centralizado de conformidade. Monitore vigência de contratos e protocolos biossanitários com precisão técnica.</p>
            
            {userData && (
              <div className="mt-6 inline-flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-2xl shadow-sm">
                <div className={`p-1 rounded-lg ${isAdmin ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {isAdmin ? 'Acesso Global' : `Unidade: ${userData.verContratos || userData.cidade || '---'}`}
                </span>
              </div>
            )}
          </div>

          <div className="relative group w-full lg:w-80 xl:w-96 transition-all">
            <Search className="w-5 h-5 text-slate-300 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-emerald-500 transition-all" />
            <input 
              type="text"
              placeholder="Empresa ou CNPJ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 xl:py-5 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-[28px] text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 font-black text-sm focus:outline-none focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Filtros de Vencimento */}
        <div className="mb-10 flex flex-wrap items-center gap-4">
          {[
            { id: 'all', label: 'Toda a Base', icon: FileText },
            { id: '30days', label: 'Próximos 30 dias', icon: Calendar },
            { id: 'expired', label: 'Vencidos / Críticos', icon: AlertTriangle }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveExpirationFilter(f.id as any)}
              className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border transition-all active:scale-95 flex items-center gap-3 ${
                activeExpirationFilter === f.id 
                  ? 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 border-slate-950 dark:border-white shadow-xl shadow-slate-950/20'
                  : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200/50 dark:border-slate-800 hover:border-emerald-500/30 shadow-sm'
              }`}
            >
              <f.icon className={`w-4 h-4 ${activeExpirationFilter === f.id ? 'text-emerald-400' : ''}`} />
              {f.label}
            </button>
          ))}
        </div>

        {errorState ? (
          <div className="flex flex-col items-center justify-center p-24 bg-white dark:bg-slate-900 rounded-[40px] border border-red-500/20 dark:border-red-900/40 text-center shadow-[0_8px_30px_-10px_rgba(0,0,0,0.03)] transition-all">
            <div className="w-24 h-24 bg-red-50 dark:bg-red-950/40 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner border border-red-100 dark:border-red-900/30">
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
            <h4 className="text-2xl font-black text-slate-900 dark:text-white mb-3 tracking-tighter">Não foi possível carregar o histórico de contratos.</h4>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-10 font-bold text-sm leading-relaxed">
              Recarregue a página ou tente novamente mais tarde.
            </p>
            <button 
              onClick={() => fetchData()}
              className="px-10 py-5 bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-black uppercase tracking-[0.2em] text-[10px] rounded-[24px] hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              Tentar Novamente
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200/50 dark:border-slate-800 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.03)]">
            <div className="relative mb-6">
              <Loader2 className="w-16 h-16 text-emerald-500 animate-spin" />
              <div className="absolute inset-0 blur-2xl bg-emerald-500/20 animate-pulse" />
            </div>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] animate-pulse">Sincronizando Base de Dados...</p>
          </div>
        ) : filteredGroups.length > 0 ? (
          <div className="space-y-8">
            {filteredGroups.map((group, groupIndex) => (
              <motion.div
                key={group.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIndex * 0.05 }}
                className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200/50 dark:border-slate-800/80 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.03)] hover:shadow-2xl hover:shadow-emerald-500/5 transition-all group overflow-hidden"
              >
                {/* Header do Grupo (Empresa) */}
                <button
                  onClick={() => toggleCompany(group.name)}
                  className="w-full text-left p-6 xl:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6 xl:gap-8 hover:bg-emerald-500/[0.01] transition-all relative"
                >
                  <div className="flex items-center gap-6 xl:gap-8 relative z-10">
                    <div className={`w-16 h-16 xl:w-20 xl:h-20 rounded-[28px] flex items-center justify-center shadow-inner border border-transparent transition-all group-hover:scale-110 group-hover:rotate-3 ${
                      group.status === 'expired' ? 'bg-red-50 dark:bg-red-900/20 text-red-500 border-red-500/10' :
                      group.status === 'expiring' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500 border-amber-500/10' :
                      'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 border-emerald-500/10'
                    }`}>
                      <Building2 className="w-8 h-8 xl:w-10 xl:h-10 drop-shadow-sm transition-all" />
                    </div>
                    <div>
                      <h4 className="text-2xl xl:text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none mb-3 group-hover:text-emerald-500 transition-all">
                        {group.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <div className="flex items-center gap-2 text-slate-400">
                           <span className="text-[10px] font-black uppercase tracking-[0.2em]">{group.cnpj}</span>
                        </div>
                        <div className="w-1.5 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full" />
                        <div className="flex items-center gap-2 text-slate-500 px-3 py-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                          <History className="w-3.5 h-3.5 opacity-60" />
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            {group.count} {group.count === 1 ? 'Emissão' : 'Emissões'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 sm:gap-6 relative z-10 shrink-0">
                    <div className={`px-4 sm:px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.12em] sm:tracking-[0.15em] shadow-sm ${group.statusColor} text-white whitespace-nowrap min-w-[84px] sm:min-w-[150px] text-center`}>
                      {group.status === 'active' ? (
                        <>
                          <span className="hidden sm:inline">Contratos </span>Ativos
                        </>
                      ) : group.status === 'expiring' ? (
                        <>
                          <span className="hidden sm:inline">Expira </span>Breve
                        </>
                      ) : group.status === 'expired' ? (
                        <>
                          <span className="hidden sm:inline">Contrato </span>Vencido
                        </>
                      ) : (
                        group.statusLabel
                      )}
                    </div>
                    <div className="p-3 xl:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-slate-300 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm border border-transparent">
                      {expandedCompanies.includes(group.name) ? (
                        <ChevronDown className="w-5 h-5 xl:w-6 xl:h-6" />
                      ) : (
                        <ChevronRight className="w-5 h-5 xl:w-6 xl:h-6" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Sub-lista de Contratos */}
                <AnimatePresence>
                  {expandedCompanies.includes(group.name) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-slate-50/30 dark:bg-slate-950/20"
                    >
                      <div className="p-6 xl:p-8 pt-2 xl:pt-2">
                        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200/50 dark:border-slate-800 shadow-sm overflow-hidden">
                          <div className="grid grid-cols-12 gap-0 px-8 py-4 xl:py-5 border-b border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] hidden md:grid">
                            <div className="col-span-4">Documento</div>
                            <div className="col-span-2 text-center">Emissão</div>
                            <div className="col-span-3 text-center">Protocolo</div>
                            <div className="col-span-3 text-right">Ações</div>
                          </div>
                          
                          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                            {group.contracts.map((contract) => {
                              const expInfo = getExpirationInfo(contract.dataVencimentoContrato);
                              return (
                                <motion.div 
                                  layout
                                  key={contract.id}
                                  className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-4 xl:gap-6 p-6 xl:p-8 items-center hover:bg-emerald-500/[0.02] dark:hover:bg-emerald-500/[0.02] transition-all group/item"
                                >
                                  {/* Col 1: Bio / Icon */}
                                  <div className="col-span-1 md:col-span-4 flex items-center gap-5">
                                    <div className="w-14 h-14 bg-slate-50 dark:bg-slate-950 rounded-2xl flex items-center justify-center text-slate-300 dark:text-slate-700 group-hover/item:text-emerald-500 shadow-inner border border-slate-100 dark:border-slate-800 transition-all group-hover/item:scale-110">
                                      <FileText className="w-7 h-7" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tight">
                                        {contract.tipoContrato}
                                      </p>
                                      <p className="text-[10px] font-black text-slate-300 dark:text-slate-700 mt-1 uppercase tracking-[0.15em]">
                                        AUDITOR: {contract.usuarioNome}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Col 2: Date */}
                                  <div className="col-span-1 md:col-span-2 text-center">
                                    <div className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 font-black text-[11px] bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                      <Calendar className="w-3.5 h-3.5 opacity-40" />
                                      {formattedDate(contract.data)}
                                    </div>
                                  </div>

                                  {/* Col 3: Expiry */}
                                  <div className="col-span-1 md:col-span-3">
                                    <div className="flex flex-col items-center gap-2">
                                      <div className={`px-4 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-[0.15em] shadow-sm transition-all ${expInfo.color.replace('text-', 'border-').replace('text-red-700', 'border-red-500/20 text-red-500').replace('text-amber-700', 'border-amber-500/20 text-amber-500').replace('text-emerald-700', 'border-emerald-500/20 text-emerald-500')}`}>
                                        {expInfo.label}
                                      </div>
                                      <div className="text-[9px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-[0.2em]">
                                        Expira: {formattedDate(contract.dataVencimentoContrato)}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Col 5: Actions */}
                                  <div className="col-span-1 md:col-span-3 flex items-center justify-end gap-3">
                                    <button 
                                      onClick={() => navigate('/gerar-contrato', { state: { renovarContrato: contract } })}
                                      className="p-3.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-500/5 rounded-2xl transition-all border border-transparent hover:border-emerald-500/20 group/btn"
                                      title="Renovar Auditoria"
                                    >
                                      <RefreshCw className="w-5 h-5 transition-transform group-hover/btn:rotate-180 duration-500" />
                                    </button>
                                    
                                    {isAdmin && (
                                      <button 
                                        onClick={() => handleDeleteRequest(contract)}
                                        className="p-3.5 text-slate-300 hover:text-red-500 hover:bg-red-500/5 rounded-2xl transition-all border border-transparent hover:border-red-500/20"
                                        title="Eliminar Registro"
                                      >
                                        <Trash2 className="w-5 h-5" />
                                      </button>
                                    )}

                                    {contract.status === 'erro_upload' || (!contract.arquivoUrl && contract.status !== 'pendente') ? (
                                      <div className="p-3.5 text-red-500 bg-red-500/5 rounded-2xl border border-red-500/20" title="Integridade Comprometida">
                                        <AlertTriangle className="w-5 h-5" />
                                      </div>
                                    ) : contract.status === 'pendente' ? (
                                      <div className="p-3.5 text-emerald-500 bg-emerald-500/5 rounded-2xl border border-emerald-500/20">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                      </div>
                                    ) : (
                                      <a 
                                        href={contract.arquivoUrl || contract.pdfUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-3 px-6 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-slate-950/10 hover:shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all"
                                        title="Download Protocolo"
                                      >
                                        <Download className="w-5 h-5" />
                                        <span className="hidden lg:inline">Acessar</span>
                                      </a>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200/50 dark:border-slate-800 p-24 text-center shadow-[0_8px_30px_-10px_rgba(0,0,0,0.03)]">
            <div className="w-24 h-24 bg-slate-50 dark:bg-slate-950 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner group border border-slate-100 dark:border-slate-800">
              <History className="w-12 h-12 text-slate-200 dark:text-slate-800 group-hover:text-emerald-500 transition-colors" />
            </div>
            <h4 className="text-2xl font-black text-slate-900 dark:text-white mb-3 tracking-tighter">Nenhum contrato encontrado.</h4>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-10 font-bold text-sm leading-relaxed">
              {searchTerm 
                ? 'Sua busca não retornou documentos. Verifique os parâmetros ou normalize os filtros de vigência.' 
                : 'O diretório de auditoria está vazio. Emissões futuras serão consolidadas nesta área.'}
            </p>
            {searchTerm && (
              <button 
                onClick={() => {
                  setSearchTerm('');
                  setActiveExpirationFilter('all');
                }}
                className="px-10 py-5 bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-black uppercase tracking-[0.2em] text-[10px] rounded-[24px] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-950/20"
              >
                Resetar Filtros
              </button>
            )}
          </div>
        )}
      </main>

      {(hasMore || isFetchingMore) && contracts.length > 0 && (
        <div className="flex justify-center pb-20">
          <button
            onClick={() => fetchData(true)}
            disabled={isFetchingMore}
            className="flex items-center gap-3 px-10 py-5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200/50 dark:border-slate-800 rounded-[28px] font-black uppercase tracking-[0.2em] text-[10px] shadow-sm hover:shadow-xl hover:border-emerald-500/30 transition-all active:scale-95 disabled:opacity-50"
          >
            {isFetchingMore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                Carregando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 text-emerald-500" />
                Carregar Mais Documentos
              </>
            )}
          </button>
        </div>
      )}

      <footer className="p-16 text-center">
        <div className="h-px w-20 bg-emerald-500/20 mx-auto mb-8" />
        <p className="text-[10px] uppercase font-black tracking-[0.4em] text-slate-300 dark:text-slate-700 italic">
          {branding?.companyName || 'BioSegurança'} - Central de Inteligência Documental
        </p>
      </footer>

      {/* Modal de Confirmação de Exclusão */}
      <AnimatePresence>
        {contractToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={cancelDelete}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transition-colors"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white transition-colors">Excluir Contrato?</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium tracking-tight">Esta ação não pode ser desfeita.</p>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 mb-8 border border-slate-100 dark:border-slate-800 transition-colors">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Empresa / Tipo</p>
                  <p className="text-slate-900 dark:text-white font-black truncate transition-colors">{contractToDelete.empresa}</p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-bold transition-colors">{contractToDelete.tipoContrato}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={cancelDelete}
                    disabled={isDeleting}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={isDeleting}
                    className="flex-1 py-4 bg-red-500 text-white font-black rounded-2xl shadow-lg shadow-red-500/30 dark:shadow-red-900/40 hover:bg-red-600 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        EXCLUINDO...
                      </>
                    ) : (
                      'EXCLUIR'
                    )}
                  </button>
                </div>
              </div>
              
              <button 
                onClick={cancelDelete}
                className="absolute top-4 right-4 p-2 text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                disabled={isDeleting}
              >
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
