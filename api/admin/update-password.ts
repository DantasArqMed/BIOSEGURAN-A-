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

  console.log("Project:", projectId);
  console.log("Client email exists:", !!clientEmail);
  console.log("Private key exists:", !!privateKey);

  if (!projectId || !clientEmail || !privateKey) {
    // Fallback: Tenta usar o arquivo de config local se estiver no ambiente local ou servidor
    console.log("Variáveis de ambiente incompletas. Tentando fallback para config local...");
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
    throw new Error("Firebase Admin credentials missing (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY)");
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método não permitido' });
  }

  const { uid, newPassword } = req.body;
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : req.body.idToken;

  console.log('--- Início da requisição update-password ---');
  console.log('UID alvo:', uid);
  console.log('Has newPassword:', !!newPassword);
  console.log('Has idToken:', !!idToken);

  if (!uid || !newPassword || !idToken) {
    return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes: uid, newPassword ou idToken' });
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

    // 1. Verificar o token
    console.log('Verificando token...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const adminUid = decodedToken.uid;
    console.log('Token verificado. UID do Admin logado:', adminUid);

    // 2. Verificar permissão de admin no Firestore
    const userDoc = await dbAdmin.collection('users').doc(adminUid).get();
    
    if (!userDoc.exists) {
      console.error('Erro: Usuário admin não encontrado no Firestore (users/' + adminUid + ')');
      return res.status(403).json({ success: false, message: 'Seu usuário não foi encontrado no banco de dados.' });
    }

    const userData = userDoc.data();
    // Aceita tanto 'tipo' quanto 'role' ou 'isAdmin' para ser flexível
    const isUserAdmin = userData?.tipo === 'admin' || userData?.role === 'admin' || userData?.isAdmin === true;

    if (!isUserAdmin) {
      console.error('Erro: Usuário não tem permissão de administrador.');
      return res.status(403).json({ success: false, message: 'Acesso negado. Você não tem permissão de administrador.' });
    }

    // 3. Validação de senha
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'A senha deve ter pelo menos 6 caracteres' });
    }

    // 4. Alterar senha
    console.log('Alterando senha para UID:', uid);
    await admin.auth().updateUser(uid, { password: newPassword });
    console.log('Senha alterada com sucesso.');

    return res.status(200).json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (error: any) {
    console.error('API Error:', error);
    let errorMsg = error.message || 'Erro ao processar alteração de senha';
    if (error.code === 'auth/user-not-found') {
      errorMsg = 'Usuário alvo não encontrado no sistema de autenticação.';
    }
    return res.status(500).json({ success: false, message: errorMsg });
  } finally {
    console.log('--- Fim da requisição update-password ---');
  }
}
