import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Helper para inicializar o Firebase Admin
const initAdmin = () => {
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
    throw new Error("Firebase Admin credentials missing. Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.");
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
};

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('--- [VERCEL FUNCTION] INÍCIO DELETE USER ---');
  
  // Garantir Content-Type JSON
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Método não permitido. Utilize POST.' 
    });
  }

  const { uid, employeeId } = req.body;
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;

  console.log('Body recebido:', JSON.stringify(req.body));
  console.log('Token presente:', !!idToken);

  if (!idToken) {
    return res.status(401).json({ success: false, message: 'Token de autorização ausente.' });
  }

  if (!uid && !employeeId) {
    return res.status(400).json({ success: false, message: 'UID ou EmployeeID ausente.' });
  }

  try {
    initAdmin();
    
    // Obter o Database ID
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

    // 1. Verificar o token do administrador
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const adminEmail = decodedToken.email;
    const adminUid = decodedToken.uid;
    console.log(`Admin logado: ${adminEmail} (${adminUid})`);

    // Lista de administradores autorizados
    const authorizedEmails = [
      'admin@admin.com',
      'davidallanos16@gmail.com',
      'bioseguranca@hotmail.com',
      'dantasarqmed@gmail.com'
    ];

    if (!adminEmail || !authorizedEmails.includes(adminEmail)) {
      console.error(`Tentativa de exclusão negada para: ${adminEmail}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Acesso negado. Você não é um administrador autorizado para esta operação de exclusão permanente.' 
      });
    }

    if (adminUid === uid || adminUid === employeeId) {
      return res.status(400).json({ success: false, message: 'Você não pode deletar seu próprio usuário.' });
    }

    // Buscar o perfil do usuário para classificar antes de deletar
    const targetDocId = employeeId || uid;
    let targetUserDoc: any = null;
    let isInternalTarget = false;

    if (targetDocId) {
      try {
        const uDoc = await dbAdmin.collection('users').doc(targetDocId).get();
        if (uDoc.exists) {
          targetUserDoc = uDoc.data();
          isInternalTarget = isInternalEmployeeBackend(targetUserDoc);
        }
      } catch (err) {
        console.warn('Erro ao carregar dados do usuário antes da deleção:', err);
      }
    }

    let deletedFromAuth = false;

    // 2. Tentar deletar do Firebase Auth
    if (uid) {
      try {
        console.log(`Deletando do Auth: ${uid}`);
        await admin.auth().deleteUser(uid);
        deletedFromAuth = true;
        console.log('Removido do Auth com sucesso.');
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found') {
          console.warn('Usuário não encontrado no Auth. Prosseguindo para exclusão no Firestore.');
        } else {
          console.error('Erro ao deletar do Auth:', authErr);
          throw authErr;
        }
      }
    }

    // 3. Deletar do Firestore
    if (targetDocId) {
      console.log(`Deletando do Firestore: users/${targetDocId}`);
      await dbAdmin.collection('users').doc(targetDocId).delete();
      console.log('Removido do Firestore com sucesso.');
    }

    console.log('--- [VERCEL FUNCTION] SUCESSO ---');
    return res.status(200).json({
      success: true,
      message: deletedFromAuth 
        ? 'Funcionário deletado permanentemente (Auth e Firestore).' 
        : 'Documento do funcionário deletado do Firestore (não constava no Auth).'
    });

  } catch (error: any) {
    console.error('--- [VERCEL FUNCTION] ERRO ---');
    console.error('Mensagem:', error.message);
    console.error('Código:', error.code || 'sem código');
    
    return res.status(500).json({
      success: false,
      message: error.message || 'Erro interno ao processar exclusão permanente',
      code: error.code || null,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
