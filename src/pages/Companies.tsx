import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  Search, 
  ArrowLeft, 
  Home,
  ChevronRight, 
  FileText, 
  Calendar, 
  MapPin, 
  User, 
  Edit3, 
  ExternalLink, 
  Loader2,
  AlertCircle,
  X,
  History,
  Save,
  Trash2,
  ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { companyService, CompanyData } from '../services/companyService';
import { getBrandingConfig, BrandingData } from '../services/brandingService';
import { siteImages } from '../config/siteImages';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';
import { canUserAccessContract, canUserAccessCompany, isAsoWorker, normalizeAreaName } from '../utils/userClassification';

interface CompanyWithStats extends CompanyData {
  contractCount: number;
  lastContractDate: string | null;
  status: 'active' | 'expiring' | 'expired' | 'none';
}

export default function Companies() {
  const navigate = useNavigate();
  const { user, userData, isAdmin } = useAuth();
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [companies, setCompanies] = useState<CompanyWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithStats | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<CompanyData>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const brandingData = await getBrandingConfig();
      setBranding(brandingData);

      const allCompanies = await companyService.getAll();
      console.log('[Companies] Empresas carregadas:', allCompanies.length);

      const normalizeText = (text: any) => normalizeAreaName(text);
      const currentUserProfile = userData;

      console.log("COMPANIES_RAW_COUNT", allCompanies.length);
      console.log("CURRENT_USER_COMPANY_ACCESS", currentUserProfile);
      console.log("CURRENT_USER_PERMISSION_RAW", currentUserProfile?.permission || currentUserProfile?.verContratos);
      console.log("CURRENT_USER_PERMISSION_NORMALIZED", normalizeText(currentUserProfile?.permission || currentUserProfile?.verContratos));

      const permittedCompanies = allCompanies.filter((company) => canUserAccessCompany(userData, company));
      console.log("COMPANIES_FILTERED_COUNT", permittedCompanies.length);
      console.log('COMPANY_QUERY_RESULT_COUNT', permittedCompanies.length);

      const contractsRef = collection(db, 'contracts');
      
      console.log('CONTRACT_HISTORY_QUERY_START');
      const q = query(contractsRef, orderBy('createdAt', 'desc'));
      let snap;
      try {
        snap = await getDocs(q);
      } catch (err) {
        console.warn("[Companies] Fallback query used instead of ordered query.", err);
        const qFallback = query(contractsRef);
        snap = await getDocs(qFallback);
      }

      const allPermittedContracts: any[] = [];
      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as any;
        const contractObj = { id: docSnap.id, ...data };
        
        if (canUserAccessContract(userData, contractObj)) {
          allPermittedContracts.push(contractObj);
        }
      });

      console.log('CONTRACT_QUERY_RESULT_COUNT', allPermittedContracts.length);
      console.log('[Companies] Contratos carregados:', allPermittedContracts.length);

      // Helper for normalization
      const normalize = (text: string) => text?.trim().toLowerCase() || '';

      const companiesWithStats = permittedCompanies.map((company) => {
        const companyCnpj = company.cnpj.replace(/\D/g, '');
        const companyNameNorm = normalize(company.nome);

        // Relate contracts using CNPJ (priority) or Name
        const companyContracts = allPermittedContracts.filter(contract => {
          const contractCnpj = (contract.cnpj || contract.CNPJ || contract.templateData?.CNPJ || contract.formData?.cnpj || '')?.replace(/\D/g, '');
          
          if (contractCnpj && companyCnpj && contractCnpj === companyCnpj) {
            return true;
          }
          
          const contractEmpresaNorm = normalize(contract.empresa || contract.EMPRESA || '');
          return contractEmpresaNorm === companyNameNorm;
        });

        // Get last contract and status
        let status: 'active' | 'expiring' | 'expired' | 'none' = 'none';
        let lastDate = null;

        if (companyContracts.length > 0) {
          lastDate = companyContracts[0].data;
          const today = new Date();
          today.setHours(0,0,0,0);

          let hasExpired = false;
          let hasExpiring = false;

          companyContracts.forEach((c) => {
            if (c.dataVencimentoContrato) {
              const venc = new Date(c.dataVencimentoContrato);
              venc.setHours(0,0,0,0);
              const diff = Math.ceil((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              if (diff < 0) hasExpired = true;
              else if (diff <= 30) hasExpiring = true;
            }
          });

          if (hasExpired) status = 'expired';
          else if (hasExpiring) status = 'expiring';
          else status = 'active';
        }

        return {
          ...company,
          contractCount: companyContracts.length,
          lastContractDate: lastDate,
          status
        };
      });

      console.log('[Companies] Contagem por empresa:', companiesWithStats.map(c => `${c.nome}: ${c.contractCount}`));

      setCompanies(companiesWithStats);
    } catch (error) {
      console.error('Error fetching companies data:', error);
      if (error && typeof error === 'object' && ('code' in error || 'message' in error)) {
        const errObj = error as any;
        const msg = (errObj.message || '').toLowerCase();
        const code = (errObj.code || '').toLowerCase();
        if (code.includes('permission') || msg.includes('permission') || msg.includes('insufficient')) {
          console.error("FIRESTORE_RULES_INTERNAL_EMPLOYEE_BLOCKED", error);
        }
      }
      toast.error('Erro ao carregar dados das empresas.');
    } finally {
      setLoading(false);
    }
  };

  // Guard access for ASO worker
  useEffect(() => {
    if (userData && isAsoWorker(userData)) {
      console.log("COMPANY_ACCESS_ASO_BLOCKED", userData.email);
      navigate("/meus-asos", { replace: true });
    }
  }, [userData, navigate]);

  useEffect(() => {
    if (user && userData && !isAsoWorker(userData)) {
      fetchData();
    }
  }, [user, userData]);

  const filteredCompanies = useMemo(() => {
    return companies.filter(c => 
      c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.cnpj.includes(searchTerm.replace(/\D/g, ''))
    );
  }, [companies, searchTerm]);

  useEffect(() => {
    if (!loading) {
      console.log("UI_COMPANIES_RENDER_COUNT", filteredCompanies.length);
      console.log("UI_PERMISSION_FILTER_APPLIED", {
        view: "companies",
        userEmail: userData?.email,
        permission: userData?.verContratos || userData?.cidade || "Todos",
        count: filteredCompanies.length
      });
    }
  }, [filteredCompanies, loading, userData]);

  const handleEditClick = (company: CompanyWithStats) => {
    setEditForm({
      responsavel: company.responsavel,
      endereco: company.endereco,
      cep: company.cep,
      cidadeEstado: company.cidadeEstado,
      qntFuncionarios: company.qntFuncionarios,
      prazoContratoPadrao: company.prazoContratoPadrao,
      localForoPadrao: company.localForoPadrao
    });
    setIsEditMode(true);
  };

  const handleSave = async () => {
    if (!selectedCompany) return;
    setIsSaving(true);
    try {
      await companyService.upsert({
        ...selectedCompany,
        ...editForm,
        cnpj: selectedCompany.cnpj // Ensure CNPJ remains unchanged
      });
      toast.success('Empresa atualizada com sucesso!');
      setIsEditMode(false);
      fetchData(); // Refresh list
      // Update selected company view
      setSelectedCompany(prev => prev ? ({ ...prev, ...editForm }) : null);
    } catch (error) {
      console.error('Error saving company:', error);
      toast.error('Erro ao salvar alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  const formattedDate = (dateString: string | null) => {
    if (!dateString) return '---';
    return new Date(dateString).toLocaleDateString('pt-BR');
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
            <div className="flex items-center gap-2">
              <h1 className="text-[11px] xl:text-[13px] font-black text-slate-900 dark:text-white leading-tight uppercase tracking-[0.2em] transition-all hidden sm:block">
                {branding?.companyName || 'BioSegurança ArqMed'}
              </h1>
              <span className="text-slate-200 dark:text-slate-800 mx-1 hidden sm:block">/</span>
              <h1 className="text-[11px] xl:text-[13px] font-black text-emerald-500 leading-tight uppercase tracking-[0.2em] transition-all">Portfólio</h1>
            </div>
          </div>
        </div>

        <a 
          href="https://www.biosegurancaarqmed.com.br"
          className="text-slate-400 dark:text-slate-500 hover:text-emerald-500 transition-all p-2 rounded-2xl hover:bg-emerald-500/5 flex items-center gap-2 group border border-transparent hover:border-emerald-500/10"
          title="Voltar ao site"
        >
          <Home className="w-5 h-5 transition-transform group-hover:scale-110" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] hidden md:block">Site Institucional</span>
        </a>
      </nav>

      <main className="flex-1 p-6 md:p-8 lg:p-8 xl:p-12 max-w-7xl w-full mx-auto">
        <div className="mb-8 xl:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8 lg:gap-6 xl:gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em]">Diretório de Clientes</span>
            </div>
            <h2 className="text-4xl lg:text-3xl xl:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9] transition-all">
              Gestão de <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-emerald-400">Empresas</span>
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold mt-4 max-w-xl opacity-80 text-xs xl:text-sm leading-relaxed transition-all">Controle centralizado de cadastros corporativos e monitoramento síncrono de conformidade biossanitária.</p>
            
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

          <div className="relative group w-full md:w-80 xl:w-96 transition-all">
            <Search className="w-5 h-5 text-slate-300 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-emerald-500 transition-all" />
            <input 
              type="text"
              placeholder="Nome da empresa ou CNPJ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 xl:py-5 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-[28px] text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 font-black text-sm focus:outline-none focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 transition-all shadow-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando Clientes...</p>
          </div>
        ) : filteredCompanies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 xl:gap-6 transition-all">
            {filteredCompanies.map((company) => (
              <motion.div
                key={company.cnpj}
                layoutId={company.cnpj}
                onClick={() => setSelectedCompany(company)}
                whileHover={{ y: -5 }}
                className="bg-white dark:bg-slate-900 p-6 xl:p-8 rounded-[40px] border border-slate-200/50 dark:border-slate-800 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.03)] hover:shadow-2xl hover:shadow-emerald-500/5 hover:border-emerald-500/20 transition-all cursor-pointer group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/[0.02] rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                
                <div className="flex items-start justify-between mb-8">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border border-transparent transition-all group-hover:scale-110 group-hover:rotate-3 ${
                    company.status === 'expired' ? 'bg-red-50 dark:bg-red-900/20 text-red-500 border-red-500/10' :
                    company.status === 'expiring' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500 border-amber-500/10' :
                    company.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 border-emerald-500/10' :
                    'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200/50'
                  }`}>
                    <Building2 className="w-8 h-8 drop-shadow-sm" />
                  </div>
                  <div className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] transition-all shadow-sm ${
                    company.status === 'expired' ? 'bg-red-500 text-white shadow-red-500/20' :
                    company.status === 'expiring' ? 'bg-amber-500 text-white shadow-amber-500/20' :
                    company.status === 'active' ? 'bg-emerald-500 text-white shadow-emerald-500/20' :
                    'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {company.status === 'expired' ? 'Irregular' :
                     company.status === 'expiring' ? 'Atenção' :
                     company.status === 'active' ? 'Regular' : 'Inativa'}
                  </div>
                </div>

                <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight mb-2 truncate group-hover:text-emerald-500 transition-colors">
                  {company.nome}
                </h3>
                <p className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-[0.2em] mb-6">
                  ID: {company.cnpjFormatado || company.cnpj}
                </p>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100/60 dark:border-slate-800/60 items-center">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.15em] mb-1">Volume</p>
                    <div className="flex items-center gap-2">
                       <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                         <FileText className="w-3.5 h-3.5 text-slate-400" />
                       </div>
                       <span className="text-sm font-black text-slate-900 dark:text-slate-100">{company.contractCount} <span className="text-[10px] font-bold text-slate-400 line-height-none">docs</span></span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.15em] mb-1">Último Contrato</p>
                    <p className="text-sm font-black text-slate-900 dark:text-slate-100">{formattedDate(company.lastContractDate)}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-4xl border border-dashed border-slate-200 dark:border-slate-800 p-20 text-center transition-colors">
            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-700" />
            </div>
            <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2 transition-colors">Nenhuma empresa encontrada</h4>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {searchTerm ? 'Tente buscar com outros termos.' : 'As empresas cadastradas aparecerão aqui automaticamente.'}
            </p>
          </div>
        )}
      </main>

      {/* Modal de Detalhes / Edição */}
      <AnimatePresence>
        {selectedCompany && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isSaving) {
                  setSelectedCompany(null);
                  setIsEditMode(false);
                }
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            <motion.div
              layoutId={selectedCompany.cnpj}
              className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col transition-colors duration-300"
            >
              {/* Header Modal */}
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/50 transition-colors">
                <div className="flex items-center gap-5">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${
                    selectedCompany.status === 'expired' ? 'bg-red-500 text-white shadow-red-200 dark:shadow-red-900/20' :
                    selectedCompany.status === 'expiring' ? 'bg-amber-500 text-white shadow-amber-200 dark:shadow-amber-900/20' :
                    selectedCompany.status === 'active' ? 'bg-emerald-500 text-white shadow-emerald-200 dark:shadow-emerald-900/20' :
                    'bg-slate-500 text-white shadow-slate-200 dark:shadow-slate-900/20'
                  }`}>
                    <Building2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight mb-1 transition-colors">
                      {selectedCompany.nome}
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">
                        CNPJ: {selectedCompany.cnpjFormatado || selectedCompany.cnpj}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setSelectedCompany(null);
                    setIsEditMode(false);
                  }}
                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Corpo Modal */}
              <div className="flex-1 overflow-y-auto p-8">
                {isEditMode ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Representante Legal</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="text"
                            value={editForm.responsavel || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, responsavel: e.target.value }))}
                            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-brand-primary/10 transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">CEP</label>
                        <input 
                          type="text"
                          value={editForm.cep || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, cep: e.target.value }))}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-brand-primary/10 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Endereço Completo</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="text"
                          value={editForm.endereco || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, endereco: e.target.value }))}
                          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-brand-primary/10 transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Cidade / UF</label>
                        <input 
                          type="text"
                          value={editForm.cidadeEstado || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, cidadeEstado: e.target.value }))}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-brand-primary/10 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">QNT Funcionários (estimado)</label>
                        <input 
                          type="text"
                          value={editForm.qntFuncionarios || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, qntFuncionarios: e.target.value }))}
                          placeholder="Ex: 10-50"
                          className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-4 focus:ring-brand-primary/10 transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-6 border-t border-slate-100 dark:border-slate-800 transition-colors">
                      <button 
                        onClick={() => setIsEditMode(false)}
                        disabled={isSaving}
                        className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all uppercase text-xs tracking-widest"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 py-4 bg-brand-primary text-white font-black rounded-2xl shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                      >
                        {isSaving ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <><Save className="w-4 h-4" /> Salvar Alterações</>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-10">
                    {/* Grid de Informações */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0 transition-colors">
                          <User className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Representante Legal</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white transition-colors">{selectedCompany.responsavel || 'Não informado'}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0 transition-colors">
                          <MapPin className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Endereço</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white transition-colors">{selectedCompany.endereco || 'Não informado'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium transition-colors">{selectedCompany.cidadeEstado} {selectedCompany.cep && `• CEP: ${selectedCompany.cep}`}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0 transition-colors">
                          <Calendar className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Último Contrato</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white transition-colors">{formattedDate(selectedCompany.lastContractDate)}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0 transition-colors">
                          <FileText className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Volume de Documentos</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white transition-colors">{selectedCompany.contractCount} Contratos gerados</p>
                        </div>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="pt-10 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 transition-colors">
                      <button 
                        onClick={() => navigate('/contratos', { state: { highlightCompany: selectedCompany.nome } })}
                        className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-6 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-white/5 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase text-[10px] tracking-widest"
                      >
                        <History className="w-4 h-4" /> Ver Todos os Contratos
                      </button>
                      <button 
                        onClick={() => handleEditClick(selectedCompany)}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-black rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all uppercase text-[10px] tracking-widest"
                      >
                        <Edit3 className="w-4 h-4" /> Editar Cadastro
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={async () => {
                            if (window.confirm(`Tem certeza que deseja excluir ${selectedCompany.nome}? Isso não excluirá os contratos, apenas o cadastro da empresa.`)) {
                              await companyService.delete(selectedCompany.cnpj);
                              toast.success('Empresa excluída com sucesso.');
                              setSelectedCompany(null);
                              fetchData();
                            }
                          }}
                          className="flex items-center justify-center gap-2 px-6 py-4 bg-red-50 dark:bg-red-900/20 text-red-500 font-black rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-all uppercase text-[10px] tracking-widest"
                        >
                          <Trash2 className="w-4 h-4" /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="p-16 text-center">
        <div className="h-px w-20 bg-emerald-500/20 mx-auto mb-8" />
        <p className="text-[10px] uppercase font-black tracking-[0.4em] text-slate-300 dark:text-slate-700 italic">
          BioSegurança ArqMed - Proteção e Compliance
        </p>
      </footer>
    </div>
  );
}
