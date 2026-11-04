import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { addDoc, collection, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { logService } from './logService';
import { companyService } from './companyService';

export interface ContractData {
  [key: string]: any;
}

export interface UserMetadata {
  id: string;
  nome: string;
  email: string | null;
  cidade?: string;
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function decodeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function sanitizeRPr(rPr: string, keepBold: boolean, keepItalic: boolean, keepUnderline: boolean): string {
  if (!rPr) return '';
  let cleaned = rPr;
  
  if (!keepBold) {
    cleaned = cleaned
      .replace(/<w:b\/>/g, '')
      .replace(/<w:bCs\/>/g, '')
      .replace(/<w:b(?: [^>]*)?>[\s\S]*?<\/w:b>/g, '')
      .replace(/<w:bCs(?: [^>]*)?>[\s\S]*?<\/w:bCs>/g, '');
  }
  
  if (!keepItalic) {
    cleaned = cleaned
      .replace(/<w:i\/>/g, '')
      .replace(/<w:iCs\/>/g, '')
      .replace(/<w:i(?: [^>]*)?>[\s\S]*?<\/w:i>/g, '')
      .replace(/<w:iCs(?: [^>]*)?>[\s\S]*?<\/w:iCs>/g, '');
  }
  
  if (!keepUnderline) {
    cleaned = cleaned
      .replace(/<w:u\/>/g, '')
      .replace(/<w:u(?: [^>]*)?>[\s\S]*?<\/w:u>/g, '')
      .replace(/<w:u [^>]*\/>/g, '');
  }
  
  return cleaned;
}

interface RunNode {
  type: 'run' | 'other';
  raw: string;
  text?: string;
  rPr?: string;
  otherXml?: string;
}

function matchRuns(paragraphXml: string): RunNode[] {
  const nodes: RunNode[] = [];
  const runRegex = /<w:r(?: [^>]*)?>([\s\S]*?)<\/w:r>/g;
  let lastIndex = 0;
  let match;
  
  while ((match = runRegex.exec(paragraphXml)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      nodes.push({
        type: 'other',
        raw: paragraphXml.substring(lastIndex, matchIndex)
      });
    }
    
    const rawRun = match[0];
    const runContent = match[1];
    
    const rPrMatch = runContent.match(/<w:rPr(?: [^>]*)?>([\s\S]*?)<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : '';
    
    let text = '';
    const tRegex = /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(runContent)) !== null) {
      text += decodeXml(tMatch[1]);
    }
    
    const otherXml = runContent
      .replace(/<w:rPr(?: [^>]*)?>[\s\S]*?<\/w:rPr>/, '')
      .replace(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>/g, '');

    nodes.push({
      type: 'run',
      raw: rawRun,
      text,
      rPr,
      otherXml
    });
    
    lastIndex = runRegex.lastIndex;
  }
  
  if (lastIndex < paragraphXml.length) {
    nodes.push({
      type: 'other',
      raw: paragraphXml.substring(lastIndex)
    });
  }
  
  return nodes;
}

function splitRun(node: RunNode, offset: number): [RunNode, RunNode] {
  const text = node.text || '';
  const text1 = text.substring(0, offset);
  const text2 = text.substring(offset);
  
  const rPr = node.rPr || '';
  const otherXml = node.otherXml || '';
  
  const buildOuter = (t: string) => {
    const tXml = t ? `<w:t xml:space="preserve">${escapeXml(t)}</w:t>` : '';
    return `<w:r>${rPr}${otherXml}${tXml}</w:r>`;
  };

  return [
    {
      type: 'run',
      raw: buildOuter(text1),
      text: text1,
      rPr,
      otherXml
    },
    {
      type: 'run',
      raw: buildOuter(text2),
      text: text2,
      rPr,
      otherXml
    }
  ];
}

function processParagraphXml(paragraphXml: string): string {
  let currentXml = paragraphXml;
  let iterations = 0;
  
  while (iterations < 50) {
    const nodes = matchRuns(currentXml);
    let plainText = '';
    const charMap: { nodeIndex: number; charOffset: number }[] = [];
    
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.type === 'run' && node.text) {
        for (let j = 0; j < node.text.length; j++) {
          charMap.push({ nodeIndex: i, charOffset: j });
        }
        plainText += node.text;
      }
    }
    
    const match = plainText.match(/\{[^{}]+\}/);
    if (!match) {
      break;
    }
    
    const startIndex = match.index!;
    const endIndex = startIndex + match[0].length - 1;
    
    const startChar = charMap[startIndex];
    const endChar = charMap[endIndex];
    if (!startChar || !endChar) {
      break;
    }
    
    let startNodeIndex = startChar.nodeIndex;
    let endNodeIndex = endChar.nodeIndex;
    
    let startOffset = startChar.charOffset;
    let endOffset = endChar.charOffset;
    
    if (endOffset < (nodes[endNodeIndex].text || '').length - 1) {
      const [left, right] = splitRun(nodes[endNodeIndex], endOffset + 1);
      nodes.splice(endNodeIndex, 1, left, right);
    }
    
    if (startOffset > 0) {
      const [left, right] = splitRun(nodes[startNodeIndex], startOffset);
      nodes.splice(startNodeIndex, 1, left, right);
      if (endNodeIndex >= startNodeIndex) {
        endNodeIndex += 1;
      }
      startNodeIndex += 1;
    }
    
    let mergedText = '';
    for (let i = startNodeIndex; i <= endNodeIndex; i++) {
      mergedText += nodes[i].text || '';
    }
    
    let siblingRun: RunNode | null = null;
    for (let i = startNodeIndex - 1; i >= 0; i--) {
      if (nodes[i].type === 'run' && nodes[i].text && nodes[i].text.trim() !== '') {
        siblingRun = nodes[i];
        break;
      }
    }
    if (!siblingRun) {
      for (let i = endNodeIndex + 1; i < nodes.length; i++) {
        if (nodes[i].type === 'run' && nodes[i].text && nodes[i].text.trim() !== '') {
          siblingRun = nodes[i];
          break;
        }
      }
    }
    
    const isSiblingBold = !!(siblingRun && siblingRun.rPr && (
      siblingRun.rPr.includes('<w:b/>') || 
      siblingRun.rPr.includes('<w:bCs/>') || 
      siblingRun.rPr.includes('<w:b ')
    ));

    const isSiblingItalic = !!(siblingRun && siblingRun.rPr && (
      siblingRun.rPr.includes('<w:i/>') || 
      siblingRun.rPr.includes('<w:iCs/>') || 
      siblingRun.rPr.includes('<w:i ')
    ));

    const isSiblingUnderline = !!(siblingRun && siblingRun.rPr && (
      siblingRun.rPr.includes('<w:u ') || 
      siblingRun.rPr.includes('<w:u/>')
    ));
    
    const baseRPr = nodes[startNodeIndex].rPr || '';
    const mergedRPr = sanitizeRPr(baseRPr, isSiblingBold, isSiblingItalic, isSiblingUnderline);
    
    let mergedOtherXml = '';
    for (let i = startNodeIndex; i <= endNodeIndex; i++) {
      mergedOtherXml += nodes[i].otherXml || '';
    }
    
    const markedText = mergedText.replace('{', '\uE000').replace('}', '\uE001');
    
    const buildMergedRunXml = (rPr: string, text: string, otherXml: string): string => {
      const tXml = text ? `<w:t xml:space="preserve">${escapeXml(text)}</w:t>` : '';
      return `<w:r>${rPr}${otherXml}${tXml}</w:r>`;
    };
    
    const mergedNode: RunNode = {
      type: 'run',
      raw: buildMergedRunXml(mergedRPr, markedText, mergedOtherXml),
      text: markedText,
      rPr: mergedRPr,
      otherXml: mergedOtherXml
    };
    
    nodes.splice(startNodeIndex, endNodeIndex - startNodeIndex + 1, mergedNode);
    currentXml = nodes.map(n => n.raw).join('');
    
    iterations++;
  }
  
  return currentXml;
}

