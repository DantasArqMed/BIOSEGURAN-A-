import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Helper para inicializar o Firebase Admin se necessário
const initAdmin = () => {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    // Fallback: Tenta usar o arquivo de config local
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
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método não permitido' });
  }

  const { uid, status } = req.body;
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;

  if (!uid || !status || !idToken) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes: uid, status ou idToken' });
  }

  try {
    initAdmin();
    
    // Obter o Database ID se disponível
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
    const adminUid = decodedToken.uid;

    if (adminUid === uid) {
      return res.status(400).json({ success: false, message: 'Você não pode desativar seu próprio usuário.' });
    }

    // 2. Verificar permissão de admin no Firestore
    const adminDoc = await dbAdmin.collection('users').doc(adminUid).get();
    if (!adminDoc.exists) {
      return res.status(403).json({ success: false, message: 'Seu usuário não foi encontrado no banco de dados.' });
    }

    const adminData = adminDoc.data();
    const isUserAdmin = adminData?.tipo === 'admin' || adminData?.role === 'admin' || adminData?.isAdmin === true;

    if (!isUserAdmin) {
      return res.status(403).json({ success: false, message: 'Acesso negado. Você não tem permissão de administrador.' });
    }

    // 3. Executar ações no Auth e Firestore
    const disable = status === 'inativo';
    
    // A. Bloquear/Desbloquear no Auth
    await admin.auth().updateUser(uid, { disabled: disable });

    // B. Atualizar o Firestore
    const updatePayload: any = {
      status: status,
      updatedAt: new Date().toISOString()
    };
    
    if (disable) {
      updatePayload.disabledAt = new Date().toISOString();
    }

    await dbAdmin.collection('users').doc(uid).update(updatePayload);

    return res.status(200).json({ 
      success: true, 
      message: `Funcionário ${disable ? 'desativado' : 'ativado'} com sucesso.` 
    });

  } catch (error: any) {
    console.error('API Error:', error);
    let errorMsg = error.message || 'Erro ao processar alteração de status';
    if (error.code === 'auth/user-not-found') {
      errorMsg = 'Usuário alvo não encontrado no sistema de autenticação.';
    }
    return res.status(500).json({ success: false, message: errorMsg });
  }
}
