import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  MoreVertical, 
  ShieldCheck, 
  UserCircle, 
  Mail, 
  Briefcase, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  XCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Home,
  X,
  Key,
  Lock,
  ShieldAlert,
  UserX,
  ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ThemeToggleButton from '../components/ThemeToggleButton';
import ScaleControl from '../components/ScaleControl';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  orderBy,
  where,
  deleteDoc
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as sign_out } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { logService } from '../services/logService';
import firebaseConfig from '../../firebase-applet-config.json';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { isInternalEmployee } from '../utils/userClassification';

interface UserProfile {
  uid: string;
  nome: string;
  email: string;
  cargo: string;
  tipo: 'admin' | 'funcionario' | 'aso_funcionario';
  role?: string;
  canViewOnlyASO?: boolean;
  status: 'ativo' | 'inativo';
  verContratos?: 'Campo Grande' | 'Rondonópolis' | 'Todos' | 'Nenhum';
  createdAt: string;
}

const VISIBILITY_OPTIONS = ['Campo Grande', 'Rondonópolis', 'Todos'];

export default function AdminUsers() {
  const navigate = useNavigate();
  const { userData, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // New password states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToStatusToggle, setUserToStatusToggle] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cargo: '',
    senha: '',
    tipo: 'funcionario' as 'admin' | 'funcionario',
    status: 'ativo' as 'ativo' | 'inativo',
    verContratos: '' as any
  });

  useEffect(() => {
    // Basic protection: only active admins can stay here
    if (!loading && !isAdmin) {
      navigate('/dashboard');
      return;
    }
    loadUsers();
  }, [isAdmin, loading]);

  const runMigration = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      console.log("Iniciando migração e classificação de usuários...");
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      
      let count = 0;

      for (const d of snap.docs) {
        const data = d.data();
        
        // Se não tiver os novos campos de identificação de segurança, classificar
        if (!data.source || data.isAsoUser === undefined) {
          const isInternal = isInternalEmployee(data);
          if (isInternal) {
            console.log(`Migrando usuário interno: ${data.nome} (${data.email})`);
            await updateDoc(doc(db, 'users', d.id), {
              source: "app",
              userType: "internal_employee",
              role: data.tipo === 'admin' ? 'admin' : 'funcionario',
              isAsoUser: false
            });
          } else {
            console.log(`Migrando usuário ASO: ${data.nome} (${data.email})`);
            await updateDoc(doc(db, 'users', d.id), {
              source: "aso",
              userType: "aso_funcionario",
              portalRole: "funcionario",
              isAsoUser: true,
              tipo: data.tipo === 'funcionario' ? 'aso_funcionario' : data.tipo
            });
          }
          count++;
        }
      }
      
      toast.success(`${count} usuários foram migrados e classificados com as tags de segurança.`);
      loadUsers();
    } catch (err) {
      console.error("Erro na migração:", err);
      toast.error("Erro ao executar migração.");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!isAdmin) return;
    try {
      // Filtrar para mostrar apenas admins e funcionários internos
      // Membros da equipe ArqMed
      const usersRef = collection(db, 'users');
      
      // Carregamos e filtramos usando isInternalEmployee para máxima robustez e compatibilidade
      const snap = await getDocs(usersRef);
      const list = snap.docs.map(d => d.data() as any);
      
      const internalTeam = list.filter(u => isInternalEmployee(u)) as UserProfile[];
      
      // Ordenar por nome de A a Z
      internalTeam.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      
      setUsers(internalTeam);
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user?: UserProfile) => {
    setNewPassword('');
    setConfirmPassword('');
    if (user) {
      setEditingUser(user);
      setFormData({
        nome: user.nome,
        email: user.email,
        cargo: user.cargo || '',
        senha: '', // Don't show password for existing user
        tipo: user.tipo,
        status: user.status,
        verContratos: user.verContratos || ''
      });
    } else {
      setEditingUser(null);
      setFormData({
        nome: '',
        email: '',
        cargo: '',
        senha: '',
        tipo: 'funcionario',
        status: 'ativo',
        verContratos: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error("Acesso negado: Você não tem permissão para esta ação.", {
        style: { borderRadius: '12px', background: '#fef2f2', color: '#991b1b', fontWeight: 'bold', border: '1px solid #fecaca' }
      });
      return;
    }
    setSubmitting(true);
    
    if (!formData.verContratos) {
      toast.error("Por favor, selecione a permissão de visualização de contratos.", {
        style: { borderRadius: '12px', background: '#fef2f2', color: '#991b1b', fontWeight: 'bold', border: '1px solid #fecaca' }
      });
      setSubmitting(false);
      return;
    }
    
    try {
      if (editingUser) {
        // Update Firestore
        const userRef = doc(db, 'users', editingUser.uid);
        const updateData = {
          nome: formData.nome,
          cargo: formData.cargo,
          tipo: formData.tipo,
          status: formData.status,
          verContratos: formData.verContratos,
          source: "app",
          userType: "internal_employee",
          isAsoUser: false,
          portalRole: null,
          createdAutomatically: false,
          role: formData.tipo === 'admin' ? 'admin' : 'funcionario'
        };
        await updateDoc(userRef, updateData);

        // Log action
        if (userData) {
          await logService.record(
            { uid: userData.uid, nome: userData.nome, email: userData.email },
            'EDITAR_USUARIO',
            `Editou o perfil de "${formData.nome}" (${formData.email}).`
          );
        }
      } else {
        // Create new user in Auth AND Firestore
        // Use secondary app to prevent current admin logout
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const cleanEmail = formData.email.trim();
          console.log("USER_CREATE_INTERNAL_START", cleanEmail);
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth, 
            cleanEmail, 
            formData.senha
          );
          const newUid = userCredential.user.uid;
          
          await setDoc(doc(db, 'users', newUid), {
            uid: newUid,
            nome: formData.nome,
            email: cleanEmail,
            cargo: formData.cargo,
            tipo: formData.tipo,
            status: formData.status,
            verContratos: formData.verContratos,
            source: "app",
            userType: "internal_employee",
            role: formData.tipo === 'admin' ? 'admin' : 'funcionario',
            isAsoUser: false,
            portalRole: null,
            createdAutomatically: false,
            createdAt: new Date().toISOString()
          });

          console.log("USER_CREATE_INTERNAL_SUCCESS", cleanEmail);
          console.log("USER_CREATE_INTERNAL_EMPLOYEE_SUCCESS", cleanEmail);

          // Cleanup: sign out from secondary app and delete it
          await sign_out(secondaryAuth);
          await deleteApp(secondaryApp);

          // Log action
          if (userData) {
            await logService.record(
              { uid: userData.uid, nome: userData.nome, email: userData.email },
              'CRIAR_USUARIO',
              `Cadastrou novo funcionário: "${formData.nome}" (${formData.email}).`
            );
          }
        } catch (authErr: any) {
           await deleteApp(secondaryApp);
           throw authErr;
        }
      }
      
      toast.success(editingUser ? "Perfil atualizado com sucesso!" : "Funcionário cadastrado com sucesso!", {
        style: {
          borderRadius: '12px',
          background: '#f0fdf4',
          color: '#166534',
          fontWeight: 'bold',
          border: '1px solid #bbf7d0'
        },
        icon: '✅'
      });
      setIsModalOpen(false);
      loadUsers();
    } catch (err: any) {
      if (!editingUser) {
        console.log("USER_CREATE_INTERNAL_ERROR", formData.email, err.message || err);
      }
      console.error("Erro ao salvar usuário:", err);
      let msg = "Erro ao salvar usuário";
      if (err.code === 'auth/email-already-in-use') msg = "Este e-mail já está em uso por outro usuário.";
      if (err.code === 'auth/invalid-email') msg = "O formato do e-mail é inválido.";
      if (err.code === 'auth/weak-password') msg = "A senha é muito fraca. Use pelo menos 6 caracteres.";
      toast.error(msg, {
        style: {
          borderRadius: '12px',
          background: '#fef2f2',
          color: '#991b1b',
          fontWeight: 'bold',
          border: '1px solid #fecaca'
        }
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!editingUser) return;
    
    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    
    setChangingPassword(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Usuário não autenticado");

      console.log("Iniciando requisição para alterar senha...");
      const response = await fetch('/api/admin/update-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          uid: editingUser.uid,
          newPassword
        })
      });
      
      const text = await response.text();
      console.log("Resposta bruta update-password:", text);

      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        console.error("Erro ao converter para JSON:", e);
        throw new Error("Resposta inválida do servidor: " + (text || "corpo vazio"));
      }

      if (!response.ok) {
        throw new Error(data?.message || data?.error || 'Erro ao alterar senha');
      }
      
      toast.success("Senha do funcionário alterada com sucesso.", {
        duration: 5000,
        style: {
          borderRadius: '12px',
          background: '#f0fdf4',
          color: '#166534',
          fontWeight: 'bold',
          border: '1px solid #bbf7d0'
        },
        icon: '✅'
      });
      setNewPassword('');
      setConfirmPassword('');
      
      if (userData) {
        await logService.record(
          { uid: userData.uid, nome: userData.nome, email: userData.email },
          'ALTERAR_SENHA_USUARIO',
          `Alterou a senha do funcionário "${editingUser.nome}" (${editingUser.email}).`
        );
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao alterar senha. Tente novamente.", {
        style: {
          borderRadius: '12px',
          background: '#fef2f2',
          color: '#991b1b',
          fontWeight: 'bold',
          border: '1px solid #fecaca'
        }
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const toggleStatus = async (user: UserProfile) => {
    if (!isAdmin) {
      toast.error("Acesso negado: Você não tem permissão para esta ação.");
      return;
    }

    if (user.uid === userData?.uid) {
      toast.error("Você não pode desativar seu próprio usuário.");
      return;
    }

    setUserToStatusToggle(user);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmStatusToggle = async () => {
    if (!userToStatusToggle || !userData) return;
    
    setStatusLoading(true);
    try {
      const newStatus = userToStatusToggle.status === 'ativo' ? 'inativo' : 'ativo';
      const idToken = await auth.currentUser?.getIdToken();
      
      if (!idToken) throw new Error("Usuário não autenticado");

      const response = await fetch('/api/admin/disable-user', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          uid: userToStatusToggle.uid,
          status: newStatus
        })
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        throw new Error(`Resposta inválida do servidor: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao alterar status do funcionário');
      }

      // Log action
      await logService.record(
        { uid: userData.uid, nome: userData.nome, email: userData.email },
        'ALTERAR_STATUS_USUARIO',
        `Alterou status de "${userToStatusToggle.nome}" para ${newStatus.toUpperCase()} (Bio: ${newStatus === 'inativo' ? 'Bloqueado no Auth' : 'Ativado no Auth'}).`
      );
      
      toast.success(data.message || `Usuário ${newStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso!`, {
        style: { borderRadius: '12px', background: '#f0fdf4', color: '#166534', fontWeight: 'bold', border: '1px solid #bbf7d0' }
      });

      setIsConfirmModalOpen(false);
      setUserToStatusToggle(null);
      loadUsers();
    } catch (err: any) {
      console.error("Erro ao alterar status:", err);
      toast.error(err.message || "Erro ao alterar status do usuário.", {
        style: { borderRadius: '12px', background: '#fef2f2', color: '#991b1b', fontWeight: 'bold', border: '1px solid #fecaca' }
      });
    } finally {
      setStatusLoading(false);
    }
  };

    const handlePermanentDelete = async () => {
    if (!userToDelete || !userData) return;
    
    if (userToDelete.uid === userData.uid) {
      toast.error("Você não pode deletar seu próprio usuário.");
      return;
    }

    setDeleteLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Usuário não autenticado");

      console.log(`[FRONTEND] Tentando deletar funcionário: ${userToDelete.nome} (UID: ${userToDelete.uid})`);
      
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          uid: userToDelete.uid,
          employeeId: userToDelete.uid,
          nome: userToDelete.nome,
          email: userToDelete.email
        })
      });

      console.log('[FRONTEND] DELETE USER STATUS:', response.status);
      const responseText = await response.text();
      console.log('[FRONTEND] DELETE USER RESPONSE TEXT:', responseText);

      let data: any = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        console.error('[FRONTEND] Resposta não é JSON válido:', responseText);
      }

      if (!response.ok) {
        console.error('[FRONTEND] Erro retornado pela API:', data);
        const errorMsg = data?.message || responseText || 'Erro ao deletar usuário';
        const errorCode = data?.code ? ` (Código: ${data.code})` : '';
        throw new Error(`${errorMsg}${errorCode}`);
      }

      // Log action
      await logService.record(
        { uid: userData.uid, nome: userData.nome, email: userData.email },
        'FUNCIONARIO_DELETADO_PERMANENTEMENTE',
        `Deletou PERMANENTEMENTE o funcionário "${userToDelete.nome}" (${userToDelete.email}).`
      );
      
      toast.success(data?.message || "Funcionário deletado permanentemente!", {
        style: { borderRadius: '12px', background: '#f0fdf4', color: '#166534', fontWeight: 'bold', border: '1px solid #bbf7d0' }
      });

      setIsDeleteModalOpen(false);
      const deletedId = userToDelete.uid;
      setUsers(prev => prev.filter(u => u.uid !== deletedId));
      setUserToDelete(null);
      loadUsers();
    } catch (err: any) {
      console.error("[FRONTEND] Erro exato ao deletar permanentemente:", err);
      toast.error(err.message || "Erro ao deletar usuário.", {
        style: { borderRadius: '12px', background: '#fef2f2', color: '#991b1b', fontWeight: 'bold', border: '1px solid #fecaca' }
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.cargo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#fcfdfc] dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300">
      {/* Header Fixo */}
      <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-2.5 lg:py-3 xl:py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm transition-all">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all text-slate-500 dark:text-slate-400 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm active:scale-90"
          >
            <ArrowLeft className="w-5 h-5 flex group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 xl:w-11 xl:h-11 bg-brand-primary rounded-[14px] flex items-center justify-center shadow-lg shadow-brand-primary/20 group transition-transform hover:rotate-3">
              <Users className="text-white w-5 h-5 xl:w-6 xl:h-6 transition-transform group-hover:scale-110" />
            </div>
            <div>
              <h1 className="text-base xl:text-lg font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tighter">Colaboradores</h1>
              <p className="text-[9px] xl:text-[10px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-[0.2em]">Painel de Controle</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={runMigration}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-emerald-50 hover:text-emerald-500 transition-all border border-transparent hover:border-emerald-100"
            title="Corrigir e filtrar usuários externos da lista da equipe"
          >
            Limpar Lista Equipe
          </button>
          <ScaleControl />
          <ThemeToggleButton />
          
          <a 
            href="https://www.biosegurancaarqmed.com.br"
            className="text-slate-400 dark:text-slate-500 hover:text-emerald-600 transition-all p-2 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-950 flex items-center gap-2 group border border-transparent hover:border-emerald-100 dark:hover:border-emerald-900/30"
            title="Voltar ao site"
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest hidden lg:block">Ir para Site</span>
          </a>
          
          {isAdmin && (
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white font-bold rounded-xl shadow-lg shadow-brand-primary/20 hover:scale-[1.03] active:scale-[0.98] transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Funcionário</span>
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 p-6 md:p-8 lg:p-8 xl:p-10 max-w-7xl w-full mx-auto">
        <div className="mb-8 xl:mb-12 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="relative">
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-brand-primary rounded-full blur-[2px] opacity-20 hidden md:block" />
            <h2 className="text-2xl md:text-3xl xl:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-3 transition-all">Equipe Técnica</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-base xl:text-lg max-w-xl transition-all">
              Gerencie os acessos, permissões e status de todos os funcionários credenciados no sistema.
            </p>
          </div>

          <div className="relative group max-w-md w-full">
            <Search className="w-5 h-5 text-slate-400 dark:text-slate-600 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-brand-primary transition-all group-focus-within:scale-110" />
            <input 
              type="text"
              placeholder="Buscar por nome, e-mail ou cargo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-6 py-3.5 xl:py-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-[20px] w-full text-slate-900 dark:text-white placeholder:text-slate-400 font-medium focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:border-brand-primary/50 transition-all shadow-sm group-hover:border-slate-300 dark:group-hover:border-slate-700"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6 bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
            <div className="relative">
              <Loader2 className="w-16 h-16 text-brand-primary animate-spin" />
              <div className="absolute inset-0 blur-2xl bg-brand-primary/20 animate-pulse-slow" />
            </div>
            <p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest text-xs">Sincronizando Colaboradores...</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-6 xl:px-8 py-4 xl:py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] w-[35%] transition-all">Identificação</th>
                    <th className="px-6 xl:px-8 py-4 xl:py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] transition-all">Especialidade</th>
                    <th className="px-6 xl:px-8 py-4 xl:py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] transition-all">Permissão / Unidade</th>
                    <th className="px-6 xl:px-8 py-4 xl:py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] transition-all">Status de Acesso</th>
                    <th className="px-6 xl:px-8 py-4 xl:py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] text-right transition-all">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {filteredUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-emerald-50/[0.02] dark:hover:bg-emerald-950/[0.02] transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-200/60 dark:border-slate-700 transition-all group-hover:scale-110 group-hover:bg-white dark:group-hover:bg-slate-700 shadow-sm">
                             <UserCircle className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white leading-tight mb-1">{user.nome}</p>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-emerald-500/60" />
                            <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">{user.cargo}</span>
                          </div>
                          <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest w-fit ${
                            user.tipo === 'admin' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                          }`}>
                            {user.tipo}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-brand-primary/40 animate-pulse" />
                          <span className="text-[11px] font-black text-brand-primary uppercase tracking-widest bg-brand-primary/5 dark:bg-brand-primary/10 px-3 py-1.5 rounded-xl border border-brand-primary/10 transition-all group-hover:bg-brand-primary/10">
                            {user.verContratos || 'Acesso Local'}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        {isAdmin ? (
                          <button 
                            onClick={() => toggleStatus(user)}
                            className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border transition-all active:scale-95 shadow-sm group/btn ${
                              user.status === 'ativo' 
                                ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' 
                                : 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800/60 hover:bg-red-100 dark:hover:bg-red-900/30'
                            }`}
                          >
                            {user.status === 'ativo' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            <span className="text-[10px] font-black uppercase tracking-[0.1em]">{user.status}</span>
                            <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                          </button>
                        ) : (
                          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border ${
                            user.status === 'ativo' 
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' 
                              : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${user.status === 'ativo' ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
                            <span className="text-[10px] font-black uppercase tracking-wider">{user.status}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-right">
                        {isAdmin && (
                          <div className="flex items-center justify-end gap-2.5">
                             <button 
                               onClick={() => handleOpenModal(user)}
                               className="p-3 text-slate-400 hover:text-white hover:bg-brand-primary rounded-[14px] transition-all border border-slate-100 dark:border-slate-800 hover:border-brand-primary shadow-sm active:scale-90"
                               title="Configurar Perfil"
                             >
                               <Edit3 className="w-5 h-5" />
                             </button>
                             
                             {user.uid !== userData?.uid && (
                               <div className="flex items-center gap-2">
                                 {user.status === 'ativo' ? (
                                   <button 
                                     onClick={() => toggleStatus(user)}
                                     className="p-3 rounded-[14px] transition-all border shadow-sm active:scale-90 text-slate-400 hover:text-white hover:bg-red-500 border-slate-100 dark:border-slate-800 hover:border-red-500"
                                     title="Desativar Acesso"
                                   >
                                     <UserX className="w-5 h-5" />
                                   </button>
                                 ) : (
                                   <>
                                     <button 
                                       onClick={() => toggleStatus(user)}
                                       className="p-3 rounded-[14px] transition-all border shadow-sm active:scale-90 text-slate-400 hover:text-white hover:bg-emerald-500 border-slate-100 dark:border-slate-800 hover:border-emerald-500"
                                       title="Restaurar Acesso"
                                     >
                                       <CheckCircle2 className="w-5 h-5" />
                                     </button>
                                     <button 
                                       onClick={() => {
                                         setUserToDelete(user);
                                         setIsDeleteModalOpen(true);
                                       }}
                                       className="p-3 rounded-[14px] transition-all border shadow-sm active:scale-90 text-slate-400 hover:text-white hover:bg-red-600 border-slate-100 dark:border-slate-800 hover:border-red-600"
                                       title="Deletar Permanentemente"
                                     >
                                       <Trash2 className="w-5 h-5" />
                                     </button>
                                   </>
                                 )}
                               </div>
                             )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredUsers.length === 0 && (
              <div className="py-24 text-center">
                <Users className="w-20 h-20 text-slate-100 dark:text-slate-800 mx-auto mb-6" />
                <p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest text-sm">Nenhum funcionário compatível com a busca.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="p-16 text-center">
        <div className="h-px w-20 bg-emerald-500/20 mx-auto mb-8" />
        <p className="text-[10px] uppercase font-black tracking-[0.4em] text-slate-300 dark:text-slate-700 italic">
          BioSegurança ArqMed - Proteção e Compliance
        </p>
      </footer>

      {/* Modal de Cadastro/Edição */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden transition-colors flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-800"
            >
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                    {editingUser ? 'Configurar Perfil' : 'Novo Colaborador'}
                  </h3>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-1">Definições de acesso e segurança</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 custom-scrollbar">
                <div className="px-8 pt-8">
                  {editingUser && (
                    <div className="mb-8 p-6 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 rounded-3xl space-y-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-amber-500/10 rounded-xl">
                          <Key className="w-4 h-4 text-amber-600" />
                        </div>
                        <h4 className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">Segurança: Alterar Senha</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Nova Senha</label>
                          <div className="relative group">
                            <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-amber-500 transition-colors" />
                            <input 
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 transition-all font-medium text-sm"
                              placeholder="Mínimo 6 chars"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Confirmar</label>
                          <div className="relative group">
                            <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-amber-500 transition-colors" />
                            <input 
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 transition-all font-medium text-sm"
                              placeholder="Repita a senha"
                            />
                          </div>
                        </div>
                      </div>

                      <button 
                        type="button"
                        disabled={changingPassword || !newPassword}
                        onClick={handleUpdatePassword}
                        className="w-full py-4 bg-amber-500 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-amber-500/20 active:scale-95 hover:bg-amber-600"
                      >
                        {changingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Atualizar Credenciais'}
                      </button>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="p-8 pt-0 space-y-6">
                  <div className="space-y-5">
                    <div className="relative group">
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
                      <input 
                        required
                        type="text"
                        value={formData.nome}
                        onChange={(e) => setFormData({...formData, nome: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary/50 transition-all font-bold text-sm"
                        placeholder="Nome social ou completo"
                      />
                    </div>

                    <div className="relative group">
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">E-mail Profissional</label>
                      <input 
                        required
                        disabled={!!editingUser}
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary/50 transition-all font-bold text-sm disabled:opacity-50"
                        placeholder="usuario@bioseguranca.com"
                      />
                    </div>

                    {!editingUser && (
                      <div className="relative group">
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Senha Provisória</label>
                        <input 
                          required
                          type="password"
                          value={formData.senha}
                          onChange={(e) => setFormData({...formData, senha: e.target.value})}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary/50 transition-all font-bold text-sm"
                          placeholder="Mínimo 6 caracteres"
                          minLength={6}
                        />
                      </div>
                    )}

                    <div className="relative group">
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Cargo ou Especialidade</label>
                      <input 
                        required
                        type="text"
                        value={formData.cargo}
                        onChange={(e) => setFormData({...formData, cargo: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary/50 transition-all font-bold text-sm"
                        placeholder="Ex: Responsável Técnico"
                      />
                    </div>

                    <div className="relative group">
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Permissão de Visualização</label>
                      <select 
                        required
                        value={formData.verContratos}
                        onChange={(e) => setFormData({...formData, verContratos: e.target.value as any})}
                        className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary/50 transition-all font-black text-xs appearance-none"
                      >
                        <option value="">Selecione o nível...</option>
                        {VISIBILITY_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                      <div className="relative group">
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Nível de Acesso</label>
                        <select 
                          value={formData.tipo}
                          onChange={(e) => setFormData({...formData, tipo: e.target.value as any})}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary/50 transition-all font-black text-xs appearance-none"
                        >
                          <option value="funcionario">Colaborador</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </div>
                      <div className="relative group">
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Status Base</label>
                        <select 
                          value={formData.status}
                          onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                          className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary/50 transition-all font-black text-xs appearance-none"
                        >
                          <option value="ativo">Ativo</option>
                          <option value="inativo">Inativo</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 pb-2">
                    <button 
                      disabled={submitting}
                      type="submit"
                      className="w-full py-4.5 bg-brand-primary text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-2xl shadow-brand-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 hover:bg-emerald-600"
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : editingUser ? 'Finalizar Edição' : 'Registrar Colaborador'}
                      {!submitting && <ShieldCheck className="w-5 h-5 opacity-50" />}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação de Status */}
      <AnimatePresence>
        {isConfirmModalOpen && userToStatusToggle && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !statusLoading && setIsConfirmModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden transition-colors border border-slate-100 dark:border-slate-800"
            >
              <div className="p-10 text-center">
                <div className={`w-20 h-20 mx-auto rounded-[28px] flex items-center justify-center mb-8 shadow-2xl ${
                  userToStatusToggle.status === 'ativo' ? 'bg-red-50 dark:bg-red-900/20 text-red-500 shadow-red-500/10' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 shadow-emerald-500/10'
                }`}>
                  {userToStatusToggle.status === 'ativo' ? <ShieldAlert className="w-10 h-10" /> : <CheckCircle2 className="w-10 h-10" />}
                </div>
                
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight mb-3 uppercase">
                  {userToStatusToggle.status === 'ativo' ? 'Suspender Acesso' : 'Restaurar Acesso'}
                </h3>
                
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed mb-10 px-2">
                  {userToStatusToggle.status === 'ativo' 
                    ? `O colaborador "${userToStatusToggle.nome}" será impedido de entrar no sistema imediatamente.` 
                    : `O colaborador "${userToStatusToggle.nome}" poderá voltar a acessar todos os recursos do painel.`}
                </p>

                <div className="flex flex-col gap-4">
                  <button 
                    disabled={statusLoading}
                    onClick={handleConfirmStatusToggle}
                    className={`w-full py-4.5 font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                      userToStatusToggle.status === 'ativo' 
                        ? 'bg-red-600 text-white shadow-red-600/30 hover:bg-red-700' 
                        : 'bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700'
                    }`}
                  >
                    {statusLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (userToStatusToggle.status === 'ativo' ? 'Confirmar Suspensão' : 'Confirmar Ativação')}
                    {!statusLoading && <ArrowRight className="w-4 h-4 opacity-70" />}
                  </button>
                  
                  <button 
                    disabled={statusLoading}
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="w-full py-4 text-slate-400 dark:text-slate-500 font-black hover:text-slate-900 dark:hover:text-white transition-all text-[10px] uppercase tracking-[0.3em]"
                  >
                    Manter como está
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação de Deleção Permanente */}
      <AnimatePresence>
        {isDeleteModalOpen && userToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !deleteLoading && setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" 
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden transition-colors border border-red-100 dark:border-red-900/30"
            >
              <div className="p-10 text-center">
                <div className="w-20 h-20 mx-auto rounded-[28px] flex items-center justify-center mb-8 shadow-2xl bg-red-100 dark:bg-red-950/30 text-red-600 shadow-red-500/20">
                  <Trash2 className="w-10 h-10" />
                </div>
                
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight mb-3 uppercase px-4">
                  Deletar Permanentemente?
                </h3>
                
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-relaxed mb-10 px-2">
                  Tem certeza que deseja deletar permanentemente o funcionário <span className="font-black text-slate-900 dark:text-white">"{userToDelete.nome}"</span>? 
                  <br /><br />
                  <span className="text-red-500 font-bold uppercase text-[10px] tracking-tight">Esta ação não poderá ser desfeita.</span>
                </p>
 
                <div className="flex flex-col gap-4">
                  <button 
                    disabled={deleteLoading}
                    onClick={handlePermanentDelete}
                    className="w-full py-4.5 font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 bg-red-600 text-white shadow-red-600/30 hover:bg-red-700"
                  >
                    {deleteLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sim, deletar agora'}
                  </button>
                  
                  <button 
                    disabled={deleteLoading}
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="w-full py-4 text-slate-400 dark:text-slate-500 font-black hover:text-slate-900 dark:hover:text-white transition-all text-[10px] uppercase tracking-[0.3em]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