function preprocessXml(xml: string): string {
  const paraRegex = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;
  const processed = xml.replace(paraRegex, (paragraphXml) => {
    return processParagraphXml(paragraphXml);
  });
  return processed.replace(/\uE000/g, '{').replace(/\uE001/g, '}');
}

/**
 * Service to handle contract generation and placeholder validation
 */
export const contractService = {
  /**
   * Preprocesses .docx templates within the loaded zip container
   * to fix split runs and normalize placeholder styling.
   */
  preprocessTemplatesInZip(zip: PizZip): void {
    const filesToCheck = Object.keys(zip.files).filter(name => 
      name.startsWith('word/document') || 
      name.startsWith('word/header') || 
      name.startsWith('word/footer')
    );

    filesToCheck.forEach(fileName => {
      const originalXml = zip.files[fileName].asText();
      const preprocessedXml = preprocessXml(originalXml);
      zip.file(fileName, preprocessedXml);
    });
  },

  /**
   * Generates a DOCX contract from a template (Preserving 100% formatting)
   * @param modelPath Path to the target .docx file in the public folder
   * @param templateData Data to replace the placeholders
   * @param fileName Optional output filename
   * @param user Optional user metadata to save history
   * @param contractType The type/subject of the contract for history
   */
  async generate(
    modelPath: string, 
    templateData: ContractData, 
    fileName: string,
    user?: UserMetadata,
    contractType?: string,
    prevContractId?: string,
    fullFormData?: any
  ): Promise<void> {
    console.log('CONTRACT_GENERATE_START', { fileName, contractType });
    try {
      const response = await fetch(modelPath);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`O arquivo de modelo "${modelPath}" não foi encontrado.`);
        }
        throw new Error(`Erro ao carregar o modelo de contrato (Status: ${response.status})`);
      }

      const content = await response.arrayBuffer();
      const zip = new PizZip(content);
      
      this.preprocessTemplatesInZip(zip);
      
      this.validatePlaceholders(zip, templateData);

      const docObj = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      docObj.render(templateData);

      const docxOutput = docObj.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      saveAs(docxOutput, fileName);

      // Background tasks
      companyService.upsert({
        cnpj: templateData.CNPJ,
        cnpjFormatado: templateData.CNPJ,
        nome: templateData.EMPRESA,
        responsavel: templateData.DONO,
        endereco: templateData.ENDERECO,
        cep: templateData.CEP,
        cidadeEstado: templateData.CIDADE_ESTADO,
        qntFuncionarios: templateData.QNT_FUNCIONARIO,
        prazoContratoPadrao: templateData.PRAZO_CONTRATO,
        localForoPadrao: templateData.LOCAL_FORO
      }).catch(err => console.error('[ContractService] Falha ao atualizar empresa:', err));

      if (user && contractType) {
        contractService.saveToHistory(
          docxOutput, 
          fileName, 
          templateData.EMPRESA || 'Empresa Direta', 
          contractType, 
          user,
          templateData.PRAZO_CONTRATO,
          prevContractId,
          templateData,
          fullFormData
        ).catch(err => console.error('[ContractService] Histórico falhou:', err));
      }

      return;
    } catch (error) {
      console.error('[ContractService] Erro na geração:', error);
      throw error;
    }
  },

  /**
   * Saves the generated contract to Firebase Storage and metadata to Firestore
   * Reliable strategy: Create Firestore record FIRST, then attempt upload
   */
  async saveToHistory(
    blob: Blob, 
    fileName: string, 
    empresa: string, 
    tipoContrato: string, 
    user: UserMetadata,
    prazoMeses?: string,
    prevContractId?: string,
    originalTemplateData?: any,
    fullFormData?: any
  ): Promise<void> {
    if (!(blob instanceof Blob) || blob.size === 0) {
      console.error(`[saveToHistory] BLOB INVÁLIDO OU VAZIO. Abortando.`);
      return;
    }
    
    console.log('HISTORICO_SAVE_START', { fileName, empresa, tipoContrato, userId: user.id });
    
    let dbId = '';
    const timestamp = new Date().getTime();
    const storagePath = `contracts/${user.id}/${timestamp}_${fileName}`;

    // Expiration calculation (Strictly Date based, formatted as YYYY-MM-DD to comply with 10 chars constraint)
    const dataInicio = new Date();
    dataInicio.setHours(0, 0, 0, 0);
    const dataInicioISO = dataInicio.toISOString().split('T')[0];

    let dataVencimentoISO = null;
    const meses = parseInt(prazoMeses || '0');
    if (meses > 0) {
      const dataVenc = new Date(dataInicio);
      dataVenc.setMonth(dataVenc.getMonth() + meses);
      dataVencimentoISO = dataVenc.toISOString().split('T')[0];
    }

    try {
      console.log('[ContractService] formData salvo no histórico:', fullFormData);

      const valorCalculado = originalTemplateData?.VALOR_ESOCIAL || 
                            originalTemplateData?.VALOR_LAUDO || 
                            fullFormData?.valorEsocial || 
                            fullFormData?.valorLaudo || 
                            null;

      // PASSO 1: Criar registro no Firestore IMEDIATAMENTE (Pendente)
      console.log('CONTRACT_FIRESTORE_SAVE_START');
      const docRef = await addDoc(collection(db, 'contracts'), {
        empresa: empresa || 'Empresa não informada',
        tipoContrato: tipoContrato || 'Contrato',
        modelo: tipoContrato || 'Contrato',
        data: new Date().toISOString(),
        dataCriacao: new Date().toISOString(),
        usuarioId: user.id,
        userId: user.id,
        usuarioNome: user.nome,
        usuarioEmail: user.email || 'email@não.informado',
        cidade: user.cidade || 'Não informada',
        arquivoUrl: '', 
        pdfUrl: '',
        storagePath: storagePath,
        fileName: fileName,
        status: 'pendente',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        valor: valorCalculado,
        vencimento: originalTemplateData?.VENCIMENTO || fullFormData?.vencimento || null,
        // Expiration fields (Strictly YYYY-MM-DD, under 10 chars limit)
        prazoContratoMeses: meses || 0,
        dataInicioContrato: dataInicioISO,
        dataVencimentoContrato: dataVencimentoISO,
        contratoAnteriorId: prevContractId || null,
        templateData: originalTemplateData || null,
        formData: fullFormData || null,
        // Flattened fields for easier renewal and search (Pillar: Schema Integrity)
        cnpj: originalTemplateData?.CNPJ || fullFormData?.cnpj || null,
        dono: originalTemplateData?.DONO || null,
        endereco: originalTemplateData?.ENDERECO || null,
        cep: originalTemplateData?.CEP || null,
        cidadeEstado: originalTemplateData?.CIDADE_ESTADO || null,
        qntFuncionario: originalTemplateData?.QNT_FUNCIONARIO || null,
        valorEsocial: originalTemplateData?.VALOR_ESOCIAL || null,
        valorLaudo: originalTemplateData?.VALOR_LAUDO || null,
        parcelas: originalTemplateData?.PARCELA || null,
        prazoContrato: originalTemplateData?.PRAZO_CONTRATO || null,
        localForo: originalTemplateData?.LOCAL_FORO || null,
        testemunha1: originalTemplateData?.TESTEMUNHA1 || 'Moisés Alves Silva',
        testemunha2: originalTemplateData?.TESTEMUNHA2 || 'DAVID ALLAN DE OLIVEIRA SOUZA',
        rg1: originalTemplateData?.RG1 || '2165866',
        rg2: originalTemplateData?.RG2 || '03914517158'
      });
      dbId = docRef.id;

      // PASSO 2: Upload para o Storage
      console.log('CONTRACT_STORAGE_UPLOAD_START');
      const storageRef = ref(storage, storagePath);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_UPLOAD_ERROR')), 60000)
      );

      const uploadTask = uploadBytes(storageRef, blob, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        customMetadata: { owner: user.id, empresa: empresa }
      });

      await Promise.race([uploadTask, timeoutPromise]);
      console.log('CONTRACT_STORAGE_UPLOAD_SUCCESS');

      // PASSO 3: Obter URL
      const downloadUrl = await getDownloadURL(storageRef);

      // PASSO 4: Atualizar Firestore para SUCESSO
      await updateDoc(doc(db, 'contracts', dbId), {
        arquivoUrl: downloadUrl,
        pdfUrl: downloadUrl,
        status: 'sucesso',
        updatedAt: serverTimestamp()
      });

      console.log('CONTRACT_FIRESTORE_SAVE_SUCCESS');
      console.log('HISTORICO_SAVE_SUCCESS', { dbId });

    } catch (err: any) {
      console.log('CONTRACT_FIRESTORE_SAVE_ERROR', err);
      console.error('HISTORICO_SAVE_ERROR', err);
      console.error(`[saveToHistory] FALHA NO FLUXO:`, err);
      
      if (dbId) {
        try {
          await updateDoc(doc(db, 'contracts', dbId), {
            status: 'erro_upload',
            errorMsg: err.message || 'Erro desconhecido no upload',
            updatedAt: serverTimestamp()
          });
        } catch (updateErr: any) {
          console.error(`[saveToHistory] Erro crítico ao atualizar falha:`, updateErr.message);
        }
      }
    }
  },

  /**
   * Deletes a contract from Firestore and its associated file from Storage
   */
  async deleteContract(contractId: string, storagePath?: string): Promise<void> {
    try {
      await this.deleteFile(storagePath);

      // 2. Delete from Firestore
      const docRef = doc(db, 'contracts', contractId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('[ContractService] Erro ao excluir contrato:', error);
      throw error;
    }
  },

  /**
   * Deletes only the file from Storage
   */
  async deleteFile(storagePath?: string): Promise<void> {
    if (!storagePath) return;
    try {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    } catch (storageErr: any) {
      if (storageErr.code !== 'storage/object-not-found') {
        console.error('[ContractService] Erro ao deletar do Storage:', storageErr);
        throw storageErr;
      }
    }
  },

  /**
   * Validates if the expected placeholders are present in the document.
   */
  validatePlaceholders(zip: PizZip, templateData: ContractData): void {
    try {
      const filesToCheck = Object.keys(zip.files).filter(name => 
        name.startsWith('word/document') || 
        name.startsWith('word/header') || 
        name.startsWith('word/footer')
      );

      let allXmlContent = '';
      filesToCheck.forEach(file => {
        allXmlContent += zip.files[file].asText();
      });

      const expectedTags = Object.keys(templateData);
      expectedTags.forEach(tag => {
        const cleanContent = allXmlContent.replace(/<[^>]+>/g, '');
        if (!cleanContent.includes(`{${tag}}`)) {
          console.warn(`[ContractService] Placeholder "{${tag}}" não encontrado no arquivo Word.`);
        }
      });
    } catch (e) {
      console.error('Error during placeholder validation:', e);
    }
  },
  
  /**
   * Background migration: finds contracts without usuarioNome and updates them
   * using the usuarioId to lookup the name in the users collection.
   */
  async enrichMissingNames(): Promise<number> {
    try {
      const { getDocs, query, where, collection, doc, getDoc, writeBatch } = await import('firebase/firestore');
      const contractsRef = collection(db, 'contracts');
      
      // Find contracts missing usuarioNome
      const q = query(contractsRef, where('usuarioNome', '==', ''));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Also check for contracts where the field doesn't exist at all
        // Note: Firestore query doesn't support "field not exists" easily without indexes
        // so we'll just check if any were returned. 
        return 0;
      }

      let updatedCount = 0;
      const batch = writeBatch(db);
      const userCache = new Map<string, string>();

      for (const contractDoc of snapshot.docs) {
        const data = contractDoc.data();
        const userId = data.usuarioId;
        
        if (!userId) continue;

        let name = userCache.get(userId);
        
        if (!name) {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            name = userDoc.data().nome;
            if (name) userCache.set(userId, name);
          }
        }

        if (name) {
          batch.update(contractDoc.ref, { 
            usuarioNome: name,
            updatedAt: new Date().toISOString()
          });
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        await batch.commit();
      }

      return updatedCount;
    } catch (error) {
      console.error('[ContractService] Erro na migração de nomes:', error);
      return 0;
    }
  }
};
