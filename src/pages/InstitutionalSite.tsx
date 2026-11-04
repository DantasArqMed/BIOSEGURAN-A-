import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useTheme } from '../contexts/ThemeContext';
import { 
  Shield, 
  Stethoscope, 
  ClipboardCheck, 
  Database, 
  HardHat, 
  GraduationCap, 
  MessageCircle, 
  Phone, 
  Mail, 
  HeartPulse,
  BadgeCheck,
  Users,
  FileText,
  Building2, 
  ChevronRight,
  Menu,
  X,
  CheckCircle2,
  User,
  Sun,
  Moon,
  Instagram,
  MapPin,
  Loader2,
  Pencil,
  Plus,
  Save,
  RotateCcw,
  ImagePlus,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  LogOut,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { storage, db, auth } from '../lib/firebase';
import { siteImages } from '../config/siteImages';

const ADMIN_EMAILS = [
  'admin@admin.com',
  'davidallanos16@gmail.com',
  'bioseguranca@hotmail.com',
  'dantasarqmed@gmail.com'
];

export default function InstitutionalSite() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editModal, setEditModal] = useState<{ isOpen: boolean; section: string | null; cardId: string | null; data: any }>({
    isOpen: false,
    section: null,
    cardId: null,
    data: null
  });
  const [loginModal, setLoginModal] = useState({
    isOpen: false,
    email: '',
    password: '',
    showPassword: false,
    error: '',
    loading: false
  });
  const [highlightImages, setHighlightImages] = useState<Record<string, string>>({
    destaque1: siteImages.destaque1,
    destaque2: siteImages.destaque2,
    destaque3: siteImages.destaque3,
    oQueNosMove: siteImages.destaque4,
  });
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({});
  const [siteConfig, setSiteConfig] = useState<Record<string, any>>({});
  const [draftConfig, setDraftConfig] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeMobileServiceId, setActiveMobileServiceId] = useState<string | null>(null);
  const [activeMobileHighlightId, setActiveMobileHighlightId] = useState<string | null>(null);

  // Centralized admin check function
  const isAdminUser = (user: any) => {
    if (!user || !user.email) return false;
    return ADMIN_EMAILS.includes(user.email.toLowerCase());
  };

  // Check auth and admin status
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsAuthLoading(false);
      setCurrentUser(user);
      
      const admin = isAdminUser(user);
      setIsAdmin(admin);
      
      if (!admin) {
        setIsEditMode(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync all site configuration
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'siteConfig'), (snapshot) => {
      const data: Record<string, any> = {};
      snapshot.forEach(doc => {
        data[doc.id] = doc.data();
      });
      setSiteConfig(data);
      // Initialize draft if we are not in the middle of editing
      if (!isEditMode) {
        setDraftConfig(data);
        setHasChanges(false);
      }
    });
    return () => unsub();
  }, [isEditMode]);

  // If edit mode is toggled off, reset draft if no changes were saved
  React.useEffect(() => {
    if (!isEditMode && !hasChanges) {
      setDraftConfig(siteConfig);
    }
  }, [isEditMode, siteConfig, hasChanges]);

  React.useEffect(() => {
    const fetchImages = async () => {
      const paths = {
        destaque1: 'img/l1.png',
        destaque2: 'img/l2.png',
        destaque3: 'img/l3.png',
        oQueNosMove: 'img/l4.png',
      };

      for (const [key, path] of Object.entries(paths)) {
        setImageLoading(prev => ({ ...prev, [key]: true }));
        try {
          const url = await getDownloadURL(ref(storage, path));
          setHighlightImages(prev => ({ ...prev, [key]: url }));
          setImageErrors(prev => ({ ...prev, [key]: false }));
        } catch (err) {
          console.warn(`Could not fetch dynamic storage image ${path}, using default local fallback asset:`, err);
          // Do not set imageErrors to true here, so that siteImages local fallback can render
        } finally {
          setImageLoading(prev => ({ ...prev, [key]: false }));
        }
      }
    };

    fetchImages();
  }, []);

  const services = [
    { 
      id: 'servico1',
      firestoreKey: 'psicossocial',
      icon: <HeartPulse className="w-8 h-8" />, 
      title: draftConfig.servicos?.cards?.psicossocial?.title || "Soluções Avançadas — Riscos Psicossociais (NR 01)",
      description: draftConfig.servicos?.cards?.psicossocial?.description || "Estamos totalmente integrados às novas diretrizes da NR 01! Realizamos a avaliação e a gestão completa dos riscos psicossociais, garantindo a saúde mental e a segurança integral dos seus colaboradores.",
      imageUrl: draftConfig.servicos?.cards?.psicossocial?.imageUrl || null
    },
    { 
      id: 'servico2',
      firestoreKey: 'seguranca',
      icon: <HardHat className="w-8 h-8" />, 
      title: draftConfig.servicos?.cards?.seguranca?.title || "Segurança do Trabalho",
      description: draftConfig.servicos?.cards?.seguranca?.description || "A BioSegurança possui um amplo serviço de gestão para implantação e auditoria das normas regulamentadoras, tais como: PGR, PCMSO, LTCAT, PPP, CIPA e NRs diversas conforme a necessidade da empresa.",
      imageUrl: draftConfig.servicos?.cards?.seguranca?.imageUrl || null
    },
    { 
      id: 'servico3',
      firestoreKey: 'qualidade',
      icon: <BadgeCheck className="w-8 h-8" />, 
      title: draftConfig.servicos?.cards?.qualidade?.title || "Qualidade nos Serviços",
      description: draftConfig.servicos?.cards?.qualidade?.description || "A BioSegurança conta com profissionais capacitados e equipamentos modernos para garantir a qualidade nos serviços prestados, englobando Saúde Ocupacional, Segurança do Trabalho e Higiene Ocupacional.",
      imageUrl: draftConfig.servicos?.cards?.qualidade?.imageUrl || null
    },
    { 
      id: 'servico4',
      firestoreKey: 'saude',
      icon: <Stethoscope className="w-8 h-8" />, 
      title: draftConfig.servicos?.cards?.saude?.title || "Saúde Ocupacional",
      description: draftConfig.servicos?.cards?.saude?.description || "Oferecemos diversas soluções: Exames Admissional, Demissional, Periódicos, Mudança de Risco, Perícia Médica, Laboratoriais, Audiometria, Eletrocardiograma, Espirometria, Avaliação Psicossocial e Toxicológico.",
      imageUrl: draftConfig.servicos?.cards?.saude?.imageUrl || null
    },
    { 
      id: 'servico5',
      firestoreKey: 'assessorias',
      icon: <Users className="w-8 h-8" />, 
      title: draftConfig.servicos?.cards?.assessorias?.title || "Assessorias",
      description: draftConfig.servicos?.cards?.assessorias?.description || "Oferecemos suporte técnico personalizado em segurança do trabalho, saúde ocupacional e conformidade legal. Atuamos ao lado da sua equipe para garantir práticas seguras, consultoria especializada e o cumprimento das normas regulamentadoras (NRs).",
      imageUrl: draftConfig.servicos?.cards?.assessorias?.imageUrl || null
    },
    { 
      id: 'servico6',
      firestoreKey: 'laudos',
      icon: <FileText className="w-8 h-8" />, 
      title: draftConfig.servicos?.cards?.laudos?.title || "Laudos Técnicos",
      description: draftConfig.servicos?.cards?.laudos?.description || "Emitimos laudos e documentos técnicos exigidos por lei, como PGR, PCMSO, LTCAT e demais avaliações ocupacionais. Nossa equipe multidisciplinar assegura análises detalhadas e precisas, essenciais para a saúde e a segurança no ambiente de trabalho.",
      imageUrl: draftConfig.servicos?.cards?.laudos?.imageUrl || null
    },
    { 
      id: 'servico7',
      firestoreKey: 'arquitetura',
      icon: <Building2 className="w-8 h-8" />, 
      title: draftConfig.servicos?.cards?.arquitetura?.title || "Arquitetura",
      description: draftConfig.servicos?.cards?.arquitetura?.description || "Desenvolvemos projetos arquitetônicos voltados à funcionalidade, segurança e adequação às normas técnicas de acessibilidade e segurança do trabalho. Apoiamos desde a concepção até a execução de obras com foco em ambientes saudáveis e regulamentados.",
      imageUrl: draftConfig.servicos?.cards?.arquitetura?.imageUrl || null
    },
    { 
      id: 'servico8',
      firestoreKey: 'treinamentos',
      icon: <GraduationCap className="w-8 h-8" />, 
      title: draftConfig.servicos?.cards?.treinamentos?.title || "Treinamentos",
      description: draftConfig.servicos?.cards?.treinamentos?.description || "Realizamos treinamentos práticos e teóricos voltados à prevenção de acidentes, uso de EPIs, combate a incêndio, NR-10, NR-12, NR-18, NR-35, entre outros. Capacite a sua equipe com conteúdos atualizados e instrutores qualificados.",
      imageUrl: draftConfig.servicos?.cards?.treinamentos?.imageUrl || null
    }
  ];

  const highlights = [
    {
      id: 'destaque1',
      firestoreKey: 'ministerio',
      image: draftConfig.destaques?.cards?.ministerio?.imageUrl || highlightImages.destaque1 || siteImages.destaque1,
      title: draftConfig.destaques?.cards?.ministerio?.title || "Ministério do Trabalho e Emprego",
      subtitle: draftConfig.destaques?.cards?.ministerio?.subtitle || "",
      description: draftConfig.destaques?.cards?.ministerio?.description || "A BioSegurança atua em total conformidade, prestando serviços de qualidade nas áreas de Engenharia, Segurança e Medicina do Trabalho."
    },
    {
      id: 'destaque2',
      firestoreKey: 'esocial',
      image: draftConfig.destaques?.cards?.esocial?.imageUrl || highlightImages.destaque2 || siteImages.destaque2,
      title: draftConfig.destaques?.cards?.esocial?.title || "e-Social",
      subtitle: draftConfig.destaques?.cards?.esocial?.subtitle || "Integração com o eSocial",
      description: draftConfig.destaques?.cards?.esocial?.description || "Realizamos os envios e os lançamentos ao eSocial, mantendo a empresa segura contra possíveis multas por ausência de dados. Entre os envios, destacam-se os eventos S-2210, S-2220, S-2221, S-2230 e S-2240."
    },
    {
      id: 'destaque3',
      firestoreKey: 'laudos',
      image: draftConfig.destaques?.cards?.laudos?.imageUrl || highlightImages.destaque3 || siteImages.destaque3,
      title: draftConfig.destaques?.cards?.laudos?.title || "Laudos",
      subtitle: draftConfig.destaques?.cards?.laudos?.subtitle || "Programas e Laudos",
      description: draftConfig.destaques?.cards?.laudos?.description || "Implementamos e mantemos os programas vigentes, como PGR e PCMSO, além de emitirmos laudos técnicos, como o LTCAT, o Laudo de Insalubridade, o Laudo de Periculosidade e os Laudos Ergonômicos (AEP, AET)."
    },
    {
      id: 'move',
      firestoreKey: 'move',
      image: draftConfig.destaques?.cards?.move?.imageUrl || highlightImages.oQueNosMove || siteImages.destaque4,
      title: draftConfig.destaques?.cards?.move?.title || "O Que Nos Move",
      subtitle: draftConfig.destaques?.cards?.move?.subtitle || "",
      description: draftConfig.destaques?.cards?.move?.description || "A BioSegurança é uma empresa especializada em desenvolvimento, implantação e gerenciamento de programas de saúde ocupacional, engenharia e segurança do trabalho, ergonomia, higiene ocupacional, cursos e treinamentos. A nossa missão é oferecer excelência, transformando o ambiente de trabalho e protegendo o maior patrimônio de cada parceiro: os seus colaboradores."
    }
  ];

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginModal(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginModal.email, loginModal.password);
      if (!isAdminUser(userCredential.user)) {
        await signOut(auth);
        setLoginModal(prev => ({ ...prev, error: 'Este e-mail não possui permissão administrativa para edição do site.' }));
      } else {
        setLoginModal({ isOpen: false, email: '', password: '', showPassword: false, error: '', loading: false });
      }
    } catch (err: any) {
      console.error("Login error:", err);
      let message = "Erro ao realizar login. Verifique suas credenciais.";
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        message = "E-mail ou senha incorretos.";
      }
      setLoginModal(prev => ({ ...prev, error: message }));
    } finally {
      setLoginModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAdmin(false);
      setIsEditMode(false);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleEditClick = (section: string, cardId: string | null, currentData: any) => {
    if (!isAdmin || !isAdminUser(currentUser)) {
      alert("Acesso não autorizado.");
      setIsEditMode(false);
      return;
    }
    
    setEditModal({
      isOpen: true,
      section,
      cardId,
      data: { ...currentData }
    });
  };

  const handleSaveEdit = () => {
    if (!editModal.section || !editModal.data) return;
    
    setDraftConfig(prev => {
      const newConfig = { ...prev };
      const { firestoreKey, ...cleanData } = editModal.data;
      
      if (editModal.cardId && firestoreKey) {
        newConfig[editModal.section] = {
          ...newConfig[editModal.section],
          cards: {
            ...(newConfig[editModal.section]?.cards || {}),
            [firestoreKey]: cleanData
          }
        };
      } else {
        newConfig[editModal.section] = {
          ...newConfig[editModal.section],
          ...cleanData
        };
      }
      return newConfig;
    });
    
    setHasChanges(true);
    setEditModal({ isOpen: false, section: null, cardId: null, data: null });
  };

  const handleImageUpload = async (section: string, cardId: string | null, file: File, firestoreKey?: string) => {
    if (!isAdminUser(currentUser)) {
      alert("Acesso não autorizado.");
      setIsEditMode(false);
      return;
    }
    
    setIsSaving(true);
    try {
      const fileName = `${firestoreKey || cardId || 'image'}_${Date.now()}.${file.name.split('.').pop()}`;
      const storagePath = `img/site/${section}/${fileName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      setDraftConfig(prev => {
        const newConfig = { ...prev };
        if (cardId && firestoreKey) {
          newConfig[section] = {
            ...newConfig[section],
            cards: {
              ...(newConfig[section]?.cards || {}),
              [firestoreKey]: { 
                ...(newConfig[section]?.cards?.[firestoreKey] || {}),
                imageUrl: downloadURL 
              }
            }
          };
        } else if (firestoreKey) {
          newConfig[section] = {
            ...newConfig[section],
            [firestoreKey]: downloadURL
          };
        } else {
          newConfig[section] = {
            ...newConfig[section],
            imageUrl: downloadURL
          };
        }
        return newConfig;
      });
      setHasChanges(true);
    } catch (e: any) {
      console.error("Error uploading image:", e);
      alert(`Erro ao enviar imagem: ${e.message || 'Erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const persistChanges = async () => {
    if (!isAdminUser(currentUser)) {
      alert("Acesso não autorizado.");
      return;
    }
    setIsSaving(true);
    try {
      // Save each modified section to Firestore
      for (const section in draftConfig) {
        const docRef = doc(db, 'siteConfig', section);
        await setDoc(docRef, draftConfig[section], { merge: true });
      }
      setSiteConfig(draftConfig);
      setHasChanges(false);
      setSuccessMessage("Alterações salvas com sucesso!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error("Error persisting changes:", e);
      alert(`Erro ao salvar no banco: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const discardChanges = () => {
    if (confirm("Deseja realmente descartar todas as alterações feitas?")) {
      setDraftConfig(siteConfig);
      setHasChanges(false);
    }
  };

  const toggleEditMode = () => {
    if (isEditMode && hasChanges) {
      if (window.confirm("Você possui alterações não salvas. Deseja salvá-las antes de sair?")) {
        persistChanges();
        setIsEditMode(false);
      } else if (window.confirm("Deseja descartar as alterações e sair?")) {
        discardChanges();
        setIsEditMode(false);
      }
    } else {
      setIsEditMode(!isEditMode);
    }
  };

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 overflow-x-hidden transition-colors duration-300">
      {/* Header / Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-emerald-100 px-4 md:px-10 lg:px-12 py-2 lg:py-2.5 xl:py-4 h-[56px] lg:h-[64px] xl:h-[80px] flex items-center transition-all">
        <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 md:gap-3 lg:gap-4 cursor-pointer shrink-0" onClick={() => scrollTo('inicio')}>
            <img src={siteImages.logoPrincipal} alt="Logo BioSegurança ArqMed" className="h-6 md:h-8 lg:h-7 xl:h-10 w-auto transition-all" />
            <div className="hidden sm:block">
              <h1 className="text-base lg:text-sm xl:text-lg font-black text-slate-900 leading-none uppercase tracking-tighter transition-all">BioSegurança</h1>
              <p className="text-[10px] lg:text-[8px] xl:text-[10px] font-bold text-emerald-600 uppercase tracking-widest transition-all">ArqMed</p>
            </div>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-3 lg:gap-4 xl:gap-8 transition-all">
            {['Início', 'Serviços', 'Destaques', 'Sobre', 'Contato'].map((item) => (
              <button
                key={item}
                onClick={() => scrollTo(item.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))}
                className="text-[10px] lg:text-[11px] xl:text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors uppercase tracking-widest whitespace-nowrap"
              >
                {item}
              </button>
            ))}

            <div className="flex items-center gap-2 lg:gap-3 transition-all">
              {isAdmin ? (
                <>
                  <button
                    onClick={toggleEditMode}
                    className={`flex items-center gap-2 px-4 lg:px-5 xl:px-6 py-2 lg:py-2.5 rounded-full text-[10px] lg:text-[11px] xl:text-xs font-black uppercase tracking-widest transition-all shadow-lg ${
                      isEditMode 
                      ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-amber-100' 
                      : 'bg-slate-100 text-slate-600 border border-slate-200 shadow-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    <Pencil className={`w-3 h-3 lg:w-3.5 lg:h-3.5 ${isEditMode ? 'animate-pulse' : ''}`} />
                    {isEditMode ? 'Sair' : 'Modo Edição'}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-2 lg:p-2.5 rounded-full bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-slate-100"
                    title="Sair como admin"
                  >
                    <LogOut className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </button>
                </>
              ) : (
                !isAuthLoading && (
                  <button
                    onClick={() => setLoginModal(prev => ({ ...prev, isOpen: true }))}
                    className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-full text-[9px] lg:text-[10px] font-black text-slate-400 hover:text-emerald-600 transition-all uppercase tracking-widest"
                  >
                    <Lock className="w-3 h-3" />
                  </button>
                )
              )}
            </div>

            <a 
              href="https://app.biosegurancaarqmed.com.br/login"
              className="bg-emerald-600 text-white px-4 lg:px-5 xl:px-6 py-2 lg:py-2.5 rounded-full text-[10px] lg:text-[11px] xl:text-xs font-black uppercase tracking-widest hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-emerald-200"
            >
              Login
            </a>
          </div>

          {/* Mobile Toggle */}
          <div className="flex items-center gap-4 md:hidden">
            <button className="p-2 text-slate-600" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed inset-0 z-40 bg-white pt-20 px-8 flex flex-col md:hidden overflow-y-auto pb-10"
          >
            <div className="flex flex-col gap-4">
              {['Início', 'Serviços', 'Destaques', 'Sobre', 'Contato'].map((item) => (
                <button
                  key={item}
                  onClick={() => scrollTo(item.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))}
                  className="text-xl font-black text-slate-900 border-b border-slate-100 pb-3 text-left"
                >
                  {item}
                </button>
              ))}
            </div>

            <a href="https://app.biosegurancaarqmed.com.br/login" className="mt-6 bg-emerald-600 text-white text-center py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-emerald-200 shrink-0">
              Login no Sistema
            </a>

            {isAdmin ? (
              <div className="flex flex-col gap-3 mt-6 border-t border-slate-100 pt-6">
                <button
                  onClick={() => {
                    setIsEditMode(!isEditMode);
                    setIsMenuOpen(false);
                  }}
                  className={`py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 border transition-all ${
                    isEditMode 
                    ? 'bg-amber-100 text-amber-700 border-amber-200' 
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  <Pencil className={`w-5 h-5 ${isEditMode ? 'animate-pulse' : ''}`} />
                  {isEditMode ? 'Sair da Edição' : 'Modo Edição'}
                </button>
                <button
                  onClick={() => {
                    handleLogout();
                    setIsMenuOpen(false);
                  }}
                  className="py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 bg-red-50 text-red-600 border border-red-100"
                >
                  <LogOut className="w-5 h-5" />
                  Sair como Admin
                </button>
              </div>
            ) : (
              !isAuthLoading && (
                <button
                  onClick={() => {
                    setLoginModal(prev => ({ ...prev, isOpen: true }));
                    setIsMenuOpen(false);
                  }}
                  className="mt-4 py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 bg-slate-50 text-slate-400 border border-slate-100 shrink-0"
                >
                  <Lock className="w-5 h-5" />
                  Entrar como Admin
                </button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section id="inicio" className="relative w-screen overflow-hidden group pt-[56px] lg:pt-[64px] xl:pt-0 transition-all">
        <div className="relative w-full h-auto min-h-[160px] sm:min-h-[220px] lg:min-h-[240px] xl:min-h-[300px] md:h-auto overflow-hidden flex items-start justify-center bg-white">
          <img
            src={draftConfig.banner?.imageUrl || siteImages.bannerHome}
            alt="Banner BioSegurança ArqMed"
            className="w-full h-auto object-contain object-top block max-h-[70vh] xl:max-h-none transition-all"
          />
        </div>
        {isEditMode && (
          <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10 text-white">
            <input 
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload('banner', null, file);
              }}
            />
            <div className="flex flex-col items-center gap-2">
              <ImagePlus className="w-12 h-12" />
              <span className="text-xs font-black uppercase tracking-widest">Trocar Banner Principal</span>
            </div>
          </label>
        )}
      </section>


      {/* Services Section */}
      <section id="servicos" className="py-12 lg:py-16 xl:py-24 bg-gradient-to-b from-white via-emerald-50/30 to-white px-4 md:px-6 transition-all">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 lg:mb-12 xl:mb-20 px-2 transition-all">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <span className="inline-block px-4 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] lg:text-[9px] xl:text-[10px] font-black uppercase tracking-[0.2em] rounded-full mb-4">
                Excelência e Conformidade
              </span>
              <h3 className="text-[28px] md:text-5xl lg:text-3xl xl:text-5xl font-black text-slate-900 mb-4 xl:mb-6 tracking-tight leading-tight transition-all">Nossos Serviços</h3>
              <p className="text-slate-500 font-medium max-w-2xl mx-auto text-[15px] md:text-lg lg:text-sm xl:text-lg leading-relaxed transition-all">
                Soluções completas e personalizadas em Saúde e Segurança do Trabalho para proteger o seu maior patrimônio: as pessoas.
              </p>
              <div className="w-20 md:w-24 h-1 md:h-1.5 bg-gradient-to-r from-emerald-400 to-emerald-600 mx-auto rounded-full mt-6 xl:mt-8 transition-all" />
            </motion.div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-5 xl:gap-8 transition-all">
            {services.map((service, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                onClick={() => {
                  if (window.innerWidth < 768) {
                    setActiveMobileServiceId(activeMobileServiceId === service.id ? null : service.id);
                  }
                }}
                className={`group relative bg-white p-3 lg:p-6 xl:p-10 rounded-[1.25rem] md:rounded-[2.5rem] border transition-all duration-500 flex flex-col h-full w-full max-w-full cursor-pointer md:cursor-default ${
                  isEditMode ? 'border-amber-200 shadow-amber-100/50' : 'border-emerald-100/50'
                } shadow-xl shadow-emerald-900/[0.04] hover:shadow-2xl hover:shadow-emerald-900/10 hover:border-emerald-500/30 ${
                  activeMobileServiceId === service.id ? 'ring-2 ring-emerald-500 border-emerald-500/30' : ''
                }`}
              >
                {isEditMode && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick('servicos', service.id, {
                        firestoreKey: service.firestoreKey,
                        title: service.title,
                        description: service.description
                      });
                    }}
                    className="absolute top-2 right-2 md:top-4 lg:top-4 xl:top-6 md:right-4 lg:right-4 xl:right-6 w-8 h-8 lg:w-9 lg:h-9 xl:w-10 xl:h-10 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 hover:scale-110 active:scale-95 transition-all z-20"
                    title="Editar Serviço"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {/* Decorative Element */}
                <div className="absolute top-0 right-0 p-3 lg:p-4 xl:p-8 opacity-[0.015] md:opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                  <div className="scale-[1.2] lg:scale-[1.8] xl:scale-[3] transform-gpu">
                    {service.icon}
                  </div>
                </div>

                <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left gap-2 lg:gap-4 xl:gap-8 h-full">
                  <div className="w-10 h-10 md:w-14 lg:w-12 xl:w-20 md:h-14 lg:h-12 xl:h-20 rounded-lg lg:rounded-2xl xl:rounded-3xl flex items-center justify-center shrink-0 transition-all duration-500 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/30 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-emerald-500/50 relative">
                    {service.imageUrl ? (
                      <img 
                        src={service.imageUrl} 
                        alt={service.title} 
                        className="w-5 h-5 md:w-7 lg:w-6 xl:w-10 md:h-7 lg:h-6 xl:h-10 object-contain"
                      />
                    ) : (
                      React.cloneElement(service.icon as React.ReactElement, { className: 'w-5 h-5 md:w-6 lg:w-5 xl:w-8 md:h-6 lg:h-5 xl:h-8' })
                    )}

                    {isEditMode && (
                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10 text-white rounded-xl lg:rounded-2xl xl:rounded-3xl">
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload('servicos', service.id, file, service.firestoreKey);
                          }}
                        />
                        <ImagePlus className="w-5 h-5 md:w-8 md:h-8" />
                      </label>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col pt-1 md:pt-0">
                    <div className="hidden md:flex items-center gap-3 mb-2 xl:mb-4">
                      <span className="text-[10px] lg:text-[8px] xl:text-[10px] font-black text-emerald-500 uppercase tracking-[0.15em]">
                        {idx === 0 ? 'NR 01' : idx === 3 ? 'Saúde' : idx === 5 ? 'Laudos' : idx === 7 ? 'Treinamento' : 'SST'}
                      </span>
                    </div>
                    
                    <h4 className="text-[13px] md:text-xl lg:text-base xl:text-2xl font-black text-slate-900 mb-1 lg:mb-2 xl:mb-4 leading-tight tracking-tight group-hover:text-emerald-600 transition-all uppercase md:normal-case">
                      {service.title}
                    </h4>
                    
                    <div className={`overflow-hidden transition-all duration-300 md:block ${
                      activeMobileServiceId === service.id ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'
                    }`}>
                      <p className="text-slate-500 font-medium lg:leading-tight xl:leading-[1.65] group-hover:text-slate-600 transition-colors text-[12px] lg:text-[11px] xl:text-sm">
                        {service.description}
                      </p>
                    </div>

                    <div className="mt-auto pt-2 lg:pt-4 xl:pt-8 flex items-center justify-center md:justify-start gap-1 md:gap-2 text-emerald-600 font-black text-[9px] lg:text-[8px] xl:text-[10px] uppercase tracking-widest opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all md:translate-x-2 md:group-hover:translate-x-0">
                      {activeMobileServiceId === service.id ? 'Fechar' : 'Ver mais'} <ChevronRight className={`w-3 h-3 md:w-3.5 md:h-3.5 xl:w-4 xl:h-4 transition-transform ${activeMobileServiceId === service.id ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                </div>

                {/* Bottom Accent */}
                <div className="absolute bottom-0 left-10 right-10 h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-700" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Destaques Section */}
      <section id="destaques" className="py-12 lg:py-16 xl:py-24 px-4 md:px-6 bg-slate-50 transition-all">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 lg:mb-12 xl:mb-16 transition-all">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h3 className="text-2xl md:text-5xl lg:text-3xl xl:text-5xl font-black text-slate-900 mb-4 tracking-tight uppercase transition-all">Destaques</h3>
              <div className="w-20 h-1.5 bg-emerald-500 mx-auto rounded-full" />
              
              {isEditMode && (
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 rounded-full border border-amber-200">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">Edição Ativa</span>
                </div>
              )}
            </motion.div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 gap-4 lg:gap-5 xl:gap-8 transition-all">
            {highlights.map((highlight, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => {
                  if (window.innerWidth < 768) {
                    setActiveMobileHighlightId(activeMobileHighlightId === highlight.id ? null : highlight.id);
                  }
                }}
                className={`bg-white p-3 lg:p-6 xl:p-12 rounded-[1.25rem] md:rounded-[2.5rem] border transition-all group h-full flex flex-col relative cursor-pointer md:cursor-default ${
                  isEditMode ? 'border-amber-200 shadow-amber-100/50' : 'border-slate-100 shadow-sm hover:shadow-xl'
                } ${activeMobileHighlightId === highlight.id ? 'ring-2 ring-emerald-500 border-emerald-500/30' : ''}`}
              >
                {isEditMode && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick('destaques', highlight.id!, {
                        firestoreKey: highlight.firestoreKey,
                        title: highlight.title,
                        subtitle: highlight.subtitle,
                        description: highlight.description
                      });
                    }}
                    className="absolute top-2 right-2 md:top-4 lg:top-4 xl:top-6 md:right-4 lg:right-4 xl:right-6 w-8 h-8 lg:w-9 lg:h-9 xl:w-10 xl:h-10 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 hover:scale-110 active:scale-95 transition-all z-20"
                    title="Editar texto"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}

                <div className="flex flex-col md:flex-row items-center md:items-center gap-2 lg:gap-4 xl:gap-6 mb-2 lg:mb-4 xl:mb-8 text-center md:text-left transition-all">
                  <div className={`w-10 h-10 md:w-16 lg:w-14 xl:w-20 md:h-16 lg:h-14 xl:h-20 bg-white rounded-full flex items-center justify-center shrink-0 overflow-hidden border shadow-sm relative transition-all ${
                    isEditMode ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-100'
                  }`}>
                    {imageLoading[highlight.id!] || isSaving ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 z-20">
                        <Loader2 className="w-4 h-4 md:w-6 md:h-6 text-emerald-500 animate-spin" />
                      </div>
                    ) : highlight.image && !imageErrors[highlight.id!] ? (
                      <img 
                        src={highlight.image} 
                        alt={highlight.title} 
                        className="w-[98%] h-[98%] object-contain"
                        onError={(e) => {
                          console.warn(`Image fallback applied for ${highlight.id}`);
                          setImageErrors(prev => ({ ...prev, [highlight.id!]: true }));
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        {highlight.id === 'move' ? <CheckCircle2 className="w-5 h-5 md:w-10 md:h-10" /> : <Building2 className="w-5 h-5 md:w-10 md:h-10" />}
                      </div>
                    )}

                    {isEditMode && (
                      <label 
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10 text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload('destaques', highlight.id!, file, highlight.firestoreKey);
                          }}
                        />
                        <ImagePlus className="w-5 h-5 md:w-8 md:h-8" />
                      </label>
                    )}
                  </div>
                  <div>
                    <h4 className="text-[13px] md:text-xl lg:text-base xl:text-2xl font-black text-slate-900 leading-tight uppercase md:normal-case transition-all">{highlight.title}</h4>
                    {highlight.subtitle && (
                      <p className="text-emerald-600 font-bold text-[8px] lg:text-[10px] xl:text-sm uppercase tracking-widest mt-0.5 md:mt-1 hidden md:block transition-all">{highlight.subtitle}</p>
                    )}
                  </div>
                </div>
                
                <div className={`overflow-hidden transition-all duration-300 md:block ${
                  activeMobileHighlightId === highlight.id ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'
                }`}>
                  <p className="text-slate-600 font-medium leading-[1.5] lg:leading-tight xl:leading-relaxed text-[11px] lg:text-[13px] xl:text-lg text-center md:text-left transition-all">
                    {highlight.description}
                  </p>
                </div>

                <div className="mt-auto pt-2 md:hidden flex items-center justify-center text-emerald-600 font-black text-[8px] uppercase tracking-widest">
                  {activeMobileHighlightId === highlight.id ? 'Fechar' : 'Ler mais'}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="sobre" className="py-12 lg:py-16 xl:py-24 bg-blue-50 px-4 md:px-6 relative group transition-all">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-2xl md:text-5xl lg:text-3xl xl:text-5xl font-black text-slate-900 mb-6 xl:mb-8 transition-all">
            {draftConfig.sobre?.title || "Sobre a BioSegurança"}
          </h3>
          <p className="text-base md:text-2xl lg:text-lg xl:text-2xl text-slate-600 font-medium leading-relaxed italic px-2 transition-all">
            "{draftConfig.sobre?.description || "A BioSegurança ArqMed atua oferecendo soluções completas para empresas que precisam manter sua documentação, programas legais e obrigações trabalhistas em conformidade."}"
          </p>
          <div className="mt-8 lg:mt-10 xl:mt-12 flex justify-center gap-4 lg:gap-8 xl:gap-12 flex-wrap transition-all">
            <div className="text-center min-w-[100px]">
              <p className="text-2xl md:text-4xl lg:text-3xl xl:text-4xl font-black text-emerald-600 transition-all">{draftConfig.sobre?.stat1_value || "10+"}</p>
              <p className="text-[9px] lg:text-[8px] xl:text-xs font-bold text-slate-400 uppercase tracking-widest transition-all">{draftConfig.sobre?.stat1_label || "Anos de Experiência"}</p>
            </div>
            <div className="text-center min-w-[100px]">
              <p className="text-2xl md:text-4xl lg:text-3xl xl:text-4xl font-black text-emerald-600 transition-all">{draftConfig.sobre?.stat2_value || "500+"}</p>
              <p className="text-[9px] lg:text-[8px] xl:text-xs font-bold text-slate-400 uppercase tracking-widest transition-all">{draftConfig.sobre?.stat2_label || "Empresas Atendidas"}</p>
            </div>
            <div className="text-center min-w-[100px]">
              <p className="text-2xl md:text-4xl lg:text-3xl xl:text-4xl font-black text-emerald-600 transition-all">{draftConfig.sobre?.stat3_value || "100%"}</p>
              <p className="text-[9px] lg:text-[8px] xl:text-xs font-bold text-slate-400 uppercase tracking-widest transition-all">{draftConfig.sobre?.stat3_label || "Conformidade Legal"}</p>
            </div>
          </div>
          
          {isEditMode && (
            <button 
              onClick={() => handleEditClick('sobre', null, {
                title: draftConfig.sobre?.title || "Sobre a BioSegurança",
                description: draftConfig.sobre?.description || "A BioSegurança ArqMed atua oferecendo soluções completas para empresas que precisam manter sua documentação, programas legais e obrigações trabalhistas em conformidade.",
                stat1_value: draftConfig.sobre?.stat1_value || "10+",
                stat1_label: draftConfig.sobre?.stat1_label || "Anos de Experiência",
                stat2_value: draftConfig.sobre?.stat2_value || "500+",
                stat2_label: draftConfig.sobre?.stat2_label || "Empresas Atendidas",
                stat3_value: draftConfig.sobre?.stat3_value || "100%",
                stat3_label: draftConfig.sobre?.stat3_label || "Conformidade Legal"
              })}
              className="absolute top-12 right-12 w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 hover:scale-110 active:scale-95 transition-all z-20"
              title="Editar Seção Sobre"
            >
              <Pencil className="w-6 h-6" />
            </button>
          )}
        </div>
      </section>

      {/* Clientes Section */}
      <section className="py-10 lg:py-12 xl:py-16 bg-slate-50 border-y border-slate-100 overflow-hidden transition-all">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 lg:mb-6 xl:mb-10 transition-all">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-lg md:text-3xl lg:text-xl xl:text-3xl font-black text-slate-900 uppercase tracking-tighter transition-all">
                Clientes que confiam em nós
              </h2>
              <p className="mt-2 text-slate-500 font-medium text-[11px] lg:text-[10px] xl:text-base transition-all">
                Empresas que contam com nossas soluções em Saúde e Segurança Ocupacional.
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4 xl:gap-6 items-center transition-all">
            {[1, 2, 3, 4, 5].map((num) => {
              const firestoreKey = `logo${num}`;
              const logoPath = draftConfig.clientes?.[firestoreKey] || siteImages[firestoreKey as keyof typeof siteImages];
              
              return (
                <motion.div
                  key={num}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: num * 0.1 }}
                  className={`relative h-20 lg:h-24 xl:h-28 bg-white rounded-2xl shadow-sm border flex items-center justify-center p-4 lg:p-5 xl:p-6 transition-all hover:-translate-y-1 hover:shadow-md hover:border-emerald-500/20 group ${
                    isEditMode ? 'border-amber-200' : 'border-slate-100'
                  }`}
                >
                  <img
                    src={logoPath}
                    alt={`Cliente ${num}`}
                    className="max-h-12 lg:max-h-14 xl:max-h-16 max-w-full object-contain transition-all duration-300"
                  />
                  
                  {isEditMode && (
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10 text-white rounded-2xl">
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload('clientes', null, file, firestoreKey);
                        }}
                      />
                      <ImagePlus className="w-8 h-8" />
                    </label>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact Section - Modernized Premium Version */}
      <section id="contato" className="py-16 lg:py-20 xl:py-32 px-4 md:px-6 bg-gradient-to-b from-white to-slate-50 relative overflow-hidden transition-all">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-[300px] lg:w-[400px] xl:w-[500px] h-[300px] lg:h-[400px] xl:h-[500px] bg-emerald-500/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[200px] lg:w-[300px] xl:w-[400px] h-[200px] lg:h-[300px] xl:h-[400px] bg-blue-500/5 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-12 xl:gap-24 transition-all">
            
            {/* LADO ESQUERDO: Contato Direto */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative group"
            >
              {isEditMode && (
                <button 
                  onClick={() => handleEditClick('contato', null, {
                    title_part1: draftConfig.contato?.title_part1 || "Entre em contato com ",
                    title_part2: draftConfig.contato?.title_part2 || "nossa equipe",
                    description: draftConfig.contato?.description || "Estamos prontos para oferecer soluções completas em Engenharia de Segurança e Medicina do Trabalho para sua empresa.",
                    whatsapp_number: draftConfig.contato?.whatsapp_number || "5567998149286",
                    instagram_handle: draftConfig.contato?.instagram_handle || "bioseguranca_roo",
                    email: draftConfig.contato?.email || "Bioseguranca@hotmail.com"
                  })}
                  className="absolute top-0 right-0 w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 hover:scale-110 active:scale-95 transition-all z-20"
                  title="Editar Contatos"
                >
                  <Pencil className="w-5 h-5" />
                </button>
              )}
              <div className="mb-8 xl:mb-12 transition-all">
                <span className="inline-block px-4 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] lg:text-[8px] xl:text-[10px] font-black uppercase tracking-[0.2em] rounded-full mb-6 transition-all">
                  Fale com Especialistas
                </span>
                <h3 className="text-3xl md:text-6xl lg:text-3xl xl:text-6xl font-black text-slate-900 mb-6 xl:mb-8 leading-[1.1] tracking-tight transition-all">
                  {draftConfig.contato?.title_part1 || "Entre em contato com "}<span className="text-emerald-600">{draftConfig.contato?.title_part2 || "nossa equipe"}</span>
                </h3>
                <p className="text-slate-500 font-medium text-base md:text-lg lg:text-sm xl:text-lg leading-relaxed max-w-lg transition-all">
                  {draftConfig.contato?.description || "Estamos prontos para oferecer soluções completas em Engenharia de Segurança e Medicina do Trabalho para sua empresa."}
                </p>
              </div>

              <div className="grid gap-4 lg:gap-4 xl:gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 transition-all">
                {/* WHATSAPP CARD */}
                <motion.div 
                  whileHover={{ y: -5 }}
                  className="bg-white p-6 lg:p-6 xl:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-emerald-100/50 shadow-xl shadow-emerald-900/[0.03] hover:shadow-2xl hover:shadow-emerald-900/10 hover:border-emerald-500/30 transition-all duration-500 group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2" />
                  
                  <div className="w-12 h-12 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500">
                    <MessageCircle className="w-6 h-6 lg:w-5 lg:h-5 xl:w-7 xl:h-7" />
                  </div>
                  
                  <h4 className="text-lg md:text-xl lg:text-base xl:text-xl font-black text-slate-900 mb-2 transition-all">Fale Conosco</h4>
                  <p className="text-slate-500 text-xs md:text-sm lg:text-[11px] xl:text-sm font-medium mb-6 xl:mb-8 leading-relaxed transition-all">
                    Atendimento rápido e direto com nossa equipe especializada.
                  </p>
                  
                  <a 
                    href={`https://api.whatsapp.com/send/?phone=${draftConfig.contato?.whatsapp_number || "5567998149286"}&text&type=phone_number&app_absent=0`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-emerald-600 font-black text-[10px] lg:text-[9px] xl:text-[10px] uppercase tracking-widest hover:gap-4 transition-all"
                  >
                    Chamar no WhatsApp <ChevronRight className="w-4 h-4 transition-all" />
                  </a>
                </motion.div>

                {/* INSTAGRAM CARD */}
                <motion.div 
                  whileHover={{ y: -5 }}
                  className="bg-white p-6 lg:p-6 xl:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-900/[0.03] hover:shadow-2xl hover:shadow-emerald-900/10 hover:border-emerald-500/30 transition-all duration-500 group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2" />
                  
                  <div className="w-12 h-12 lg:w-11 lg:h-11 xl:w-14 xl:h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-gradient-to-tr group-hover:from-amber-500 group-hover:via-pink-500 group-hover:to-violet-600 group-hover:text-white transition-all duration-500">
                    <Instagram className="w-6 h-6 lg:w-5 lg:h-5 xl:w-7 xl:h-7" />
                  </div>
                  
                  <h4 className="text-lg md:text-xl lg:text-base xl:text-xl font-black text-slate-900 mb-2 transition-all">Instagram</h4>
                  <p className="text-slate-500 text-xs md:text-sm lg:text-[11px] xl:text-sm font-medium mb-6 xl:mb-8 leading-relaxed transition-all">
                    Acompanhe conteúdos, atualizações e novidades.
                  </p>
                  
                  <a 
                    href={`https://www.instagram.com/${draftConfig.contato?.instagram_handle || "bioseguranca_roo"}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-slate-400 group-hover:text-emerald-600 font-black text-[10px] lg:text-[9px] xl:text-[10px] uppercase tracking-widest hover:gap-4 transition-all"
                  >
                    Visitar <ChevronRight className="w-4 h-4 transition-all" />
                  </a>
                </motion.div>
              </div>

              {/* Contatos Adicionais Sutis */}
              <div className="mt-12 lg:mt-8 xl:mt-12 flex flex-wrap gap-8 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 lg:w-8 lg:h-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 transition-all">
                    <Mail className="w-5 h-5 lg:w-4 lg:h-4" />
                  </div>
                  <a href={`mailto:${draftConfig.contato?.email || "Bioseguranca@hotmail.com"}`} className="text-sm lg:text-[13px] xl:text-sm font-bold text-slate-600 hover:text-emerald-600 transition-all">
                    {draftConfig.contato?.email || "Bioseguranca@hotmail.com"}
                  </a>
                </div>
              </div>
            </motion.div>

            {/* LADO DIREITO: Nossas Unidades */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="lg:pt-0 xl:pt-12 relative group transition-all"
            >
              {isEditMode && (
                <button 
                  onClick={() => handleEditClick('contato', null, {
                    unit1_name: draftConfig.contato?.unit1_name || "Campo Grande - MS",
                    unit1_address: draftConfig.contato?.unit1_address || "Rua Marechal Rondon, 2083 - Centro - Campo Grande - MS",
                    unit1_maps_url: draftConfig.contato?.unit1_maps_url || "https://www.google.com/maps?q=Rua+Marechal+Rondon,+2083+-+Centro,+Campo+Grande+-+MS",
                    unit2_name: draftConfig.contato?.unit2_name || "Rondonópolis - MT",
                    unit2_address: draftConfig.contato?.unit2_address || "Rua João Pessoa, 916 - Centro - Rondonópolis - MT",
                    unit2_maps_url: draftConfig.contato?.unit2_maps_url || "https://www.google.com/maps?q=Rua+João+Pessoa,+916+-+Centro,+Rondonópolis+-+MT"
                  })}
                  className="absolute top-4 xl:top-12 right-0 w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 hover:scale-110 active:scale-95 transition-all z-20"
                  title="Editar Unidades"
                >
                  <Pencil className="w-5 h-5" />
                </button>
              )}
                <div className="bg-white/50 backdrop-blur-sm p-6 md:p-8 lg:p-8 xl:p-12 rounded-[2rem] md:rounded-[3.5rem] border border-emerald-100/30 shadow-2xl shadow-emerald-900/5 relative transition-all">
                  <div className="flex items-center gap-4 mb-8 xl:mb-10 transition-all">
                    <div className="w-10 h-10 lg:w-10 lg:h-10 xl:w-12 xl:h-12 bg-emerald-600 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20 transition-all">
                      <Building2 className="w-5 h-5 xl:w-6 xl:h-6" />
                    </div>
                    <h4 className="text-xl md:text-2xl lg:text-base xl:text-2xl font-black text-slate-900 uppercase tracking-tight transition-all">Nossas Unidades</h4>
                  </div>

                  <div className="space-y-6 xl:space-y-8 transition-all">
                    {/* UNIDADE 1: Campo Grande */}
                    <motion.div 
                      whileHover={{ x: 10 }}
                      className="bg-white p-6 lg:p-6 xl:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-500/20 transition-all duration-500 group"
                    >
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div>
                          <h5 className="text-base md:text-lg lg:text-sm xl:text-lg font-black text-slate-900 mb-1 transition-all">{draftConfig.contato?.unit1_name || "Campo Grande - MS"}</h5>
                          <p className="text-slate-500 text-xs md:text-sm lg:text-[11px] xl:text-sm font-medium flex items-start gap-2 leading-relaxed transition-all">
                            <MapPin className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-emerald-500 mt-0.5 shrink-0 transition-all" />
                            {draftConfig.contato?.unit1_address || "Rua Marechal Rondon, 2083 - Centro - Campo Grande - MS"}
                          </p>
                        </div>
                        <a 
                          href={draftConfig.contato?.unit1_maps_url || "https://www.google.com/maps?q=Rua+Marechal+Rondon,+2083+-+Centro,+Campo+Grande+-+MS"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 lg:w-10 lg:h-10 xl:w-12 xl:h-12 bg-emerald-50 text-emerald-600 rounded-xl md:rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-sm"
                        >
                          <MapPin className="w-5 h-5 xl:w-6 xl:h-6" />
                        </a>
                      </div>
                    </motion.div>

                    {/* UNIDADE 2: Rondonópolis */}
                    <motion.div 
                      whileHover={{ x: 10 }}
                      className="bg-white p-6 lg:p-6 xl:p-8 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-500/20 transition-all duration-500 group"
                    >
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div>
                          <h5 className="text-base md:text-lg lg:text-sm xl:text-lg font-black text-slate-900 mb-1 transition-all">{draftConfig.contato?.unit2_name || "Rondonópolis - MT"}</h5>
                          <p className="text-slate-500 text-xs md:text-sm lg:text-[11px] xl:text-sm font-medium flex items-start gap-2 leading-relaxed transition-all">
                            <MapPin className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-emerald-500 mt-0.5 shrink-0 transition-all" />
                            {draftConfig.contato?.unit2_address || "Rua João Pessoa, 916 - Centro - Rondonópolis - MT"}
                          </p>
                        </div>
                        <a 
                          href={draftConfig.contato?.unit2_maps_url || "https://www.google.com/maps?q=Rua+João+Pessoa,+916+-+Centro,+Rondonópolis+-+MT"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 lg:w-10 lg:h-10 xl:w-12 xl:h-12 bg-emerald-50 text-emerald-600 rounded-xl md:rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-sm"
                        >
                          <MapPin className="w-5 h-5 xl:w-6 xl:h-6" />
                        </a>
                      </div>
                    </motion.div>
                  </div>
                </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 lg:py-10 xl:py-12 border-t border-slate-100 px-6 bg-white relative group transition-all">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 transition-all">
          <div className="flex items-center gap-3 transition-all">
            <img src={siteImages.logoPrincipal} alt="Logo BioSegurança ArqMed" className="h-6 lg:h-7 xl:h-8 w-auto opacity-50 grayscale transition-all" />
            <p className="text-[10px] lg:text-[9px] xl:text-xs font-bold text-slate-400 transition-all">
              {draftConfig.rodape?.copyright || "© 2024 BioSegurança ArqMed. Todos os direitos reservados."}
            </p>
          </div>
          <div className="flex gap-8 transition-all">
            <a href="#" className="text-[10px] lg:text-[9px] xl:text-xs font-bold text-slate-400 hover:text-emerald-600 transition-colors uppercase tracking-widest transition-all">
              {draftConfig.rodape?.link1 || "Privacidade"}
            </a>
            <a href="#" className="text-[10px] lg:text-[9px] xl:text-xs font-bold text-slate-400 hover:text-emerald-600 transition-colors uppercase tracking-widest transition-all">
              {draftConfig.rodape?.link2 || "Termos"}
            </a>
          </div>
        </div>
        
        {isEditMode && (
          <button 
            onClick={() => handleEditClick('rodape', null, {
              copyright: draftConfig.rodape?.copyright || "© 2024 BioSegurança ArqMed. Todos os direitos reservados.",
              link1: draftConfig.rodape?.link1 || "Privacidade",
              link2: draftConfig.rodape?.link2 || "Termos"
            })}
            className="absolute top-4 right-4 w-8 h-8 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30 hover:scale-110 active:scale-95 transition-all z-20"
            title="Editar Rodapé"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </footer>

      {/* Edit Modal */}
      <AnimatePresence>
        {editModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditModal({ isOpen: false, cardId: null, data: null })}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10 border border-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 capitalize">Editar {editModal.section}</h3>
                </div>
                <button 
                  onClick={() => setEditModal({ isOpen: false, section: null, cardId: null, data: null })}
                  className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X />
                </button>
              </div>

              <div className="space-y-6">
                {Object.keys(editModal.data || {}).filter(key => key !== 'firestoreKey' && key !== 'imageUrl').map((key) => (
                  <div key={key}>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-2 capitalize">
                      {key.replace(/_/g, ' ')}
                    </label>
                    {key.toLowerCase().includes('description') || key.toLowerCase().includes('address') || key.toLowerCase().includes('text') ? (
                      <textarea 
                        rows={4}
                        value={editModal.data[key]}
                        onChange={(e) => setEditModal(prev => ({ ...prev, data: { ...prev.data, [key]: e.target.value } }))}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                      />
                    ) : (
                      <input 
                        type="text"
                        value={editModal.data[key]}
                        onChange={(e) => setEditModal(prev => ({ ...prev, data: { ...prev.data, [key]: e.target.value } }))}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-10 flex gap-4">
                <button
                  disabled={isSaving}
                  onClick={() => setEditModal({ isOpen: false, cardId: null, data: null })}
                  className="flex-1 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  disabled={isSaving}
                  onClick={handleSaveEdit}
                  className="flex-1 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Admin Login Modal */}
      <AnimatePresence>
        {loginModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLoginModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">Acesso Administrativo</h3>
                <p className="text-slate-500 font-medium text-sm mt-2">Habilitar edição do site</p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-2">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type="email"
                      required
                      value={loginModal.email}
                      onChange={(e) => setLoginModal(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-14 pr-6 py-4 text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="admin@exemplo.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-2">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type={loginModal.showPassword ? "text" : "password"}
                      required
                      value={loginModal.password}
                      onChange={(e) => setLoginModal(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-14 pr-14 py-4 text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setLoginModal(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {loginModal.showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {loginModal.error && (
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-3">
                    <div className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <X className="w-3 h-3" strokeWidth={4} />
                    </div>
                    <p className="text-xs font-bold text-red-600">{loginModal.error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginModal.loading}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {loginModal.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Entrar e Editar"}
                </button>
              </form>

              <button
                onClick={() => setLoginModal(prev => ({ ...prev, isOpen: false }))}
                className="w-full mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
              >
                Fechar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Save Bar (Bottom Central) */}
      <AnimatePresence>
        {isEditMode && hasChanges && (
          <motion.div
            initial={{ y: 100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 100, opacity: 0, x: '-50%' }}
            className="fixed bottom-6 left-1/2 z-[100] w-[92%] max-w-2xl"
          >
            <div className="bg-slate-900 text-white p-3 md:p-5 rounded-[1.25rem] md:rounded-[2rem] shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 md:gap-4 border border-white/10 backdrop-blur-xl">
              <div className="flex items-center gap-3 md:gap-4 w-full sm:w-auto">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-500/20 text-amber-500 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0">
                  <Save className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="text-left">
                  <h4 className="font-black uppercase tracking-widest text-[9px] md:text-xs">Alterações para salvar</h4>
                  <p className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-tight">Você possui alterações não salvas.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto">
                <button
                  onClick={discardChanges}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-all disabled:opacity-50 border border-white/5"
                >
                  Descartar
                </button>
                <button
                  onClick={persistChanges}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none px-6 md:px-8 py-2.5 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-emerald-500"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" /> : <Save className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                  Salvar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Message Toast */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110]"
          >
            <div className="bg-emerald-600 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              {successMessage}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
