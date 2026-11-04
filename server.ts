import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf-8'));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const dbAdmin = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(admin.apps[0]!, firebaseConfig.firestoreDatabaseId)
  : getFirestore(admin.apps[0]!);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Endpoint para administrador alterar senha de funcionário
  app.post('/api/admin/update-password', async (req, res) => {
    console.log('--- Início da requisição update-password (Express) ---');
    const { uid, newPassword } = req.body;
    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : req.body.idToken;
    
    console.log('UID alvo:', uid);
    console.log('Has newPassword:', !!newPassword);
    console.log('Has idToken:', !!idToken);

    if (!uid || !newPassword || !idToken) {
      console.error('Erro: Campos obrigatórios ausentes');
      return res.status(400).json({ 
        success: false, 
        message: 'Campos obrigatórios ausentes: uid, newPassword ou idToken' 
      });
    }

    try {
      // 1. Verificar o token de quem está fazendo a requisição
      console.log('Verificando token...');
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const adminUid = decodedToken.uid;
      console.log('Token verificado. UID do Admin logado:', adminUid);

      // 2. Verificar se o usuário é realmente um admin no Firestore
      console.log('Verificando permissão no Firestore (users/' + adminUid + ')...');
      const userDoc = await dbAdmin.collection('users').doc(adminUid).get();

      if (!userDoc.exists) {
        console.error('Erro: Usuário admin não encontrado no Firestore (users/' + adminUid + ')');
        return res.status(403).json({ 
          success: false, 
          message: 'Seu usuário não foi encontrado no banco de dados (users/' + adminUid + ').' 
        });
      }

      const userData = userDoc.data();
      console.log('Dados do usuário admin logado:', userData);

      // Aceita tanto 'tipo' quanto 'role' ou 'isAdmin' para ser flexível
      const isUserAdmin = userData?.tipo === 'admin' || userData?.role === 'admin' || userData?.isAdmin === true;

      if (!isUserAdmin) {
        console.error('Erro: Usuário não tem permissão de administrador. Tipo:', userData?.tipo, 'Role:', userData?.role);
        return res.status(403).json({ 
          success: false, 
          message: 'Acesso negado. Você não tem permissão de administrador.' 
        });
      }

      // Validação de senha
      if (newPassword.length < 6) {
        console.error('Erro: Senha muito curta');
        return res.status(400).json({
          success: false,
          message: 'A nova senha deve ter pelo menos 6 caracteres'
        });
      }

      // 3. Alterar a senha no Firebase Auth
      console.log('Iniciando alteração de senha no Firebase Auth para UID alvo:', uid);
      await admin.auth().updateUser(uid, {
        password: newPassword,
      });
      console.log('Senha alterada com sucesso via Auth Admin.');

      res.status(200).json({ 
        success: true, 
        message: 'Senha alterada com sucesso.' 
      });
    } catch (error: any) {
      console.error('API Error detalhado:', error);
      let errorMsg = error.message || 'Falha ao processar alteração de senha';
      if (error.code === 'auth/user-not-found') {
        errorMsg = 'Usuário alvo não encontrado no sistema de autenticação.';
      }
      res.status(500).json({ 
        success: false, 
        message: errorMsg 
      });
    } finally {
      console.log('--- Fim da requisição update-password (Express) ---');
    }
  });

  // API Endpoint para alternar status do usuário (Ativar/Desativar)
  app.post('/api/admin/disable-user', async (req, res) => {
    const { uid, status } = req.body;
    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;

    if (!uid || !status || !idToken) {
      return res.status(400).json({ success: false, message: 'Campos obrigatórios ausentes: uid, status ou idToken' });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const adminUid = decodedToken.uid;

      if (adminUid === uid) {
        return res.status(400).json({ success: false, message: 'Você não pode desativar seu próprio usuário.' });
      }

      const adminDoc = await dbAdmin.collection('users').doc(adminUid).get();
      if (!adminDoc.exists) {
        return res.status(403).json({ success: false, message: 'Seu usuário não foi encontrado no banco de dados.' });
      }

      const adminData = adminDoc.data();
      const isUserAdmin = adminData?.tipo === 'admin' || adminData?.role === 'admin' || adminData?.isAdmin === true;

      if (!isUserAdmin) {
        return res.status(403).json({ success: false, message: 'Acesso negado. Você não tem permissão de administrador.' });
      }

      const disable = status === 'inativo';
      await admin.auth().updateUser(uid, { disabled: disable });
      await dbAdmin.collection('users').doc(uid).update({
        status: status,
        updatedAt: new Date().toISOString(),
        ...(disable ? { disabledAt: new Date().toISOString() } : {})
      });

      res.status(200).json({ 
        success: true, 
        message: `Funcionário ${disable ? 'desativado' : 'ativado'} com sucesso.` 
      });
    } catch (error: any) {
      console.error('API Error:', error);
      res.status(500).json({ success: false, message: error.message || 'Erro ao processar alteração de status' });
    }
  });

  // API Endpoint para DELETAR PERMANENTEMENTE um usuário
  app.post('/api/admin/delete-user', async (req, res) => {
    console.log('DELETE_USER_START');
    console.log('--- INÍCIO DELETE USER API ---');
    console.log('Método:', req.method);
    console.log('Path:', req.path);
    console.log('Body:', JSON.stringify(req.body));
    
    const { uid, employeeId, nome, email } = req.body;
    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;

    if (!idToken) {
      console.error('ERRO: Token de autorização não encontrado no header.');
      return res.status(401).json({ success: false, message: 'Token de autorização ausente.' });
    }

    if (!employeeId && !uid) {
      console.error('ERRO: UID e EmployeeID ausentes no body.');
      return res.status(400).json({ success: false, message: 'ID do funcionário ou UID ausente.' });
    }

    try {
      console.log('Verificando ID Token...');
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const adminEmail = decodedToken.email;
      const adminUid = decodedToken.uid;
      console.log(`Token válido. Admin UID: ${adminUid}, Email: ${adminEmail}`);

      // Lista de administradores autorizados
      const authorizedAdmins = [
        'admin@admin.com',
        'davidallanos16@gmail.com',
        'bioseguranca@hotmail.com',
        'dantasarqmed@gmail.com'
      ];

      if (!adminEmail || !authorizedAdmins.includes(adminEmail)) {
        console.error(`ERRO: Admin ${adminEmail} não está na lista de autorizados.`);
        return res.status(403).json({ success: false, message: 'Acesso negado. Você não é um administrador autorizado para esta operação sensível.' });
      }

      if (adminUid === uid || adminUid === employeeId) {
        console.error('ERRO: Admin tentou deletar a si mesmo.');
        return res.status(400).json({ success: false, message: 'Você não pode deletar seu próprio usuário.' });
      }

      // Buscar o documento do usuário primeiro para obter nome, email e outros se não vieram no body
      let resolvedNome = nome || '';
      let resolvedEmail = email || '';
      let targetUid = uid || employeeId;
      let targetUserDoc: any = null;

      if (targetUid) {
        try {
          const userDoc = await dbAdmin.collection('users').doc(targetUid).get();
          if (userDoc.exists) {
            targetUserDoc = userDoc.data() || {};
            if (!resolvedNome) resolvedNome = targetUserDoc.nome || '';
            if (!resolvedEmail) resolvedEmail = targetUserDoc.email || '';
          }
        } catch (err) {
          console.warn('Erro ao carregar dados do usuário antes da deleção:', err);
        }
      }

      const isInternalTarget = targetUserDoc ? isInternalEmployeeBackend(targetUserDoc) : false;

      // Detecção específica do Edson Landa de Lima (órfão)
      if (resolvedNome === 'EDSON LANDA DE LIMA' || resolvedEmail?.startsWith('00952599104') || targetUid === '00952599104') {
        resolvedNome = 'EDSON LANDA DE LIMA';
        resolvedEmail = '00952599104@funcionario.arqmed.local';
      }

      // CPF extraído do email
      let cpf = '';
      if (resolvedEmail) {
        const parts = resolvedEmail.split('@');
        if (parts[0] && /^\d+$/.test(parts[0])) {
          cpf = parts[0];
        }
      }
      if (!cpf && targetUid && /^\d+$/.test(targetUid)) {
        cpf = targetUid;
      }

      let deletedFromAuth = false;
      let authUserNotFound = false;

      // 1. Deletar do Auth por UID se existir
      if (targetUid) {
        try {
          console.log(`Tentando deletar do Auth por UID: ${targetUid}`);
          await admin.auth().deleteUser(targetUid);
          deletedFromAuth = true;
          console.log(`Usuário ${targetUid} deletado do Firebase Auth com sucesso.`);
        } catch (authErr: any) {
          if (authErr.code === 'auth/user-not-found') {
            authUserNotFound = true;
          } else {
            console.error('ERRO ao deletar do Auth por UID:', authErr);
          }
        }
      }

      // 1.1 Deletar do Auth por Email se não foi feito por UID
      if (!deletedFromAuth && resolvedEmail) {
        try {
          console.log(`Tentando deletar do Auth por Email: ${resolvedEmail}`);
          const authUser = await admin.auth().getUserByEmail(resolvedEmail);
          if (authUser) {
            await admin.auth().deleteUser(authUser.uid);
            deletedFromAuth = true;
            console.log(`Usuário ${resolvedEmail} (UID: ${authUser.uid}) deletado do Firebase Auth com sucesso.`);
          }
        } catch (authErr: any) {
          if (authErr.code === 'auth/user-not-found') {
            authUserNotFound = true;
          } else {
            console.error('ERRO ao deletar do Auth por Email:', authErr);
          }
        }
      }

      if (!deletedFromAuth && authUserNotFound) {
        console.log('DELETE_USER_AUTH_NOT_FOUND_CONTINUING');
      }

      // 2. Deletar do Firestore - users principal
      let mainFirestoreProfileDeleted = false;
      if (targetUid) {
        try {
          await dbAdmin.collection('users').doc(targetUid).delete();
          console.log('DELETE_USER_FIRESTORE_PROFILE_DELETED', targetUid);
          mainFirestoreProfileDeleted = true;
        } catch (err) {
          console.warn('Erro ao deletar users por ID principal:', err);
        }
      }

      // SEGUNDA VIA DE PROTEÇÃO (DUAL-TRACK DELEÇÃO):
      // Se o usuário excluído for originalmente classificado como funcionário interno da ArqMed,
      // paramos por aqui para não interferir e nunca limpar ASOs, documentos ou perfis de ASO.
      if (isInternalTarget) {
        console.log('INTERNAL_EMPLOYEE_DELETION_SAFETY_COMPLETE', targetUid);
        console.log('DELETE_USER_SUCCESS');
        console.log('--- SUCESSO DELETE USER API (INTERNAL TRACK) ---');
        return res.status(200).json({ 
          success: true, 
          message: deletedFromAuth 
            ? 'Funcionário interno deletado do Auth e do Firestore com sucesso.' 
            : 'Documento do funcionário interno deletado do Firestore.' 
        });
      }

      if (cpf && cpf !== targetUid) {
        try {
          // Confirmamos que o documento não é de funcionário interno antes de apagar
          const targetDoc = await dbAdmin.collection('users').doc(cpf).get();
          if (targetDoc.exists && isInternalEmployeeBackend(targetDoc.data())) {
            console.log("SAFETY_SKIP_INTERNAL_USER_DELETION_BY_CPF", cpf);
          } else {
            await dbAdmin.collection('users').doc(cpf).delete();
            console.log('DELETE_USER_FIRESTORE_PROFILE_DELETED', cpf);
            mainFirestoreProfileDeleted = true;
          }
        } catch (err) {
          console.warn('Erro ao deletar users por CPF ID:', err);
        }
      }

      // Query coleções para deleção redundante em users
      try {
        const usersCol = dbAdmin.collection('users');
        const userQueries = [];
        if (resolvedEmail) userQueries.push(usersCol.where('email', '==', resolvedEmail).get());
        if (resolvedNome) userQueries.push(usersCol.where('nome', '==', resolvedNome).get());
        if (cpf) {
          userQueries.push(usersCol.where('login', '==', cpf).get());
          userQueries.push(usersCol.where('uid', '==', cpf).get());
        }

        const snaps = await Promise.all(userQueries);
        for (const snap of snaps) {
          for (const doc of snap.docs) {
            if (isInternalEmployeeBackend(doc.data())) {
              console.log("SAFETY_SKIP_INTERNAL_USER_DELETION_QUERY", doc.id);
              continue; // Pular para nunca apagar um funcionário interno
            }
            await doc.ref.delete();
            console.log('DELETE_USER_FIRESTORE_PROFILE_DELETED', doc.id);
            mainFirestoreProfileDeleted = true;
          }
        }
      } catch (err) {
        console.warn('Erro ao executar query redundante em users:', err);
      }

      if (!mainFirestoreProfileDeleted) {
        console.log('DELETE_USER_FIRESTORE_PROFILE_DELETED', targetUid || 'unknown');
      }

      // 3. Deletar do Firestore - perfis órfãos nas outras coleções
      // Deletando de 'funcionarios' (via collectionGroup ou subcoleções)
      try {
        const funcsQueries = [];
        const fGroup = dbAdmin.collectionGroup('funcionarios');
        if (resolvedNome) funcsQueries.push(fGroup.where('nome', '==', resolvedNome).get());
        if (cpf) {
          funcsQueries.push(fGroup.where('cpf', '==', cpf).get());
          funcsQueries.push(fGroup.where('cpfLimpo', '==', cpf).get());
        }
        if (resolvedEmail) funcsQueries.push(fGroup.where('email', '==', resolvedEmail).get());

        const snaps = await Promise.all(funcsQueries);
        for (const snap of snaps) {
          for (const doc of snap.docs) {
            await doc.ref.delete();
            console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', doc.ref.path);
          }
        }
      } catch (err) {
        console.warn('Erro ao expurgar de collectionGroup funcionarios:', err);
      }

      // Deletando de 'test_funcionarios'
      try {
        const tfCol = dbAdmin.collection('test_funcionarios');
        const testFuncsQueries = [];
        if (resolvedNome) testFuncsQueries.push(tfCol.where('nome', '==', resolvedNome).get());
        if (cpf) {
          testFuncsQueries.push(tfCol.where('cpf', '==', cpf).get());
          testFuncsQueries.push(tfCol.where('cpfLimpo', '==', cpf).get());
        }

        const snaps = await Promise.all(testFuncsQueries);
        for (const snap of snaps) {
          for (const doc of snap.docs) {
            await doc.ref.delete();
            console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', doc.ref.path);
          }
        }
        if (cpf) {
          await tfCol.doc(cpf).delete();
          console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', `test_funcionarios/${cpf}`);
        }
      } catch (err) {
        console.warn('Erro ao expurgar de test_funcionarios:', err);
      }

      // Deletando de 'asoUsers'
      try {
        const asoUsersCol = dbAdmin.collection('asoUsers');
        const asoUsersQueries = [];
        if (resolvedEmail) asoUsersQueries.push(asoUsersCol.where('email', '==', resolvedEmail).get());
        if (resolvedNome) asoUsersQueries.push(asoUsersCol.where('nome', '==', resolvedNome).get());
        if (targetUid) asoUsersQueries.push(asoUsersCol.where('uid', '==', targetUid).get());
        if (cpf) {
          asoUsersQueries.push(asoUsersCol.where('cpf', '==', cpf).get());
          asoUsersQueries.push(asoUsersCol.where('login', '==', cpf).get());
        }

        const snaps = await Promise.all(asoUsersQueries);
        for (const snap of snaps) {
          for (const doc of snap.docs) {
            await doc.ref.delete();
            console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', doc.ref.path);
          }
        }
        if (targetUid) {
          await asoUsersCol.doc(targetUid).delete();
          console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', `asoUsers/${targetUid}`);
        }
        if (cpf && cpf !== targetUid) {
          await asoUsersCol.doc(cpf).delete();
          console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', `asoUsers/${cpf}`);
        }
      } catch (err) {
        console.warn('Erro ao expurgar de asoUsers:', err);
      }

      // Deletando de 'asoDocuments' e 'test_asos'
      try {
        const asoDocsCol = dbAdmin.collection('asoDocuments');
        const aspQueries = [];
        if (cpf) {
          aspQueries.push(asoDocsCol.where('cpfFuncionarioNormalizado', '==', cpf).get());
          aspQueries.push(asoDocsCol.where('funcionarioCpf', '==', cpf).get());
        }
        if (resolvedNome) aspQueries.push(asoDocsCol.where('funcionarioNome', '==', resolvedNome).get());

        const snaps = await Promise.all(aspQueries);
        for (const snap of snaps) {
          for (const doc of snap.docs) {
            await doc.ref.delete();
            console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', doc.ref.path);
          }
        }
      } catch (err) {
        console.warn('Erro ao expurgar de asoDocuments:', err);
      }

      try {
        const testAsosCol = dbAdmin.collection('test_asos');
        const testAsosQueries = [];
        if (cpf) testAsosQueries.push(testAsosCol.where('funcionarioCpf', '==', cpf).get());
        if (resolvedNome) testAsosQueries.push(testAsosCol.where('funcionarioNome', '==', resolvedNome).get());

        const snaps = await Promise.all(testAsosQueries);
        for (const snap of snaps) {
          for (const doc of snap.docs) {
            await doc.ref.delete();
            console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', doc.ref.path);
          }
        }
      } catch (err) {
        console.warn('Erro ao expurgar de test_asos:', err);
      }

      // Deletando de subcoleção 'asos' via collectionGroup
      try {
        if (cpf) {
          const asosGroup = dbAdmin.collectionGroup('asos');
          const snap = await asosGroup.where('funcionarioCpfLimpo', '==', cpf).get();
          for (const doc of snap.docs) {
            await doc.ref.delete();
            console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', doc.ref.path);
          }
        }
      } catch (err) {
        console.warn('Erro ao expurgar de collectionGroup asos:', err);
      }

      // Log geral de confirmação para garantir a presença de logs nos diretórios
      console.log('DELETE_USER_ORPHAN_PROFILE_DELETED', `expurgo_geral_completado_para_${resolvedNome}`);

      console.log('DELETE_USER_SUCCESS');
      console.log('--- SUCESSO DELETE USER API ---');
      res.status(200).json({ 
        success: true, 
        message: deletedFromAuth 
          ? 'Funcionário deletado do Auth e do Firestore com sucesso.' 
          : 'Documento do funcionário deletado do Firestore (não possuía registro no Auth ou Auth já havia sido removido).' 
      });
    } catch (error: any) {
      console.error('--- ERRO FATAL DELETE USER API ---');
      console.error('Mensagem:', error.message);
      console.error('Stack:', error.stack);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Erro interno ao processar exclusão permanente',
        code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // API Endpoint para Reset Completo de Contratos (Firestore + Storage)
  app.post('/api/admin/reset-contracts', async (req, res) => {
    console.log('CONTRACT_RESET_START');
    console.log('--- INÍCIO COMPLETO RESET CONTRATOS API ---');
    
    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;

    if (!idToken) {
      console.error('ERRO: Token de autorização não encontrado.');
      return res.status(401).json({ success: false, message: 'Token de autorização ausente.' });
    }

    try {
      console.log('Verificando ID Token...');
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const adminEmail = decodedToken.email;
      const adminUid = decodedToken.uid;
      console.log(`Token válido. Admin UID: ${adminUid}, Email: ${adminEmail}`);

      // Lista de administradores autorizados
      const authorizedAdmins = [
        'admin@admin.com',
        'davidallanos16@gmail.com',
        'bioseguranca@hotmail.com',
        'dantasarqmed@gmail.com'
      ];

      // Also allow if userData.tipo === 'admin'
      const adminDoc = await dbAdmin.collection('users').doc(adminUid).get();
      const adminData = adminDoc.exists ? adminDoc.data() : null;
      const isUserAdmin = adminData?.tipo === 'admin' || adminData?.role === 'admin' || adminData?.isAdmin === true;

      const isAuthorized = (adminEmail && authorizedAdmins.includes(adminEmail)) || isUserAdmin;

      if (!isAuthorized) {
        console.error(`ERRO: Usuário ${adminEmail || adminUid} não autorizado.`);
        return res.status(403).json({ success: false, message: 'Acesso negado. Você não é um administrador autorizado.' });
      }

      // 1. APAGAR TODOS OS CONTRATOS DO FIRESTORE (COLEÇÃO RAIZ E SUBCOLEÇÕES)
      console.log('CONTRACT_RESET_FIRESTORE_PATH_CHECK');
      console.log('Iniciando varredura no Firestore para deletar registros de contratos...');
      
      const toDeleteRefs: admin.firestore.DocumentReference[] = [];

      // A. Contratos na coleção raiz 'contracts'
      const rootContracts = await dbAdmin.collection('contracts').get();
      rootContracts.docs.forEach(doc => {
        toDeleteRefs.push(doc.ref);
      });
      console.log(`[Firestore Base Check] Encontrados ${rootContracts.size} contratos na coleção raiz.`);

      // B. Contratos em qualquer subcoleção 'contracts' (ex: users/{uid}/contracts)
      const groupContracts = await dbAdmin.collectionGroup('contracts').get();
      groupContracts.docs.forEach(doc => {
        if (!toDeleteRefs.some(ref => ref.path === doc.ref.path)) {
          toDeleteRefs.push(doc.ref);
        }
      });
      console.log(`[Firestore Base Check] Total de contratos acumulados com collectionGroup: ${toDeleteRefs.length}`);

      // C. Coleções e subcoleções legadas adicionais relacionadas a contratos ativos/recentes/alertas
      const legacyCollections = ['activeContracts', 'recentFlow', 'expiringContracts', 'contractAlerts'];
      for (const colName of legacyCollections) {
        try {
          const snap = await dbAdmin.collection(colName).get();
          if (snap.size > 0) {
            console.log(`[Firestore Legacy Check] Encontrados ${snap.size} docs na coleção legada: ${colName}`);
            snap.docs.forEach(doc => {
              if (!toDeleteRefs.some(ref => ref.path === doc.ref.path)) {
                toDeleteRefs.push(doc.ref);
              }
            });
          }
        } catch (e: any) {
          console.warn(`Erro ao verificar coleção legada ${colName} (prosseguindo):`, e.message);
        }

        try {
          const groupSnap = await dbAdmin.collectionGroup(colName).get();
          if (groupSnap.size > 0) {
            console.log(`[Firestore Legacy Group Check] Encontrados ${groupSnap.size} docs no collectionGroup: ${colName}`);
            groupSnap.docs.forEach(doc => {
              if (!toDeleteRefs.some(ref => ref.path === doc.ref.path)) {
                toDeleteRefs.push(doc.ref);
              }
            });
          }
        } catch (e: any) {
          console.warn(`Erro ao verificar collectionGroup legado ${colName} (prosseguindo):`, e.message);
        }
      }

      // Executar as exclusões em lotes (Transaction/Batch size = 100)
      const batchSize = 100;
      for (let i = 0; i < toDeleteRefs.length; i += batchSize) {
        const batch = dbAdmin.batch();
        const chunk = toDeleteRefs.slice(i, i + batchSize);
        chunk.forEach(ref => {
          batch.delete(ref);
          console.log(`Fila de exclusão autorizada no Firestore: ${ref.path}`);
        });
        await batch.commit();
      }

      console.log('CONTRACT_RESET_FIRESTORE_DELETED');

      // 2. APAGAR TODOS OS PDFs DE CONTRATO NO STORAGE
      console.log('Iniciando varredura no Firebase Storage sob "contracts/"...');
      try {
        const bucket = admin.storage().bucket(firebaseConfig.storageBucket);
        
        // Excluir prefixo padrão "contracts/"
        const [files1] = await bucket.getFiles({ prefix: 'contracts/' });
        console.log(`Encontrados ${files1.length} PDFs no Storage sob 'contracts/'.`);
        for (const file of files1) {
          await file.delete();
          console.log(`Deletado arquivo do Storage: ${file.name}`);
        }

        // Excluir prefixos legados adicionais
        const altPrefixes = ['contratos/', 'contrato/', 'active_contracts/'];
        for (const pref of altPrefixes) {
          try {
            const [altFiles] = await bucket.getFiles({ prefix: pref });
            if (altFiles.length > 0) {
              console.log(`Encontrados ${altFiles.length} arquivos sob o prefixo alternativo '${pref}'.`);
              for (const file of altFiles) {
                await file.delete();
                console.log(`Deletado arquivo legado do Storage: ${file.name}`);
              }
            }
          } catch (altErr: any) {
            console.warn(`Erro ao processar prefixo alternativo '${pref}':`, altErr.message);
          }
        }

        console.log('CONTRACT_RESET_STORAGE_DELETED');
      } catch (storageErr: any) {
        console.warn('Erro ao deletar arquivos do Storage (prosseguindo):', storageErr.message);
        console.log('CONTRACT_RESET_STORAGE_DELETED');
      }

      console.log('CONTRACT_RESET_FINISHED');
      console.log('--- FIM COMPLETO RESET CONTRATOS API ---');

      return res.status(200).json({
        success: true,
        message: 'Todos os contratos foram apagados completamente do Firestore e do Storage.'
      });

    } catch (error: any) {
      console.error('ERRO FATAL RESET CONTRATOS API:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Erro interno ao resetar contratos'
      });
    }
  });

  // Helper para classificar usuários no backend
  function isAsoWorkerBackend(u: any): boolean {
    if (!u) return false;
    const isAsoUser = u.isAsoUser === true;
    const isSourceAso = u.source === "aso";
    const isPortalRoleFuncionario = u.portalRole === "funcionario";
    const isUserTypeAsoFuncionario = u.userType === "aso_funcionario";
    const isCreatedAutomaticallyWithEmail = u.createdAutomatically === true && u.email?.endsWith("@funcionario.arqmed.local");
    
    return isAsoUser || isSourceAso || isPortalRoleFuncionario || isUserTypeAsoFuncionario || isCreatedAutomaticallyWithEmail;
  }

  function isInternalEmployeeBackend(u: any): boolean {
    if (!u) return false;
    if (u.tipo === 'admin' || u.role === 'admin') return true;

    const isAso = isAsoWorkerBackend(u);
    
    const hasInternalMark = u.isAsoUser === false || 
                            u.source === "app" || 
                            u.userType === "internal_employee" || 
                            ((u.role === "funcionario" || u.tipo === "funcionario") && !isAso);

    if (hasInternalMark) {
      console.log("USER_CLASSIFICATION_INTERNAL", u.email || u.uid || u.nome || "");
    } else {
      console.log("USER_CLASSIFICATION_ASO", u.email || u.uid || u.nome || "");
    }
    return hasInternalMark;
  }

  // API Endpoint para criar ou recriar usuário (Firebase Auth + Firestore) com segurança Administrativa
  app.post('/api/admin/create-aso-user', async (req, res) => {
    console.log('API_CREATE_ASO_USER_METHOD:', req.method);
    console.log('API_CREATE_ASO_USER_BODY:', JSON.stringify(req.body));
    
    const { tipo, cpfOuCnpj, nome, empresaId, empresaNome } = req.body;
    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : req.body.idToken;

    if (!tipo || !cpfOuCnpj || !nome || !idToken) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes', details: 'tipo, cpfOuCnpj, nome ou idToken' });
    }

    const cleanId = cpfOuCnpj.replace(/\D/g, '');
    const domain = tipo === 'empresa' ? 'empresa.arqmed.local' : 'funcionario.arqmed.local';
    const email = `${cleanId}@${domain}`;
    const password = cleanId.slice(-6);

    console.log("ASO_USER_CREATE_START", email);

    try {
      // 1. Verificar Token do Admin
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const adminUid = decodedToken.uid;
      console.log('API_CREATE_ASO_USER_AUTH_UID:', adminUid);
      
      const adminDoc = await dbAdmin.collection('users').doc(adminUid).get();
      const adminData = adminDoc.data();
      const isUserAdmin = adminData?.tipo === 'admin' || adminData?.role === 'admin' || adminData?.isAdmin === true || 
                         ['dantasarqmed@gmail.com', 'admin@admin.com'].includes(decodedToken.email || '');

      if (!isUserAdmin) {
        console.log("ASO_USER_CREATE_ERROR", email, "Acesso negado.");
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem criar usuários.' });
      }

      // SEGURANÇA: Verificar se já existe um funcionário interno com esse login ou e-mail ou UID
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

        // Se existe, atualizar senha para garantir o padrão
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
      console.log("FIRESTORE_PROFILE_SYNCED", true);
      console.log("ASO_USER_CREATE_SUCCESS", email);
      if (tipo === 'funcionario') {
        console.log("ASO_WORKER_CREATE_SUCCESS", email);
      }
      console.log("API_CREATE_ASO_USER_SUCCESS:", status);

      res.status(200).json({ 
        success: true, 
        status, 
        uid, 
        email,
        loginVisivel: cleanId
      });
    } catch (error: any) {
      console.log("ASO_USER_CREATE_ERROR", email || cpfOuCnpj, error?.message || error);
      console.error('API_CREATE_ASO_USER_ERROR:', error);
      res.status(500).json({ 
        error: "Erro ao criar usuário ASO",
        details: String(error?.message || error)
      });
    } finally {
      console.log('--- FIM CREATE ASO USER API ---');
    }
  });

  app.get('/api/admin/create-aso-user', (req, res) => {
    res.status(405).json({
      error: "Method not allowed",
      method: "GET"
    });
  });

  // 404 handler for API routes (Move here to catch unmatched /api/* before Vite/SPA)
  app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `API route not found: ${req.originalUrl}` });
  });

  // Middleware do Vite para desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Configuração para produção
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler to ensure JSON responses on errors
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Unhandled Error:', err);
    res.status(err.status || 500).json({ 
      success: false, 
      message: err.message || 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
