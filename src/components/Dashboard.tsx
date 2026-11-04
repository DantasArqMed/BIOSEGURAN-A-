import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggleButton from './ThemeToggleButton';
import ScaleControl from './ScaleControl';
import { 
  ShieldCheck, 
  LogOut, 
  User as UserIcon, 
  Settings, 
  Bell, 
  Home,
  ChevronRight, 
  Activity, 
  FileStack, 
  History,
  Plus,
  Building2,
  Calendar,
  Users as UsersIcon,
  Download,
  FileText,
  Lock,
  ClipboardList,
  AlertCircle,
  Beaker
} from 'lucide-react';
import { getBrandingConfig, BrandingData } from '../services/brandingService';
import { siteImages } from '../config/siteImages';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, where, Timestamp, getCountFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logService } from '../services/logService';
import { usePWA } from '../hooks/usePWA';
import PWAPrompt from './PWAPrompt';
import { TEST_AREA_PUBLIC, TEST_ADMIN_EMAIL } from '../config/featureFlags';
import { isAsoWorker, canUserAccessContract, canUserAccessCompany, normalizeAreaName } from '../utils/userClassification';

interface RecentContract {
  id: string;
  empresa: string;
  tipoContrato: string;
  data: string;
  arquivoUrl: string;
}

interface ExpiryNotification {
  id: string;
  empresa: string;
  tipoContrato: string;
  dataVencimento: string;
  diasRestantes: number;
}

