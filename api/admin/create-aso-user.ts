import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Helper para inicializar o Firebase Admin se necessário
function initAdmin() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    try {
      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return admin.initializeApp({
          projectId: appletConfig.projectId,
        });
      }
    } catch (err) {
      console.warn("Falha ao ler config local:", err);
    }
    throw new Error("Firebase Admin credentials missing");
  }

  const formattedKey = privateKey
    .replace(/\\n/g, "\n")
    .replace(/^"(.*)"$/, "$1");

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: formattedKey,
    }),
  });
}

// Helper para classificar usuários no backend
function isInternalEmployeeBackend(u: any): boolean {
  if (!u) return false;
  let isInternal = false;
  
  if (u.source === "app" && u.isAsoUser === false) {
    isInternal = true;
  } else if (u.source === "aso" || u.isAsoUser === true || u.userType === "aso_funcionario") {
    isInternal = false;
  } else {
    const isAsoByLegacy = 
      u.email?.endsWith('@funcionario.arqmed.local') || 
      u.email?.endsWith('@empresa.arqmed.local') || 
      u.createdAutomatically === true ||
      u.canViewOnlyASO === true ||
      (u.loginVisivel && u.loginVisivel.length === 11) ||
      u.empresaId ||
      u.tipo === 'aso_funcionario';

    if (isAsoByLegacy) {
      isInternal = false;
    } else if (u.tipo === 'admin' || u.tipo === 'funcionario') {
      isInternal = true;
    } else {
      isInternal = false;
    }
  }

  if (isInternal) {
    console.log("USER_CLASSIFICATION_INTERNAL", u.email || u.uid || u.nome || "");
  } else {
    console.log("USER_CLASSIFICATION_ASO", u.email || u.uid || u.nome || "");
  }
  return isInternal;
}

