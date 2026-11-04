import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canUserAccessContract, isAsoWorker } from '../utils/userClassification';
import { getBrandingConfig, BrandingData } from '../services/brandingService';
import { siteImages } from '../config/siteImages';
import { Loader2, ArrowLeft, FileText, Download, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import ScaleControl from '../components/ScaleControl';
import ThemeToggleButton from '../components/ThemeToggleButton';
import PWAPrompt from '../components/PWAPrompt';
import toast from 'react-hot-toast';

export default function RecentFlows() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userData } = useAuth();
  
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 1. ASO Guard Block with redirection
  useEffect(() => {
    if (userData) {
      if (isAsoWorker(userData)) {
        console.warn("RECENT_FLOWS_ASO_BLOCKED", userData.email);
        toast.error("Acesso restrito ao Portal do Trabalhador.");
        navigate("/meus-asos", { replace: true });
      }
    }
  }, [userData, navigate]);

  // 2. Fetch recent flows data
  useEffect(() => {
    if (!user || !userData || isAsoWorker(userData)) return;

    const fetchRecentFlows = async () => {
      console.log("RECENT_FLOWS_PAGE_LOAD_START");
      setLoading(true);

      if (!branding) {
        const brandData = await getBrandingConfig();
        setBranding(brandData);
      }

      try {
        const contractsRef = collection(db, 'contracts');
        let querySnapshot;
        let rawCount = 0;

        try {
          // Fetch up to 500 records to be safe and extract recent ones
          const qRecent = query(contractsRef, orderBy("createdAt", "desc"), limit(500));
          querySnapshot = await getDocs(qRecent);
          rawCount = querySnapshot.size;
          console.log("RECENT_FLOWS_RAW_COUNT", rawCount);
        } catch (err) {
          console.warn("[RecentFlows] Quick index query failed, falling back.", err);
          const qFallback = query(contractsRef, limit(500));
          querySnapshot = await getDocs(qFallback);
          rawCount = querySnapshot.size;
          console.log("RECENT_FLOWS_RAW_COUNT", rawCount);
        }

        const filteredList: any[] = [];
        querySnapshot.docs.forEach(docSnap => {
          const cData = docSnap.data();
          const contractObj = { id: docSnap.id, ...cData };

          if (canUserAccessContract(userData, contractObj)) {
            filteredList.push(contractObj);
          }
        });

        // Date getter for strict client-side sorting
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

        // Order from most recent to oldest
        filteredList.sort((a, b) => getMs(b) - getMs(a));
        console.log("RECENT_FLOWS_FILTERED_COUNT", filteredList.length);
        
        console.log("RECENT_FLOWS_PERMISSION_FILTER_APPLIED", {
          userEmail: userData.email,
          permission: userData.verContratos || userData.cidade || userData.permission || "Todos",
          count: filteredList.length
        });

        setContracts(filteredList);
      } catch (error) {
        console.error("Error loading recent flows:", error);
        toast.error("Erro ao carregar fluxos recentes.");
      } finally {
        setLoading(false);
      }
    };

    fetchRecentFlows();
  }, [user, userData, branding]);

  // Date short formatter (same style as Dashboard)
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

  // Pagination logic
  const totalPages = Math.ceil(contracts.length / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = contracts.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => {
    if (!loading) {
      console.log("RECENT_FLOWS_RENDER_COUNT", currentItems.length);
    }
  }, [contracts, currentPage, loading, currentItems.length]);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      console.log("RECENT_FLOWS_PAGINATION_NEXT", { page: currentPage + 1 });
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      console.log("RECENT_FLOWS_PAGINATION_PREVIOUS", { page: currentPage - 1 });
      setCurrentPage(prev => prev - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white dark:bg-slate-950 transition-colors">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando Fluxos...</p>
        </div>
      </div>
    );
  }

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
              <h1 className="text-[11px] xl:text-[13px] font-black text-emerald-500 leading-tight uppercase tracking-[0.2em] transition-all">Fluxos Recentes</h1>
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

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 lg:p-8 xl:p-12 max-w-5xl w-full mx-auto">
        <div className="mb-8 xl:mb-12">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em]">Fluxo de Emissões</span>
          </div>
          <h2 className="text-4xl lg:text-3xl xl:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9] transition-all">
            Fluxos <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-emerald-400">Recentes</span>
          </h2>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-3">
            Visão focada dos últimos contratos emitidos e atualizados.
          </p>
        </div>

        {/* List Card Area */}
        <div className="bg-white dark:bg-slate-900 rounded-[24px] md:rounded-[40px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm overflow-hidden">
          {currentItems.length > 0 ? (
            <div className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
              {currentItems.map((contract) => (
                <div key={contract.id} className="p-4 md:p-7 flex flex-row items-center justify-between gap-3 md:gap-4 hover:bg-emerald-50/[0.03] dark:hover:bg-emerald-500/[0.02] transition-all group cursor-default">
                  <div className="flex items-center gap-3 md:gap-6 min-w-0">
                    <div className="w-10 h-10 md:w-14 md:h-14 bg-slate-50 dark:bg-slate-800/50 rounded-xl md:rounded-2xl flex items-center justify-center border border-slate-50 dark:border-slate-800 shrink-0">
                      <FileText className="w-5 h-5 md:w-7 md:h-7 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm md:text-lg font-black text-slate-900 dark:text-line-100 tracking-tight leading-tight truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {contract.empresa}
                      </p>
                      <p className="text-[9px] md:text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide mt-1 truncate opacity-70">
                        {contract.tipoContrato || 'Contrato'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-8 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs md:text-sm font-black text-slate-900 dark:text-slate-200">
                        {formatDateShort(contract.createdAt || contract.data)}
                      </p>
                    </div>
                    <a 
                      href={contract.arquivoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="h-9 w-9 md:h-12 md:w-12 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-600 hover:text-white rounded-xl md:rounded-2xl transition-all flex items-center justify-center shadow-sm border border-emerald-500/10"
                    >
                      <Download className="w-4 h-4 md:w-5 md:h-5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center">
              <FileText className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4 animate-pulse" />
              <p className="text-base font-black text-slate-900 dark:text-white tracking-tight">Nenhum fluxo recente encontrado</p>
              <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">Sua conta atual não possui registros vinculados ou visíveis.</p>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between px-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 text-xs md:text-sm font-black text-slate-500 dark:text-slate-400 hover:text-brand-primary dark:hover:text-emerald-400 rounded-xl transition-all disabled:opacity-40 disabled:pointer-events-none hover:shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-xs md:text-sm font-black text-slate-500 dark:text-slate-400">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 text-xs md:text-sm font-black text-slate-500 dark:text-slate-400 hover:text-brand-primary dark:hover:text-emerald-400 rounded-xl transition-all disabled:opacity-40 disabled:pointer-events-none hover:shadow-sm"
            >
              Próximo
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="p-6 md:p-12 text-center">
        <div className="max-w-5xl mx-auto border-t border-slate-100 dark:border-slate-900 pt-6 md:pt-10">
          <p className="text-[8px] md:text-[10px] uppercase font-black tracking-[0.2em] md:tracking-[0.4em] text-slate-300 dark:text-slate-700">
            BioSegurança ArqMed Technology Platform
          </p>
        </div>
      </footer>
      <PWAPrompt />
    </div>
  );
}