export default function Dashboard() {
  const { user, userData, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isInstallable, isInstalled, installApp } = usePWA();
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [recentContracts, setRecentContracts] = useState<RecentContract[]>([]);
  const [stats, setStats] = useState({
    ativos: 0,
    vencendo: 0,
    vencidos: 0,
    empresas: 0
  });
  const [notifications, setNotifications] = useState<ExpiryNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const notificationRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const canAccessTestArea = TEST_AREA_PUBLIC || user?.email === TEST_ADMIN_EMAIL;

  useEffect(() => {
    console.log("DASHBOARD_ACTIONS_ALIGNMENT_START");
    console.log("DASHBOARD_RESPONSIVE_ALIGNMENT_CHECK", {
      width: window.innerWidth,
      isDesktop: window.innerWidth >= 1024
    });
    console.log("DASHBOARD_ACTIONS_ALIGNMENT_SUCCESS");
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showNotifications && 
        notificationRef.current && 
        !notificationRef.current.contains(event.target as Node) &&
        bellButtonRef.current &&
        !bellButtonRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  useEffect(() => {
    if (!user || !userData) return;

    if (isAsoWorker(userData)) {
      console.log("CONTRACT_ROUTE_BLOCKED_ASO_USER", userData.email);
      navigate("/meus-asos", { replace: true });
      return;
    }

    const loadData = async () => {
      setLoadingStats(true);
      const bData = await getBrandingConfig();
      setBranding(bData);

      try {
        const contractsRef = collection(db, 'contracts');
        const companiesRef = collection(db, 'companies');
        
        console.log('CONTRACT_HISTORY_QUERY_START');
        let querySnapshot;
        try {
          const qAll = query(contractsRef, orderBy("createdAt", "desc"), limit(500));
          querySnapshot = await getDocs(qAll);
        } catch (err) {
          console.warn("[Dashboard] Fallback query used instead of ordered query.", err);
          const qFallback = query(contractsRef, limit(500));
          querySnapshot = await getDocs(qFallback);
        }

        let allContracts: any[] = [];
        querySnapshot.docs.forEach(docSnap => {
          const cData = docSnap.data();
          const contractObj = { id: docSnap.id, ...cData };
          
          if (canUserAccessContract(userData, contractObj)) {
            allContracts.push(contractObj);
          }
        });

        console.log('CONTRACT_QUERY_RESULT_COUNT', allContracts.length);

        const getMs = (item: any) => {
          if (item.createdAt) {
            return item.createdAt.seconds ? item.createdAt.seconds * 1000 : new Date(item.createdAt).getTime();
          }
          if (item.updatedAt) {
            return item.updatedAt.seconds ? item.updatedAt.seconds * 1000 : new Date(item.updatedAt).getTime();
          }
          if (item.dataCriacao) {
            return new Date(item.dataCriacao).getTime();
          }
          if (item.data) {
            return new Date(item.data).getTime();
          }
          return 0;
        };

        allContracts.sort((a, b) => getMs(b) - getMs(a));

        const docsRecent = allContracts.slice(0, 4);
        setRecentContracts(docsRecent);
        console.log('DASHBOARD_RECENT_CONTRACTS_QUERY_SUCCESS', { count: docsRecent.length });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString().split('T')[0];

        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);
        const thirtyDaysIso = thirtyDaysFromNow.toISOString().split('T')[0];

        let vencendo = 0;
        let vencidos = 0;
        const expiryList: ExpiryNotification[] = [];

        allContracts.forEach(data => {
          const expirationVal = data.dataVencimentoContrato;
          if (!expirationVal) return;

          const vencDate = new Date(expirationVal);
          vencDate.setHours(0, 0, 0, 0);
          
          const diffTime = vencDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays < 0) {
            vencidos++;
          } else if (diffDays <= 30) {
            vencendo++;
          }

          if (diffDays <= 30) {
            expiryList.push({
              id: data.id,
              empresa: data.empresa,
              tipoContrato: data.tipoContrato,
              dataVencimento: data.dataVencimentoContrato,
              diasRestantes: diffDays
            });
          }
        });

        let uniquePermittedCompaniesCount = 0;
        
        try {
          const allCompaniesSnap = await getDocs(companiesRef);
          const allCompanies = allCompaniesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          
          const matchingCompanies = allCompanies.filter((company) => canUserAccessCompany(userData, company));
          uniquePermittedCompaniesCount = matchingCompanies.length;
          console.log('COMPANY_QUERY_RESULT_COUNT', uniquePermittedCompaniesCount);
        } catch (compErr) {
          console.warn("[Dashboard] Fallback count for companies from contracts list unique names", compErr);
          if (compErr && typeof compErr === 'object' && ('code' in compErr || 'message' in compErr)) {
            const errObj = compErr as any;
            const msg = (errObj.message || '').toLowerCase();
            const code = (errObj.code || '').toLowerCase();
            if (code.includes('permission') || msg.includes('permission') || msg.includes('insufficient')) {
              console.error("FIRESTORE_RULES_INTERNAL_EMPLOYEE_BLOCKED", compErr);
            }
          }
          const uniqueCompanyNames = new Set(allContracts.map(c => c.empresa.trim().toLowerCase()));
          uniquePermittedCompaniesCount = uniqueCompanyNames.size;
        }

        const totalAtivos = allContracts.length - vencidos;

        setStats({
          ativos: totalAtivos > 0 ? totalAtivos : 0,
          vencendo,
          vencidos,
          empresas: uniquePermittedCompaniesCount
        });

        expiryList.sort((a, b) => {
          if (a.diasRestantes < 0 && b.diasRestantes < 0) return a.diasRestantes - b.diasRestantes;
          if (a.diasRestantes < 0) return -1;
          if (b.diasRestantes < 0) return 1;
          return a.diasRestantes - b.diasRestantes;
        });

        setNotifications(expiryList);

      } catch (err) {
        console.error("Error loading dashboard stats:", err);
        if (user && userData) {
          logService.record(
            { uid: user.uid, nome: userData.nome, email: user.email },
            'ERRO_DASHBOARD',
            `Erro ao carregar dashboard: ${err instanceof Error ? err.message : String(err)}`
          ).catch(() => {});
        }
      } finally {
        setLoadingStats(false);
      }
    };
    loadData();
  }, [user, userData, isAdmin]);

  useEffect(() => {
    if (!loadingStats) {
      console.log("UI_DASHBOARD_RENDER_COUNT", {
        ativos: stats.ativos,
        vencendo: stats.vencendo,
        vencidos: stats.vencidos,
        empresas: stats.empresas
      });
      console.log("UI_FLOW_RECENT_RENDER_COUNT", recentContracts.length);
      console.log("UI_PERMISSION_FILTER_APPLIED", {
        view: "dashboard",
        userEmail: userData?.email,
        permission: userData?.verContratos || userData?.cidade || "Todos",
        stats
      });
    }
  }, [stats, recentContracts, loadingStats, userData]);

  const formatDateShort = (dateVal: any) => {
    if (!dateVal) return "---";
    let date: Date;
    if (dateVal && typeof dateVal === 'object' && dateVal.seconds !== undefined) {
      date = new Date(dateVal.seconds * 1000);
    } else if (dateVal && typeof dateVal === 'object' && dateVal.toDate) {
      date = dateVal.toDate();
    } else {
      date = new Date(dateVal);
    }
    if (isNaN(date.getTime())) return "Inválido";
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };


  return (
    <div className="min-h-screen bg-[#fcfdfc] dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300">
      {/* Navbar Superior */}
      <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-emerald-500/10 dark:border-emerald-500/5 px-4 md:px-6 py-2.5 lg:py-3 xl:py-4 flex items-center justify-between sticky top-0 z-50 shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] transition-all">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex items-center justify-center p-1.5 md:p-2 bg-emerald-500/5 rounded-xl md:rounded-2xl border border-emerald-500/10 shadow-sm">
            <img 
              src={siteImages.logoPrincipal} 
              className="h-6 md:h-7 xl:h-8 w-auto object-contain dark:brightness-110" 
              alt="Logo BioSegurança ArqMed" 
            />
          </div>
          <span className="text-sm lg:text-base xl:text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase hidden xs:block">
            {branding?.companyName || 'BioSegurança ArqMed'}
          </span>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
          <ScaleControl />
          <ThemeToggleButton />

          {canAccessTestArea && (
            <button 
              onClick={() => navigate('/teste')}
              className="text-slate-400 hover:text-emerald-500 transition-all p-2 rounded-xl border border-transparent hover:border-emerald-500/10 hover:bg-emerald-500/5 flex items-center gap-2 group"
              title="Área de Testes"
            >
              <Beaker className="w-5 h-5 transition-transform group-hover:scale-110 group-hover:rotate-12" />
              <span className="text-[10px] font-black uppercase tracking-widest hidden lg:block">Teste</span>
            </button>
          )}

          <a 
            href="https://www.biosegurancaarqmed.com.br"
            className="text-slate-400 hover:text-emerald-600 transition-all p-2 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 group"
            title="Voltar ao site"
          >
            <Home className="w-5 h-5 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-black uppercase tracking-widest hidden lg:block">Site Institucional</span>
          </a>

          {isInstallable && !isInstalled && (
            <button 
              onClick={installApp}
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-all p-2 rounded-xl border border-emerald-100 dark:border-emerald-800 hover:border-emerald-200 dark:hover:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 flex items-center gap-2 group"
              title="Instalar Aplicativo"
            >
              <Download className="w-5 h-5 transition-transform group-hover:scale-110" />
              <span className="text-[10px] font-black uppercase tracking-widest hidden lg:block">Instalar App</span>
            </button>
          )}

          <div className="relative">
            <button 
              ref={bellButtonRef}
              onClick={() => setShowNotifications(!showNotifications)}
              className={`text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all p-2 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 relative ${showNotifications ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200' : ''}`}
            >
              <Bell className="w-5 h-5 transition-transform group-hover:rotate-12" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 shadow-md animate-bounce-slow">
                  {notifications.length}
                </span>
              )}
            </button>

            {/* Dropdown de Notificações */}
            {showNotifications && (
              <div 
                ref={notificationRef}
                className="absolute right-0 mt-4 w-96 max-w-[calc(100vw-32px)] bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden ring-1 ring-black/[0.02]"
              >
                  <div className="p-6 border-b border-slate-50 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Centro de Alertas</h3>
                    <span className="text-[10px] font-bold text-slate-400 uppercase bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm">
                      {notifications.length} Contratos
                    </span>
                  </div>
                  
                  <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                    {notifications.length > 0 ? (
                      <div className="divide-y divide-slate-50 dark:divide-slate-800">
                        {notifications.map((notif) => (
                          <button
                            key={notif.id}
                            onClick={() => {
                              setShowNotifications(false);
                              navigate('/contratos', { state: { highlightCompany: notif.empresa } });
                            }}
                            className="w-full p-5 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-all flex items-start gap-4 group"
                          >
                            <div className={`mt-1 w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                              notif.diasRestantes < 0 || notif.diasRestantes === 0
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-500' 
                                : notif.diasRestantes <= 7 
                                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-500' 
                                  : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500'
                            }`}>
                              <AlertCircle className="w-5 h-5 transition-transform group-hover:scale-110" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate group-hover:text-brand-primary transition-colors mb-0.5">
                                {notif.empresa}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide mb-2 opacity-80">
                                {notif.tipoContrato}
                              </p>
                              <div className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter gap-1.5 ${
                                notif.diasRestantes < 0 || notif.diasRestantes === 0
                                  ? 'bg-red-500/10 text-red-600' 
                                  : notif.diasRestantes <= 7 
                                    ? 'bg-orange-500/10 text-orange-600' 
                                    : 'bg-emerald-500/10 text-emerald-600'
                              }`}>
                                {notif.diasRestantes < 0 
                                  ? <>Critico: Vencido</>
                                  : notif.diasRestantes === 0 
                                    ? <>Expira Hoje</>
                                    : notif.diasRestantes <= 7
                                      ? <>Urgente: {notif.diasRestantes} Dias</>
                                      : `${notif.diasRestantes} Dias Restantes`}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-700/50">
                          <Bell className="w-8 h-8 text-slate-200 dark:text-slate-700" />
                        </div>
                        <p className="text-sm text-slate-900 dark:text-white font-black uppercase tracking-widest mb-1">Tudo em Ordem</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium px-8">Não há alertas de vencimento hoje.</p>
                      </div>
                    )}
                  </div>
                  
                  {notifications.length > 0 && (
                    <button 
                      onClick={() => {
                        setShowNotifications(false);
                        navigate('/contratos');
                      }}
                      className="w-full p-5 text-center text-[10px] font-black text-slate-400 dark:text-slate-500 hover:text-brand-primary uppercase tracking-[0.2em] border-t border-slate-50/50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                      Auditores: Ver Detalhes
                    </button>
                  )}
                </div>
            )}
          </div>
          
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2 transition-colors hidden sm:block" />
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-black text-slate-900 dark:text-white leading-none tracking-tight">{userData?.nome || 'Funcionário'}</p>
              <div className="flex items-center justify-end gap-1.5 mt-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${userData?.tipo === 'admin' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}`}></span>
                <p className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-[0.1em]">
                  {userData?.tipo === 'admin' ? 'Sys Admin' : 'Equipe Técnica'}
                </p>
              </div>
            </div>
            <div className="w-10 h-10 lg:w-10 lg:h-10 xl:w-12 xl:h-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm flex items-center justify-center group hover:border-emerald-500/40 transition-all overflow-hidden cursor-pointer relative" onClick={() => navigate('/usuarios')}>
               <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors"></div>
               <UserIcon className="text-slate-400 dark:text-slate-500 w-5 h-5 xl:w-6 xl:h-6 group-hover:scale-110 group-hover:text-emerald-500 transition-all" />
            </div>
            <button 
              onClick={logout}
              className="ml-1 p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-2xl border border-transparent hover:border-red-100 dark:hover:border-red-900/30 shadow-none hover:shadow-sm"
              title="Encerrar Sessão"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-4 md:p-8 lg:p-8 xl:p-12 max-w-7xl w-full mx-auto">
        <header className="mb-4 md:mb-12 lg:mb-8 xl:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8">
          <div>
            <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-3">
              <span className="px-1.5 md:px-3 py-0.5 md:py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[8px] md:text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.15em] border border-brand-primary/20">Dashboard Ativo</span>
              <span className="text-slate-300 dark:text-slate-700 text-[9px] md:text-xs font-bold">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
            </div>
            <h2 className="text-xl md:text-4xl lg:text-3xl xl:text-4xl 2xl:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9]">
              Bem-vindo, <span className="text-emerald-600 dark:text-emerald-400">{userData?.nome ? userData.nome.split(' ')[0] : 'Funcionário'}</span>
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold mt-1.5 md:mt-4 max-w-xl leading-relaxed text-[10px] md:text-sm lg:text-sm xl:text-base opacity-80">
              Gerencie a conformidade biossanitária e emita novos contratos em tempo real.
            </p>
          </div>
          
          <button 
            onClick={() => navigate('/gerar-contrato')}
            className="flex items-center justify-center gap-2 md:gap-3 px-5 md:px-8 py-3.5 md:py-5 lg:py-4 xl:py-5 bg-brand-primary text-white font-black rounded-xl md:rounded-[24px] shadow-lg md:shadow-2xl shadow-brand-primary/40 hover:shadow-brand-primary/60 hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all group overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <Plus className="w-5 h-5 md:w-6 h-6 transition-transform group-hover:rotate-90" />
            <span className="uppercase tracking-widest text-[10px] md:text-xs">Gerar Novo Contrato</span>
          </button>
        </header>

        {/* Métricas Reais - Modernizadas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-6 lg:gap-4 xl:gap-6 mb-6 md:mb-12 lg:mb-8 xl:mb-12">
          <div className="bg-white dark:bg-slate-900 p-3.5 md:p-8 lg:p-5 xl:p-8 rounded-[20px] md:rounded-[40px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-[0_8px_40px_-12px_rgba(16,185,129,0.1)] flex flex-col gap-2.5 md:gap-6 lg:gap-3 xl:gap-6 group hover:shadow-2xl hover:shadow-emerald-500/15 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-emerald-500/5 rounded-full blur-2xl md:blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className={`w-8 h-8 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg md:rounded-2xl flex items-center justify-center shadow-inner border border-emerald-500/10 ${loadingStats ? 'animate-pulse' : ''}`}>
              <ShieldCheck className="w-4 h-4 md:w-8 md:h-8 lg:w-6 lg:h-6 xl:w-8 xl:h-8 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
            </div>
            <div>
              <p className="text-[7px] md:text-[11px] lg:text-[10px] xl:text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] md:tracking-[0.2em] mb-0.5 md:mb-1">Contratos Ativos</p>
              <div className="flex items-baseline gap-1 md:gap-2">
                <p className="text-lg md:text-4xl lg:text-2xl xl:text-3xl 2xl:text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{loadingStats ? '...' : stats.ativos}</p>
                <span className="text-[7px] md:text-[10px] font-bold text-emerald-500 px-1 md:px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-md md:rounded-lg">ATIVO</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3.5 md:p-8 lg:p-5 xl:p-8 rounded-[20px] md:rounded-[40px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-[0_8px_40px_-12px_rgba(16,185,129,0.1)] flex flex-col gap-2.5 md:gap-6 lg:gap-3 xl:gap-6 group hover:shadow-2xl hover:shadow-amber-500/10 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-amber-500/5 rounded-full blur-2xl md:blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className={`w-8 h-8 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-amber-50 dark:bg-amber-900/20 rounded-lg md:rounded-2xl flex items-center justify-center shadow-inner border border-amber-500/10 ${loadingStats ? 'animate-pulse' : ''}`}>
              <Calendar className="w-4 h-4 md:w-8 md:h-8 lg:w-6 lg:h-6 xl:w-8 xl:h-8 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]" />
            </div>
            <div>
              <p className="text-[7px] md:text-[11px] lg:text-[10px] xl:text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] md:tracking-[0.2em] mb-0.5 md:mb-1">Expira em 30d</p>
              <div className="flex items-baseline gap-1 md:gap-2">
                <p className="text-lg md:text-4xl lg:text-2xl xl:text-3xl 2xl:text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{loadingStats ? '...' : stats.vencendo}</p>
                <span className="text-[7px] md:text-[10px] font-bold text-amber-500 px-1 md:px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 rounded-md md:rounded-lg italic">
                  {stats.vencendo === 1 ? 'Alerta' : 'Alertas'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3.5 md:p-8 lg:p-5 xl:p-8 rounded-[20px] md:rounded-[40px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-[0_8px_40px_-12px_rgba(16,185,129,0.1)] flex flex-col gap-2.5 md:gap-6 lg:gap-3 xl:gap-6 group hover:shadow-2xl hover:shadow-red-500/10 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-red-500/5 rounded-full blur-2xl md:blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className={`w-8 h-8 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-red-50 dark:bg-red-900/20 rounded-lg md:rounded-2xl flex items-center justify-center shadow-inner border border-red-500/10 ${loadingStats ? 'animate-pulse' : ''}`}>
              <AlertCircle className="w-4 h-4 md:w-8 md:h-8 lg:w-6 lg:h-6 xl:w-8 xl:h-8 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]" />
            </div>
            <div>
              <p className="text-[7px] md:text-[11px] lg:text-[10px] xl:text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] md:tracking-[0.2em] mb-0.5 md:mb-1">Vencidos</p>
              <div className="flex items-baseline gap-1 md:gap-2">
                <p className="text-lg md:text-4xl lg:text-2xl xl:text-3xl 2xl:text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{loadingStats ? '...' : stats.vencidos}</p>
                <span className="text-[7px] md:text-[10px] font-bold text-red-500 px-1 md:px-2 py-0.5 bg-red-50 dark:bg-red-900/30 rounded-md md:rounded-lg italic">Crítico</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3.5 md:p-8 lg:p-5 xl:p-8 rounded-[20px] md:rounded-[40px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-[0_8px_40px_-12px_rgba(16,185,129,0.1)] flex flex-col gap-2.5 md:gap-6 lg:gap-3 xl:gap-6 group hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-blue-500/5 rounded-full blur-2xl md:blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className={`w-8 h-8 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-blue-50 dark:bg-blue-900/20 rounded-lg md:rounded-2xl flex items-center justify-center shadow-inner border border-blue-500/10 ${loadingStats ? 'animate-pulse' : ''}`}>
              <Building2 className="w-4 h-4 md:w-8 md:h-8 lg:w-6 lg:h-6 xl:w-8 xl:h-8 text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
            </div>
            <div>
              <p className="text-[7px] md:text-[11px] lg:text-[10px] xl:text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] md:tracking-[0.2em] mb-0.5 md:mb-1">Empresas</p>
              <div className="flex items-baseline gap-1 md:gap-2">
                <p className="text-lg md:text-4xl lg:text-2xl xl:text-3xl 2xl:text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{loadingStats ? '...' : stats.empresas}</p>
                <span className="text-[7px] md:text-[10px] font-bold text-blue-500 px-1 md:px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded-md md:rounded-lg">
                  {stats.empresas === 1 ? 'Empresa' : 'Empresas'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Grid Principal: Ações e Histórico Recente */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-6 xl:gap-10">
          
          {/* Lado Esquerdo: Ações Rápidas - 4 colunas */}
          <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-5 lg:gap-4 xl:gap-5">
            <div className="col-span-2 md:col-span-1 flex items-center gap-2 md:gap-3 px-2 mb-3 md:mb-6 h-6 md:h-8">
              <div className="w-1 md:w-1.5 h-3.5 md:h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
              <h3 className="text-[10px] md:text-lg font-black text-slate-900 dark:text-white tracking-tight uppercase">
                Ações
              </h3>
            </div>
            
            <button 
              onClick={() => navigate('/gerar-contrato')}
              className="w-full bg-white dark:bg-slate-900 p-3.5 md:p-6 lg:p-4 xl:p-6 rounded-[20px] md:rounded-[32px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-5 group hover:shadow-2xl hover:shadow-emerald-500/5 hover:border-emerald-500/30 hover:-translate-x-1 transition-all text-left min-h-[96px] md:min-h-[112px] lg:min-h-[100px] xl:min-h-[116px]"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5 min-w-0 flex-1">
                <div className="w-9 h-9 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-emerald-500/5 rounded-lg md:rounded-2xl flex items-center justify-center transition-all group-hover:rotate-6 group-hover:bg-emerald-500 group-hover:text-white shadow-sm border border-emerald-500/5 shrink-0">
                  <FileStack className="w-5 h-5 md:w-7 md:h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 text-emerald-500 group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Módulo</p>
                  <p className="text-sm md:text-xl lg:text-base xl:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">Novo Contrato</p>
                </div>
              </div>
              <div className="hidden md:flex w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center transition-all group-hover:bg-emerald-500/10 shrink-0">
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" />
              </div>
            </button>

            <button 
              onClick={() => navigate('/contratos')}
              className="w-full bg-white dark:bg-slate-900 p-3.5 md:p-6 lg:p-4 xl:p-6 rounded-[20px] md:rounded-[32px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-5 group hover:shadow-2xl hover:shadow-emerald-500/5 hover:border-emerald-500/30 hover:-translate-x-1 transition-all text-left min-h-[96px] md:min-h-[112px] lg:min-h-[100px] xl:min-h-[116px]"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5 min-w-0 flex-1">
                <div className="w-9 h-9 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-slate-50 dark:bg-slate-800/55 rounded-lg md:rounded-2xl flex items-center justify-center transition-all group-hover:rotate-6 group-hover:bg-slate-800 group-hover:text-white shadow-sm border border-slate-100 dark:border-slate-800 shrink-0">
                  <History className="w-5 h-5 md:w-7 md:h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 text-slate-500 group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Contratos</p>
                  <p className="text-sm md:text-xl lg:text-base xl:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">Todos os Contratos</p>
                </div>
              </div>
              <div className="hidden md:flex w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center transition-all group-hover:bg-slate-800/10 shrink-0">
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200" />
              </div>
            </button>

            <button 
              onClick={() => navigate('/empresas')}
              className="w-full bg-white dark:bg-slate-900 p-3.5 md:p-6 lg:p-4 xl:p-6 rounded-[20px] md:rounded-[32px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-5 group hover:shadow-xl hover:border-blue-500/20 hover:-translate-x-1 transition-all text-left min-h-[96px] md:min-h-[112px] lg:min-h-[100px] xl:min-h-[116px]"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5 min-w-0 flex-1">
                <div className="w-9 h-9 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-blue-50 dark:bg-blue-900/20 rounded-lg md:rounded-2xl flex items-center justify-center transition-all group-hover:rotate-6 group-hover:bg-blue-600 group-hover:text-white shadow-sm border border-blue-500/5 shrink-0">
                  <Building2 className="w-5 h-5 md:w-7 md:h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 text-blue-500 group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Base</p>
                  <p className="text-sm md:text-xl lg:text-base xl:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">Empresas</p>
                </div>
              </div>
              <div className="hidden md:flex w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center transition-all group-hover:bg-blue-100 shrink-0">
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </div>
            </button>

            {isAdmin && (
              <>
                <button 
                  onClick={() => navigate('/usuarios')}
                  className="w-full bg-white dark:bg-slate-900 p-3.5 md:p-6 lg:p-4 xl:p-6 rounded-[20px] md:rounded-[32px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-5 group hover:shadow-xl hover:border-amber-500/20 hover:-translate-x-1 transition-all text-left min-h-[96px] md:min-h-[112px] lg:min-h-[100px] xl:min-h-[116px]"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5 min-w-0 flex-1">
                    <div className="w-9 h-9 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-amber-50 dark:bg-amber-900/20 rounded-lg md:rounded-2xl flex items-center justify-center transition-all group-hover:rotate-6 group-hover:bg-amber-500 group-hover:text-white shadow-sm border border-amber-500/5 shrink-0">
                      <UsersIcon className="w-5 h-5 md:w-7 md:h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 text-amber-500 group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Equipe</p>
                      <p className="text-sm md:text-xl lg:text-base xl:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">Usuários</p>
                    </div>
                  </div>
                  <div className="hidden md:flex w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center transition-colors group-hover:bg-amber-100 shrink-0">
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600" />
                  </div>
                </button>

                <button 
                  onClick={() => navigate('/logs')}
                  className="w-full bg-white dark:bg-slate-900 p-3.5 md:p-6 lg:p-4 xl:p-6 rounded-[20px] md:rounded-[32px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-5 group hover:shadow-xl hover:border-slate-900/20 hover:-translate-x-1 transition-all text-left min-h-[96px] md:min-h-[112px] lg:min-h-[100px] xl:min-h-[116px]"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5 min-w-0 flex-1">
                    <div className="w-9 h-9 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-slate-900 dark:bg-slate-850 rounded-lg md:rounded-2xl flex items-center justify-center transition-all group-hover:rotate-6 shadow-sm border border-slate-900 shrink-0">
                      <ClipboardList className="w-5 h-5 md:w-7 md:h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Auditoria</p>
                      <p className="text-sm md:text-xl lg:text-base xl:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">Logs</p>
                    </div>
                  </div>
                  <div className="hidden md:flex w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-colors shrink-0">
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </button>
              </>
            )}
          </div>

          {/* Lado Direito: Últimos Contratos - 8 colunas */}
          <div className="lg:col-span-8">
             <div className="flex items-center justify-between px-2 mb-3 md:mb-6">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="w-1 md:w-1.5 h-3.5 md:h-6 bg-brand-primary rounded-full"></div>
                  <h3 className="text-[10px] md:text-lg font-black text-slate-900 dark:text-white tracking-tight uppercase">
                    Fluxo Recente
                  </h3>
                </div>
                <button 
                  onClick={() => navigate('/fluxos-recentes')}
                  className="px-2 md:px-4 py-1 md:py-2 bg-slate-50 dark:bg-slate-800 rounded-lg md:rounded-xl text-[8px] md:text-xs font-black text-slate-400 dark:text-slate-500 hover:text-brand-primary transition-all uppercase tracking-widest border border-transparent hover:border-brand-primary/20"
                >
                  Ver Tudo
                </button>
             </div>

             <div className="bg-white dark:bg-slate-900 rounded-[20px] md:rounded-[40px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm overflow-hidden">
                {recentContracts.length > 0 ? (
                  <div className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
                    {recentContracts.slice(0, 4).map((contract) => (
                      <div key={contract.id} className="p-3 md:p-7 lg:p-4 xl:p-7 flex flex-row items-center justify-between gap-3 md:gap-4 hover:bg-emerald-50/[0.03] dark:hover:bg-emerald-500/[0.02] transition-all group cursor-default">
                        <div className="flex items-center gap-3 md:gap-6 lg:gap-4 xl:gap-6 min-w-0">
                          <div className="w-9 h-9 md:w-14 md:h-14 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-slate-50 dark:bg-slate-800/50 rounded-lg md:rounded-2xl flex items-center justify-center border border-slate-50 dark:border-slate-800 shrink-0">
                            <FileText className="w-4 h-4 md:w-7 md:h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs md:text-lg lg:text-sm xl:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight leading-tight truncate group-hover:text-emerald-600 transition-colors">
                              {contract.empresa}
                            </p>
                            <p className="text-[8px] md:text-[11px] lg:text-[10px] xl:text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide mt-0.5 truncate opacity-70">
                              {contract.tipoContrato}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-10 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs md:text-sm lg:text-xs xl:text-sm font-black text-slate-900 dark:text-slate-200">{formatDateShort(contract.createdAt || contract.data)}</p>
                          </div>
                          <a 
                            href={contract.arquivoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="h-8 w-8 md:h-12 md:w-12 lg:h-10 lg:w-10 xl:h-12 xl:w-12 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-600 hover:text-white rounded-lg md:rounded-2xl transition-all flex items-center justify-center shadow-sm border border-emerald-500/10"
                          >
                            <Download className="w-3.5 h-3.5 md:w-5 md:h-5 lg:w-4 lg:h-4 xl:w-5 xl:h-5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-10 md:p-20 text-center">
                    <History className="w-8 h-8 md:w-10 md:h-10 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                    <p className="text-sm md:text-lg font-black text-slate-900 dark:text-white tracking-tight">Vazio</p>
                  </div>
                )}
             </div>

             <div className="mt-6 md:mt-8 p-4 md:p-8 bg-gradient-to-br from-brand-primary/5 to-emerald-500/5 rounded-[24px] md:rounded-[40px] border border-brand-primary/10 dark:border-brand-primary/5 flex flex-row items-center gap-4 md:gap-6">
                <div className="w-10 h-10 md:w-16 md:h-16 bg-white dark:bg-slate-800 rounded-xl md:rounded-3xl flex items-center justify-center shadow-md shrink-0">
                  <Activity className="w-5 h-5 md:w-8 md:h-8 text-brand-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs md:text-base font-black text-slate-900 dark:text-white tracking-tight">Performance</h4>
                  <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5 md:mt-1 line-clamp-1 md:line-clamp-none">Mantenha a base atualizada.</p>
                </div>
                <button 
                  onClick={() => navigate('/empresas')}
                  className="px-4 md:px-6 py-2 md:py-3 bg-white dark:bg-slate-800 text-brand-primary font-black rounded-lg md:rounded-2xl text-[9px] md:text-xs uppercase tracking-widest border border-brand-primary/20 hover:bg-brand-primary hover:text-white transition-all shadow-sm"
                >
                  Unidades
                </button>
             </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 md:p-12 text-center">
        <div className="max-w-7xl mx-auto border-t border-slate-100 dark:border-slate-900 pt-6 md:pt-10">
          <p className="text-[8px] md:text-[10px] uppercase font-black tracking-[0.2em] md:tracking-[0.4em] text-slate-300 dark:text-slate-700">
            BioSegurança ArqMed Technology Platform
          </p>
        </div>
      </footer>
      <PWAPrompt />
    </div>
  );
}