export default async function handler(req: any, res: any) {
  console.log('API_CREATE_ASO_USER_METHOD:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: "Method not allowed",
      method: req.method
    });
  }

  console.log('API_CREATE_ASO_USER_BODY:', JSON.stringify(req.body));
  
  const { tipo, cpfOuCnpj, nome, empresaId, empresaNome } = req.body;
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : req.body.idToken;

  if (!tipo || !cpfOuCnpj || !nome || !idToken) {
    return res.status(400).json({ 
      error: "Campos obrigatórios ausentes",
      details: 'tipo, cpfOuCnpj, nome ou idToken'
    });
  }

  const cleanId = cpfOuCnpj.replace(/\D/g, '');
  const domain = tipo === 'empresa' ? 'empresa.arqmed.local' : 'funcionario.arqmed.local';
  const email = `${cleanId}@${domain}`;
  const password = cleanId.slice(-6);

  console.log("ASO_USER_CREATE_START", email);

  try {
    initAdmin();
    
    let firestoreDatabaseId = '';
    try {
      const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        firestoreDatabaseId = appletConfig.firestoreDatabaseId || '';
      }
    } catch (e) {}

    const dbAdmin = firestoreDatabaseId 
      ? getFirestore(admin.apps[0]!, firestoreDatabaseId)
      : getFirestore(admin.apps[0]!);

    // 1. Verificar Token do Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const adminUid = decodedToken.uid;
    console.log('API_CREATE_ASO_USER_AUTH_UID:', adminUid);
    
    // Lista de admins permitidos via email (hardcoded do firestore.rules para consistência)
    const allowedAdmins = [
      'admin@admin.com',
      'dantasarqmed@gmail.com',
      'davidallanos16@gmail.com',
      'bioseguranca@hotmail.com'
    ];

    const adminDoc = await dbAdmin.collection('users').doc(adminUid).get();
    const adminData = adminDoc.data();
    const isUserAdmin = adminData?.tipo === 'admin' || adminData?.role === 'admin' || 
                       allowedAdmins.includes(decodedToken.email?.toLowerCase() || '');

    if (!isUserAdmin) {
      console.log("ASO_USER_CREATE_ERROR", email, "Acesso negado.");
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem criar usuários.' });
    }

    // SEGURANÇA: Verificar se já existe um funcionário interno com esse login ou e-mail corporativo ou UID
    // Para evitar de sobrescrever dados com o fluxo ASO
    const checkUsersSnap = await dbAdmin.collection('users').where('email', '==', email).get();
    if (!checkUsersSnap.empty) {
      for (const uDoc of checkUsersSnap.docs) {
        if (isInternalEmployeeBackend(uDoc.data())) {
          console.log("ASO_USER_CREATE_ERROR", email, "Conflito: Pertence a funcionário interno da ArqMed");
          return res.status(403).json({ error: "Esse e-mail de login pertence a um funcionário interno e não pode ser sobrescrito pelo fluxo de ASO." });
        }
      }
    }

    let authUser;
    let status = 'criado';
    let uid = '';

    // 2. Verificar se existe no Firebase Auth
    try {
      authUser = await admin.auth().getUserByEmail(email);
      uid = authUser.uid;
      
      const existingDoc = await dbAdmin.collection('users').doc(uid).get();
      if (existingDoc.exists && isInternalEmployeeBackend(existingDoc.data())) {
        console.log("ASO_USER_CREATE_ERROR", email, "Conflito: UID pertence a funcionário interno da ArqMed");
        return res.status(403).json({ error: "Esse UID de login pertence a um funcionário interno e não pode ser sobrescrito pelo fluxo de ASO." });
      }

      // Se existe, atualizar senha e garantir que está ativo
      await admin.auth().updateUser(uid, {
        password: password,
        displayName: nome,
        disabled: false
      });
      status = 'senha_redefinida';
      console.log("AUTH_USER_RECREATED", true);
      console.log("ASO_USER_CREATE_ALREADY_EXISTS", email);
    } catch (authErr: any) {
      if (authErr.code === 'auth/user-not-found') {
        // Criar novo
        const newUser = await admin.auth().createUser({
          email,
          password,
          displayName: nome,
        });
        uid = newUser.uid;
        console.log("AUTH_USER_CREATED_SUCCESS", true);
      } else {
        throw authErr;
      }
    }

    // 3. Criar ou Atualizar Perfil no Firestore
    const userProfile = {
      uid,
      nome,
      email,
      loginVisivel: cleanId,
      cpfNormalizado: tipo === 'funcionario' ? cleanId : null,
      cnpjNormalizado: tipo === 'empresa' ? cleanId : null,
      emailInterno: email,
      tipo: tipo === 'funcionario' ? 'aso_funcionario' : tipo,
      role: tipo === 'funcionario' ? 'aso_viewer' : (tipo === 'empresa' ? 'cliente' : 'user'),
      status: 'ativo',
      createdAutomatically: true,
      mustChangePassword: true,
      canViewOnlyASO: tipo === 'funcionario',
      verContratos: tipo === 'empresa' ? 'Todos' : 'Nenhum',
      updatedAt: new Date().toISOString(),
      cargo: tipo === 'empresa' ? 'Empresa / Cliente' : 'Funcionário do ASO',
      empresaNome: empresaNome || null,
      empresaId: empresaId || null,
      
      // Identificadores obrigatórios do ASO/Trabalhador
      source: "aso",
      userType: tipo === 'funcionario' ? "aso_funcionario" : "aso_empresa",
      portalRole: tipo === 'funcionario' ? "funcionario" : "empresa",
      isAsoUser: true
    };

    await dbAdmin.collection('users').doc(uid).set(userProfile, { merge: true });
    
    console.log("ASO_USER_CREATE_SUCCESS", email);
    console.log("API_CREATE_ASO_USER_SUCCESS:", status);

    return res.status(200).json({ 
      success: true, 
      status, 
      uid, 
      email,
      loginVisivel: cleanId
    });

  } catch (error: any) {
    console.log("ASO_USER_CREATE_ERROR", email || cpfOuCnpj, error?.message || error);
    console.error('API_CREATE_ASO_USER_ERROR:', error);
    return res.status(500).json({ 
      error: "Erro ao criar usuário ASO",
      details: String(error?.message || error)
    });
  }
}
