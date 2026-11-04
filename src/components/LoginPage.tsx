import React, { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  ActionCodeSettings
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getBrandingConfig, BrandingData } from '../services/brandingService';
import { siteImages } from '../config/siteImages';
import ThemeToggleButton from './ThemeToggleButton';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Busca as configurações de marca ao carregar
  useEffect(() => {
    const loadBranding = async () => {
      const data = await getBrandingConfig();
      setBranding(data);
    };
    loadBranding();

    // Pre-fill from query parameters
    const params = new URLSearchParams(window.location.search);
    const cpf = params.get('cpf');
    const cnpj = params.get('cnpj');
    if (cpf || cnpj) {
      setFormData(prev => ({
        ...prev,
        username: (cpf || cnpj) as string
      }));
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (error) setError('');
    if (successMsg) setSuccessMsg('');
  };

  const handleForgotPassword = async () => {
    if (!formData.username) {
      setError('Por favor, informe seu e-mail no campo Usuário para recuperar a senha.');
      return;
    }
    
    setIsLoading(true);
    try {
      // Configura o idioma para o e-mail de recuperação
      auth.languageCode = 'pt-BR';

      // Configurações de redirecionamento após a troca de senha
      const actionCodeSettings: ActionCodeSettings = {
        url: 'https://app.biosegurancaarqmed.com.br/login',
        handleCodeInApp: false,
      };

      await sendPasswordResetEmail(auth, formData.username.trim(), actionCodeSettings);
      setSuccessMsg('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
      setError('');
    } catch (err: any) {
      console.error('Reset Password Error - Code:', err.code);
      console.error('Reset Password Error - Message:', err.message);
      console.error('Reset Password Error - Full Error:', err);
      
      switch (err.code) {
        case 'auth/user-not-found':
          setError('Nenhuma conta encontrada com esse e-mail.');
          break;
        case 'auth/invalid-email':
          setError('Digite um e-mail válido.');
          break;
        case 'auth/too-many-requests':
          setError('Muitas tentativas. Aguarde alguns minutos.');
          break;
        case 'auth/network-request-failed':
          setError('Erro de conexão.');
          break;
        default:
          setError(`Erro ao enviar e-mail de recuperação (${err.code || 'Erro desconhecido'}).`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setIsLoading(true);
    try {
      const rawLogin = formData.username.trim();
      const password = formData.password.trim();
      const digitsOnly = rawLogin.replace(/\D/g, '');

      console.log("LOGIN_DIGITADO:", rawLogin);
      console.log("CPF_NORMALIZADO:", digitsOnly);
      
      let loginEmail = rawLogin;
      if (!rawLogin.includes('@')) {
        if (digitsOnly.length === 11) {
          loginEmail = `${digitsOnly}@funcionario.arqmed.local`;
        } else if (digitsOnly.length === 14) {
          loginEmail = `${digitsOnly}@empresa.arqmed.local`;
        }
      }

      console.log("EMAIL_INTERNO_GERADO:", loginEmail);

      // Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
      console.log("AUTH_UID:", userCredential.user.uid);
      
      // O AppContext/AuthProvider cuidará de buscar os dados do usuário
      // e o App.tsx cuidará do redirecionamento baseado nos dados carregados.
      // Em vez de window.location.href, usaremos Navigate do react-router no App.tsx
      // Mas para garantir que force a recarga das rotas se necessário:
      // window.location.href = "/dashboard";
    } catch (err: any) {
      console.error('Firebase Auth Error:', err.code);
      switch (err.code) {
        case 'auth/user-not-found':
          setError('Usuário não encontrado no sistema.');
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
          setError('Credenciais inválidas. Verifique seu login e senha.');
          break;
        case 'auth/invalid-email':
          setError('O formato do e-mail ou documento é inválido.');
          break;
        case 'auth/user-disabled':
          setError('Este usuário foi desativado.');
          break;
        case 'auth/too-many-requests':
          setError('Muitas tentativas falhas. Tente novamente mais tarde.');
          break;
        default:
          setError('Falha na autenticação. Verifique suas credenciais.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white dark:bg-slate-950 overflow-hidden selection-brand font-sans transition-colors duration-300">
      {/* Container Principal */}
      <div className="w-full h-screen flex flex-col md:flex-row">
        
        {/* Lado Esquerdo - Minimalista com Foco Total na Logo (Desktop) */}
        <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-[#ffffff] via-[#f9fafb] to-[#f3f4f6] dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 relative items-center justify-center border-r border-slate-100 dark:border-slate-800">
          {/* Fundo sutil com profundidade */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-brand-primary/5 blur-[140px] opacity-30 animate-pulse-slow" />
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center justify-center w-full px-12"
          >
            <div className="relative group">
              {/* Brilho de profundidade ao redor da logo */}
              <div className="absolute inset-0 bg-brand-primary/5 blur-[120px] rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              
              <div className="relative flex items-center justify-center">
                <motion.img 
                  whileHover={{ scale: 1.03 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  src={siteImages.logoPrincipal} 
                  alt={branding?.companyName || 'BioSegurança ArqMed'} 
                  referrerPolicy="no-referrer"
                  className="w-full max-w-[400px] min-w-[350px] h-auto object-contain drop-shadow-[0_25px_60px_rgba(0,0,0,0.12)] hover:drop-shadow-[0_35px_80px_rgba(0,0,0,0.18)] cursor-pointer selection:bg-transparent dark:brightness-110"
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Lado Direito - Modern Login Form */}
        <div className="w-full md:w-1/2 flex items-center justify-center p-8 md:p-12 bg-white dark:bg-slate-950 relative">
          {/* Botão de Modo Escuro no Login */}
          <div className="absolute top-6 right-6 z-50">
            <ThemeToggleButton />
          </div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[400px] relative z-10"
          >
            {/* Mobile Branding (somente a logo dinâmica) */}
            <div className="flex md:hidden items-center flex-col gap-4 mb-12 justify-center">
              <div className="flex items-center justify-center">
                <img src={siteImages.logoPrincipal} className="h-16 w-auto object-contain dark:brightness-110" alt="Logo BioSegurança ArqMed" />
              </div>
              <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase transition-colors">
                {branding?.companyName || 'BioSegurança ArqMed'}
              </span>
            </div>

            <div className="mb-10 text-center md:text-left">
              <div className="flex justify-center md:justify-start items-center gap-2 mb-4">
                <div className="w-2 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em]">Secure Access Point</span>
              </div>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tighter transition-colors">Acesso Restrito</h3>
              <p className="text-slate-500 dark:text-slate-400 font-bold tracking-tight opacity-80 text-sm">Insira suas credenciais corporativas para validação e acesso aos protocolos de biosegurança.</p>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="mb-8 p-4 bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-black uppercase tracking-widest rounded-xl flex items-center gap-3"
                >
                  <p>{error}</p>
                </motion.div>
              )}
              {successMsg && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="mb-8 p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-black uppercase tracking-widest rounded-xl flex items-center gap-3"
                >
                  <p>{successMsg}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Usuário Input */}
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 dark:text-slate-600 ml-1 uppercase tracking-[0.2em]" htmlFor="username">
                  E-mail ou Usuário
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-300 group-focus-within:text-emerald-500 transition-colors">
                    <Mail className="w-[18px] h-[18px]" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    disabled={isLoading}
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="exemplo@arqmed.com.br"
                    className="block w-full pl-14 pr-4 py-4.5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 font-bold text-sm focus:outline-none focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/40 transition-all duration-300 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Senha Input */}
              <div className="space-y-3">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]" htmlFor="password">
                    Senha
                  </label>
                  <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    className="text-[10px] font-black text-emerald-500 hover:text-emerald-600 uppercase tracking-widest transition-colors"
                  >
                    Esqueci a Senha
                  </button>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-300 group-focus-within:text-emerald-500 transition-colors">
                    <Lock className="w-[18px] h-[18px]" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={isLoading}
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    className="block w-full pl-14 pr-12 py-4.5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 font-bold text-sm focus:outline-none focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/40 transition-all duration-300 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-5 flex items-center text-slate-300 hover:text-emerald-500 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="px-1">
                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      name="rememberMe"
                      checked={formData.rememberMe}
                      onChange={handleInputChange}
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all checked:bg-emerald-500 checked:border-emerald-500 hover:border-emerald-500/50 focus:outline-none shadow-sm"
                    />
                    <Check className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={5} />
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest group-hover:text-emerald-500 transition-colors select-none">Manter sessão ativa</span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full relative overflow-hidden bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-black py-5 px-8 rounded-2xl shadow-2xl shadow-slate-950/10 hover:shadow-emerald-500/20 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed group"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-[11px] uppercase tracking-[0.2em]">Autenticando...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] uppercase tracking-[0.2em]">Entrar no Sistema</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </motion.button>
              </div>
            </form>

            <div className="mt-20 pt-8 text-center border-t border-slate-50 dark:border-slate-900">
              <p className="text-[10px] uppercase font-black tracking-widest text-slate-300 dark:text-slate-700 transition-colors">
                Sistema ArqMed Technology
              </p>
            </div>
          </motion.div>
        </div>

      </div>
    </div>
  );
}
