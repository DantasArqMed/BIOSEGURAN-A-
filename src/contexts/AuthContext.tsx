import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { logService } from '../services/logService';
import { isAsoWorker, isInternalEmployee } from '../utils/userClassification';

// Bootstrap helper: ensures specific users are always admins
async function ensureAdminPromotion(currentUser: User, existingData: UserData | null) {
  const adminEmails = ['admin@admin.com', 'dantasarqmed@gmail.com'];
  
  if (currentUser.email && adminEmails.includes(currentUser.email)) {
    if (!existingData || existingData.tipo !== 'admin' || existingData.status !== 'ativo') {
      const userRef = doc(db, 'users', currentUser.uid);
      const adminData = {
        uid: currentUser.uid,
        nome: existingData?.nome || (currentUser.email === 'admin@admin.com' ? 'Administrador Principal' : 'User Admin'),
        email: currentUser.email,
        cargo: existingData?.cargo || 'Admin Master',
        tipo: 'admin' as const,
        status: 'ativo' as const,
        createdAt: existingData?.createdAt || new Date().toISOString(),
        verContratos: 'Todos' as const
      };
      
      await setDoc(userRef, adminData, { merge: true });
      console.log(`User ${currentUser.email} promoted/verified as admin.`);
      
      return adminData;
    }
  }
  return existingData;
}

interface UserData {
  uid: string;
  nome: string;
  email: string;
  cargo: string;
  loginVisivel?: string;
  empresaId?: string;
  tipo: 'admin' | 'empresa' | 'funcionario' | 'aso_funcionario';
  role?: string;
  canViewOnlyASO?: boolean;
  status: 'ativo' | 'inativo';
  cidade?: string;
  verContratos?: 'Campo Grande' | 'Rondonópolis' | 'Todos';
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAdmin: false,
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          let data = userDoc.exists() ? (userDoc.data() as UserData) : null;
          
          // Force promotion if email matches
          data = await ensureAdminPromotion(currentUser, data);

          if (data) {
            console.log("LOGIN_USER_PROFILE_LOADED", data);
            if (isInternalEmployee(data)) {
              console.log("LOGIN_USER_CLASSIFIED_AS_INTERNAL_EMPLOYEE", data.email || data.uid);
            } else if (isAsoWorker(data)) {
              console.log("LOGIN_USER_CLASSIFIED_AS_ASO_WORKER", data.email || data.uid);
            }

            if (data.status === 'inativo') {
              console.warn("Acesso bloqueado: Usuário inativo.");
              await signOut(auth);
              setUserData(null);
              setUser(null);
              setIsAdmin(false);
            } else {
              console.log("PERFIL_ENCONTRADO:", data.nome);
              console.log("TIPO_USUARIO:", data.tipo);
              setUserData(data);
              setIsAdmin(data.tipo === 'admin' && data.status === 'ativo');
              
              // Log login once per session
              const sessionKey = `logged_login_${currentUser.uid}`;
              if (!sessionStorage.getItem(sessionKey)) {
                await logService.record(
                  { uid: data.uid, nome: data.nome, email: data.email },
                  'LOGIN',
                  `Usuário realizou acesso ao sistema.`
                );
                sessionStorage.setItem(sessionKey, 'true');
              }
            }
          } else {
            setUserData(null);
            setIsAdmin(false);
          }
        } catch (error) {
          console.error("Erro ao buscar dados do usuário:", error);
          setUserData(null);
          setIsAdmin(false);
        }
      } else {
        setUserData(null);
        setIsAdmin(false);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
