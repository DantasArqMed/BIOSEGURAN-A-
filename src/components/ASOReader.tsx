import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Loader2, CheckCircle2, AlertTriangle, Upload, Search, User, Building, Fingerprint, Hash, Save, Trash2, ExternalLink, Key, Lock, ShieldCheck, Mail, Info, QrCode } from 'lucide-react';
import { generateAccessPdf } from '../services/pdfAccessService';
import * as pdfjs from 'pdfjs-dist';
import toast from 'react-hot-toast';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, setDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, storage, auth } from '../lib/firebase';
import { companyService } from '../services/companyService';
import { userService } from '../services/userService';

// Configurar o worker do PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface ASOData {
  funcionario: string;
  cpf: string;
  empregador: string;
  cnpj: string;
}

interface SavedData {
  id: string;
  pdfUrl: string;
  storagePath: string;
  newFileName: string;
  cpf: string;
  cnpj: string;
  collection: string;
}

interface UserCreationSummary {
  company: { created: boolean; existed: boolean; recreated?: boolean; email: string; error?: string };
  employee: { created: boolean; existed: boolean; recreated?: boolean; email: string; error?: string };
}

// Funções de Debug Globais
(window as any).DEBUG_ACESSO_ASO = async (id: string) => {
  const cleanId = id.replace(/\|D/g, '');
  console.log(`--- DEBUG_ACESSO_ASO: ${cleanId} ---`);
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const { db } = await import('../lib/firebase');
    
    const collections = ['users', 'asoUsers', 'asoFuncionarios', 'empresas'];
    for (const col of collections) {
      const snap = await getDocs(query(collection(db, col), where('loginVisivel', '==', cleanId)));
      console.log(`Coleção '${col}': Found ${snap.docs.length} docs`);
      snap.docs.forEach(d => console.log(`  [${col}] ID: ${d.id}`, d.data()));
    }
  } catch (e) {
    console.error("ERRO_DEBUG:", e);
  }
  console.log(`--- FIM DEBUG ---`);
};

export default function ASOReader() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);

  const handlePreviewAccessPdf = async (accessData: any) => {
    const toastId = toast.loading("Gerando PDF e QR Code de acesso...");
    console.log("QR_PREVIEW_OPEN", accessData);

    try {
      const result = await generateAccessPdf(accessData);
      
      const cleanLogin = accessData.login.replace(/\D/g, '');
      const storagePath = `access_pdfs/${accessData.tipo}/${cleanLogin}.pdf`;
      console.log("QR_PREVIEW_STORAGE_PATH", storagePath);

      let finalPdfUrl = '';

      try {
        const storageRef = ref(storage, storagePath);
        // Upload the generated PDF blob to Firebase Storage
        await uploadBytes(storageRef, result.blob, {
          contentType: 'application/pdf',
          customMetadata: {
            tipo: accessData.tipo,
            nome: accessData.nome,
            login: cleanLogin
          }
        });
        
        // Retrieve public persistent download URL
        finalPdfUrl = await getDownloadURL(storageRef);
        console.log("QR_PREVIEW_DOWNLOAD_URL", finalPdfUrl);
      } catch (storageErr) {
        console.warn("Falha ao salvar PDF de acesso no Storage. Usando URL de Blob local:", storageErr);
        // Fallback for offline or permissions constraints
        finalPdfUrl = URL.createObjectURL(result.blob);
      }

      toast.dismiss(toastId);
      
      navigate('/preview-acesso', { 
        state: { 
          pdfUrl: finalPdfUrl, 
          fileName: result.fileName,
          data: result.data
        } 
      });
    } catch (error) {
      toast.dismiss(toastId);
      console.error("Erro ao gerar pré-visualização:", error);
      toast.error("Erro ao gerar o PDF de acesso.");
    }
  };
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingStep, setSavingStep] = useState<string>('');
  const [extractedData, setExtractedData] = useState<ASOData | null>(null);
  const [savedData, setSavedData] = useState<SavedData | null>(null);
  const [userSummary, setUserSummary] = useState<UserCreationSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        toast.error('Por favor, selecione um arquivo PDF.');
        return;
      }
      setFile(selectedFile);
      setExtractedData(null);
      setSavedData(null);
    }
  };

  const getPdfText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument(arrayBuffer).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  };

  const normalizeAsoPdfText = (text: string) => {
    let normalized = text;

    // 1. Corrigir rótulos quebrados (espaçados)
    const labelReplacements = [
      { regex: /C\s+P\s+F\s*:/gi, replacement: 'CPF:' },
      { regex: /C\s+N\s+P\s+J\s*:/gi, replacement: 'CNPJ:' },
      { regex: /F\s*u\s*n\s*c\s*i\s*o\s*n\s*á\s*r\s*i\s*o\s*:/gi, replacement: 'Funcionário:' },
      { regex: /E\s*m\s*p\s*r\s*e\s*g\s*a\s*d\s*o\s*r\s*:/gi, replacement: 'Empregador:' },
      { regex: /C\s*a\s*r\s*g\s*o\s*:/gi, replacement: 'Cargo:' },
      { regex: /R\s*G\s*:/gi, replacement: 'RG:' },
      { regex: /E\s+n\s+d\s+e\s+r\s+e\s+ç\s+o\s*:/gi, replacement: 'Endereço:' }
    ];

    labelReplacements.forEach(({ regex, replacement }) => {
      normalized = normalized.replace(regex, replacement);
    });

    normalized = normalized.replace(/(\d|[\.\-\/])\s+(?=\d|[\.\-\/])/g, '$1');

    return normalized;
  };

  const fixJoinedWords = (value: string): string => {
    if (!value) return "";

    let text = value.trim();

    // Corrige CamelCase (ex: JardimDosLagosEmpreendimentosLtda -> Jardim Dos Lagos Empreendimentos Ltda)
    text = text.replace(/([a-záéíóúâêôãõç])([A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, "$1 $2");

    // Check if the string actually needs word reconstruction (by calculating average word length or checked word count)
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const averageWordLength = words.length > 0 ? (words.join('').length / words.length) : 0;
    
    // Glued text: either a single long word/token or very high average word length
    const isGlued = words.length <= 2 || (words.length > 2 && averageWordLength > 9);

    if (isGlued) {
      // General connectors and tokens to look for and split around
      const knownWords = [
        // Legal and business terms
        "CONSTRUCOES", "CONSTRUÇÕES", "EMPREENDIMENTOS", "EMPREENDIMENTO",
        "SEGURANCA", "SEGURANÇA", "OCUPACIONAL", "CONSULTORIA", "CONSTRUTORA",
        "TRANSPORTES", "TRANSPORTE", "ASSESSORIA", "LIMITADA", "COMERCIO", "COMÉRCIO",
        "SERVICOS", "SERVIÇOS", "MEDICINA", "SAÚDE", "SAUDE", "CLÍNICA", "CLINICA",
        "LAGOS", "LTDA", "EPP", "EIRELI", "S.A.", "SA",
        
        // Brazilian Surnames
        "NASCIMENTO", "RODRIGUES", "GONÇALVES", "GONCALVES", "GUIMARÃES", "GUIMARAES",
        "OLIVEIRA", "FERREIRA", "SILVEIRA", "COUTINHO", "NOGUEIRA", "TEIXEIRA",
        "BARBOSA", "MOREIRA", "REZENDE", "CARDOSO", "ALMEIDA", "MACHADO", "SANTANA",
        "PEREIRA", "MARTINS", "BARROS", "SOUZA", "SOUSA", "SANTOS", "ALVES", "ARAUJO",
        "ARAÚJO", "MENDES", "GOMES", "ROCHA", "COSTA", "PINTO", "MELO", "MELLO", "NEVES",
        "REIS", "CRUZ", "DIAS", "LIMA", "SILVA", "RUAS", "DUARTE", "CORREA", "CORRÊA", "LAGOS",
        
        // Brazilian First names
        "ALESSANDRA", "ALESSANDRO", "FRANCISCO", "CRISTIANE", "PRISCILA", "ANTONIO",
        "ANTÔNIO", "RODRIGO", "JULIANA", "LETÍCIA", "LETICIA", "GUSTAVO", "MARCELO",
        "ROGERIO", "ROGÉRIO", "FERNANDO", "RICARDO", "PATRICIA", "PATRÍCIA", "ADRIANA",
        "RONILDO", "CARLOS", "FELIPE", "MATEUS", "MATHEUS", "THIAGO", "DANIEL", "SANDRA",
        "RENATA", "VANESSA", "MARIANA", "GABRIEL", "FLAVIO", "FLÁVIO", "ROBERTO", "MARCOS",
        "MIGUEL", "TIAGO", "RAFAEL", "MARIA", "PEDRO", "PAULO", "ANDRE", "ANDRÉ", "ALINE",
        "BRUNO", "FABIO", "FÁBIO", "LUCAS", "JOAO", "JOÃO", "JOSÉ", "JOSE", "LUIS", "LUIZ",
        "ANNA", "ABRAAO", "CLARA", "JULIA", "JÚLIA", "ALICE", "LUANA", "BRUNA", "PAULA", "BIANCA",
        
        // Connectives (prepositions)
        "DOS", "DAS", "DEL", "SAN", "DE", "DA", "DO"
      ];

      // Sort by length descending to prevent substring collision
      knownWords.sort((a, b) => b.length - a.length);

      // Perform a space-injection for each known word we identify
      for (const word of knownWords) {
        if (word.length < 2) continue;
        const regex = new RegExp(`(${word})`, "gi");
        text = text.replace(regex, " $1 ");
      }
    }

    // Connectives adjustment
    text = text
      .replace(/\bDE\b/gi, " DE ")
      .replace(/\bDA\b/gi, " DA ")
      .replace(/\bDO\b/gi, " DO ")
      .replace(/\bDAS\b/gi, " DAS ")
      .replace(/\bDOS\b/gi, " DOS ")
      .replace(/\bE\b/gi, " E ");

    text = text.replace(/\s+/g, " ").trim();

    return text;
  };

  const smartNormalizeName = (value: string, rawText: string = ''): string => {
    if (!value || value === 'Campo não identificado') return value;
    
    // Split before common delimiters or labels that might have leaked
    let cleaned = value.split(/CPF:/i)[0].split(/CNPJ:/i)[0].split('(')[0];
    cleaned = cleaned.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const originalCleaned = cleaned;

    // Check if the source contains single spaces that were deleted by old regexes.
    // If rawText is provided, look if a spaced version of this name exists there.
    const targetCompressed = cleaned.replace(/\s+/g, '').toUpperCase();
    if (targetCompressed.length > 3 && rawText) {
      const lines = rawText.split('\n');
      for (const line of lines) {
        // Clean line of non-alphanumeric noise to see if it holds our text
        const normalizedLine = line.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        const wordsInLine = normalizedLine.split(' ');
        for (let start = 0; start < wordsInLine.length; start++) {
          for (let end = start + 1; end <= wordsInLine.length; end++) {
            const chunk = wordsInLine.slice(start, end).join(' ');
            const chunkCompressed = chunk.replace(/[^a-zA-ZáéíóúÁÉÍÓÚçÇ]/g, '').toUpperCase();
            if (chunkCompressed === targetCompressed) {
              const chunkWords = chunk.split(' ').filter(w => w.length > 0);
              const singleLetterWords = chunkWords.filter(w => w.length === 1 && !['E', 'A', 'O', 'I', 'Y'].includes(w.toUpperCase()));
              // If less than 40% of words are single letter words, it's a naturally spaced phrase!
              if (chunkWords.length > 1 && (singleLetterWords.length / chunkWords.length) < 0.4) {
                console.log("ASO_NORMALIZE_TEXT_SUCCESS (Match from rawText):", chunk);
                return fixJoinedWords(chunk.trim());
              }
            }
          }
        }
      }
    }

    // Apply the smart continuous dictionary-based space reconstruction technique
    cleaned = fixJoinedWords(cleaned);

    // Heuristics for duplicate spacing / trailing spaces
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Ensure legal entities/common endings are spaced correctly
    cleaned = cleaned
      .replace(/([a-zA-ZáéíóúÁÉÍÓÚçÇ])(LTDA|ME|EPP|EIRELI|S\.A\.|SA)$/i, "$1 $2")
      .replace(/(LTDA|ME|EPP|EIRELI|S\.A\.|SA)([a-zA-ZáéíóúÁÉÍÓÚçÇ])/i, "$1 $2");

    return cleaned;
  };

  const cleanEmployeeName = (value: string, rawText: string = ''): string => {
    return smartNormalizeName(value, rawText);
  };

  const cleanCompanyName = (value: string, rawText: string = ''): string => {
    let cleaned = smartNormalizeName(value, rawText);

    cleaned = cleaned.replace(/\(\s*(.+?)\s*\)/g, (match, p1) => {
      const inner = p1.replace(/\s+/g, '');
      return `(${inner})`;
    });

    return cleaned;
  };

  const extractData = (rawText: string): ASOData => {
    console.log("ASO_NORMALIZE_TEXT_START");
    const data: ASOData = {
      funcionario: 'Campo não identificado',
      cpf: 'Campo não identificado',
      empregador: 'Campo não identificado',
      cnpj: 'Campo não identificado'
    };

    const normalizedText = normalizeAsoPdfText(rawText);

    const cpfRegex = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
    const cpfMatch = normalizedText.match(cpfRegex);
    if (cpfMatch) data.cpf = cpfMatch[0];

    const cnpjRegex = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
    const cnpjMatch = normalizedText.match(cnpjRegex);
    if (cnpjMatch) data.cnpj = cnpjMatch[0];

    const funcMatch = normalizedText.match(/Funcionário:\s*(.+?)(?=\s+CPF:|\s+Cargo:|\s+RG:|\n|$)/i);
    if (funcMatch && funcMatch[1].trim().length > 2) {
      data.funcionario = funcMatch[1].trim();
    }

    const empMatch = normalizedText.match(/Empregador:\s*(.+?)(?=\s+CNPJ:|\s+Cargo:|\s+Endereço:|\n|$)/i);
    if (empMatch && empMatch[1].trim().length > 2) {
      data.empregador = empMatch[1].trim();
    }

    const lines = normalizedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (data.funcionario === 'Campo não identificado') {
      const funcIdx = lines.findIndex(l => l.includes('Funcionário:'));
      if (funcIdx !== -1) {
        const line = lines[funcIdx].replace('Funcionário:', '').trim();
        if (line.length > 3) data.funcionario = line.split('CPF:')[0].trim();
        else if (lines[funcIdx+1] && !lines[funcIdx+1].includes(':')) data.funcionario = lines[funcIdx+1];
      }
    }

    if (data.empregador === 'Campo não identificado') {
      const empIdx = lines.findIndex(l => l.includes('Empregador:'));
      if (empIdx !== -1) {
        const line = lines[empIdx].replace('Empregador:', '').trim();
        if (line.length > 3) data.empregador = line.split('CNPJ:')[0].trim();
        else if (lines[empIdx+1] && !lines[empIdx+1].includes(':')) data.empregador = lines[empIdx+1];
      }
    }
    
    const rawEmployeeName = data.funcionario;
    const rawCompanyName = data.empregador;

    console.log("ASO_RAW_EMPLOYEE_NAME", rawEmployeeName);
    console.log("ASO_RAW_COMPANY_NAME", rawCompanyName);

    data.funcionario = cleanEmployeeName(data.funcionario, normalizedText);
    data.empregador = cleanCompanyName(data.empregador, normalizedText);

    console.log("ASO_FIXED_EMPLOYEE_NAME", data.funcionario);
    console.log("ASO_FIXED_COMPANY_NAME", data.empregador);
    console.log("ASO_NORMALIZE_TEXT_SUCCESS");

    return data;
  };

  const readASO = async () => {
    if (!file) return;

    setIsReading(true);
    setExtractedData(null);
    setSavedData(null);

    try {
      const text = await getPdfText(file);
      
      if (!text.trim()) {
        throw new Error('Não foi possível ler o texto deste PDF. Verifique se o arquivo não é uma imagem escaneada.');
      }

      const data = extractData(text);
      setExtractedData(data);
      toast.success('Leitura concluída!');
    } catch (error: any) {
      console.error('Erro ao ler PDF:', error);
      toast.error(error.message || 'Erro ao processar o PDF.');
    } finally {
      setIsReading(false);
    }
  };

  const saveASO = async () => {
    if (!extractedData || !file || !auth.currentUser) return;

    // Validação de campos
    const missingFields = [];
    if (extractedData.funcionario === 'Campo não identificado') missingFields.push('Funcionário');
    if (extractedData.cpf === 'Campo não identificado') missingFields.push('CPF');
    if (extractedData.empregador === 'Campo não identificado') missingFields.push('Empresa');
    if (extractedData.cnpj === 'Campo não identificado') missingFields.push('CNPJ');

    if (missingFields.length > 0) {
      toast.error(`Não é possível salvar. Confira os campos não identificados: ${missingFields.join(', ')}`);
      return;
    }

    setIsSaving(true);
    setSavingStep('Iniciando...');

    try {
      const cnpjLimpo = extractedData.cnpj.replace(/\D/g, '');
      const cpfLimpo = extractedData.cpf.replace(/\D/g, '');
      
      // 1. Verificar/Procurar empresa no banco real
      setSavingStep('Buscando empresa no banco...');
      let company = await companyService.getByCNPJ(cnpjLimpo);
      
      if (!company) {
        setSavingStep('Empresa não encontrada. Consultando CNPJ...');
        const apiData = await companyService.fetchFromBrasilAPI(cnpjLimpo);
        
        if (apiData) {
          setSavingStep('Empresa encontrada na API. Cadastrando...');
          await companyService.upsert(apiData);
          company = await companyService.getByCNPJ(cnpjLimpo);
          toast.success('Empresa cadastrada com sucesso.');
        } else {
          setIsSaving(false);
          setSavingStep('');
          toast.error('Não foi possível consultar o CNPJ automaticamente. Cadastre a empresa manualmente.');
          return;
        }
      } else {
        setSavingStep('Empresa encontrada. Preparando upload...');
      }

      if (!company) throw new Error('Falha ao obter dados da empresa.');

      // Lógica de renomeio do PDF baseada nos dados extraídos
      const sanitizedEmpresa = extractedData.empregador
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
      
      const sanitizedFuncionario = extractedData.funcionario
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();

      const newFileName = `${cnpjLimpo} - ${sanitizedEmpresa} - ${sanitizedFuncionario} - ${cpfLimpo}.pdf`;
      const storagePath = `companies/${cnpjLimpo}/asos/${cpfLimpo}/${newFileName}`;
      
      console.log("ASO_SAVE_FILE_NAME:", newFileName);
      console.log("ASO_SAVE_STORAGE_PATH:", storagePath);
      console.log("ASO_SAVE_CPF:", cpfLimpo);
      console.log("ASO_SAVE_CNPJ:", cnpjLimpo);
      
      // 2. Upload para Storage
      setSavingStep('Fazendo upload do PDF...');
      
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, {
        contentType: 'application/pdf',
        customMetadata: {
          cpf: cpfLimpo,
          cnpj: cnpjLimpo,
          funcionario: sanitizedFuncionario,
          empresa: sanitizedEmpresa
        }
      });
      const pdfUrl = await getDownloadURL(storageRef);

      // 3. Salvar metadados do ASO na coleção CENTRALIZADA (ÍNDICE) para buscas rápidas por CPF
      setSavingStep('Criando índice global do ASO...');
      const asoGlobalRef = doc(collection(db, 'asoDocuments'));
      const asoData = {
        // Campos Padronizados conforme solicitado
        cpfFuncionarioNormalizado: cpfLimpo,
        cnpjEmpresaNormalizado: cnpjLimpo,
        funcionarioNome: extractedData.funcionario,
        empresaNome: company.nome,
        empresaId: cnpjLimpo,
        funcionarioId: cpfLimpo,
        pdfFileName: newFileName,
        pdfUrl,
        storagePath,
        createdAt: serverTimestamp(),
        tipo: "ASO",
        
        // Campos de compatibilidade
        funcionarioCpf: extractedData.cpf,
        funcionarioCpfLimpo: cpfLimpo,
        empresaCnpj: company.cnpjFormatado || extractedData.cnpj,
        empresaCnpjLimpo: cnpjLimpo,
        status: "Ativo",
        origem: "aso_documents_global"
      };

      await setDoc(asoGlobalRef, asoData);
      
      console.log("ASO_INDEX_CREATED", true);
      console.log("ASO_INDEX_COLLECTION", 'asoDocuments');
      console.log("ASO_INDEX_DOC_ID", asoGlobalRef.id);
      console.log("ASO_INDEX_CPF", cpfLimpo);
      console.log("ASO_INDEX_PDF_URL", pdfUrl);

      // 4. Salvar metadados do ASO na subcoleção da empresa (Compatibilidade legada)
      setSavingStep('Sincronizando com empresa...');
      const asoDocRef = doc(collection(db, 'companies', cnpjLimpo, 'asos'));
      await setDoc(asoDocRef, {
        ...asoData,
        origem: "importacao_aso_portal"
      });

      // 5. Salvar/Atualizar Funcionário na subcoleção da empresa
      setSavingStep('Vinculando funcionário...');
      await setDoc(doc(db, 'companies', cnpjLimpo, 'funcionarios', cpfLimpo), {
        nome: extractedData.funcionario,
        cpf: extractedData.cpf,
        cpfLimpo: cpfLimpo,
        empresaId: cnpjLimpo,
        empresaNome: company.nome,
        empresaCnpj: company.cnpjFormatado || extractedData.cnpj,
        empresaCnpjLimpo: cnpjLimpo,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      }, { merge: true });

      setSavedData({ 
        id: asoGlobalRef.id, 
        pdfUrl,
        storagePath,
        newFileName,
        cpf: cpfLimpo,
        cnpj: cnpjLimpo,
        collection: 'asoDocuments'
      });

      // 5. Automação de Logins
      setSavingStep('Configurando acessos automáticos...');
      const companyUserResult = await userService.autoCreateUser(
        cnpjLimpo,
        company.nome,
        'empresa',
        cnpjLimpo,
        company.nome
      );

      const employeeUserResult = await userService.autoCreateUser(
        cpfLimpo,
        extractedData.funcionario,
        'funcionario',
        cnpjLimpo,
        company.nome
      );

      setUserSummary({
        company: companyUserResult as any,
        employee: employeeUserResult as any
      });

      toast.success('ASO e Logins configurados!');
    } catch (error: any) {
      console.error('Erro ao salvar ASO:', error);
      if (error?.code === 'storage/unauthorized') {
        // Log details about current user token to help debug
        try {
          const user = auth.currentUser;
          if (user) {
            const tokenResult = await user.getIdTokenResult(true);
            console.log("DEBUG - User Email:", user.email);
            console.log("DEBUG - Token Claims:", tokenResult.claims);
          } else {
            console.log("DEBUG - No user authenticated");
          }
        } catch (tokenErr) {
          console.error("DEBUG - Error getting token info:", tokenErr);
        }
        toast.error('Sem permissão para salvar o PDF. Verifique as regras do Firebase Storage.');
      } else {
        toast.error('Erro ao salvar no banco de dados. Verifique sua conexão ou permissões.');
      }
    } finally {
      setIsSaving(false);
      setSavingStep('');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] md:rounded-[48px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-8 md:p-12 border-b border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
              <FileText className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Importação de ASO</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Extração automática de dados</p>
            </div>
          </div>

          {savedData && (
            <div className="px-4 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Salvo com Sucesso</span>
            </div>
          )}
        </div>

        <div className="p-8 md:p-12">
          {!extractedData ? (
            <div className="space-y-8">
              <div 
                onClick={() => !isReading && fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-[32px] p-12 text-center cursor-pointer transition-all
                  ${file ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 hover:bg-slate-50 dark:hover:bg-slate-800/30'}
                  ${isReading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf"
                  className="hidden"
                  disabled={isReading}
                />
                
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className={`w-8 h-8 ${file ? 'text-emerald-500' : 'text-slate-400'}`} />
                </div>

                {file ? (
                  <div>
                    <p className="text-slate-900 dark:text-white font-black text-sm uppercase tracking-tight">{file.name}</p>
                    <p className="text-slate-400 font-bold text-[10px] uppercase mt-1">{(file.size / 1024).toFixed(1)} KB • PDF</p>
                    {!isReading && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                        className="mt-4 text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                      >
                        Remover arquivo
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-slate-900 dark:text-white font-black text-sm uppercase tracking-tight">Clique para selecionar o ASO</p>
                    <p className="text-slate-400 font-bold text-[10px] uppercase mt-1">Apenas arquivos PDF são aceitos</p>
                  </div>
                )}
              </div>

              <button
                onClick={readASO}
                disabled={!file || isReading}
                className="w-full py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm rounded-3xl shadow-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {isReading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processando Documento...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Ler ASO
                  </>
                )}
              </button>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: 'Funcionário', key: 'funcionario', value: extractedData.funcionario, icon: User },
                  { label: 'CPF', key: 'cpf', value: extractedData.cpf, icon: Fingerprint },
                  { label: 'Empresa', key: 'empregador', value: extractedData.empregador, icon: Building },
                  { label: 'CNPJ', key: 'cnpj', value: extractedData.cnpj, icon: Hash },
                ].map((field, idx) => (
                  <div key={idx} className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[28px] border border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                        <field.icon className="w-4 h-4 text-emerald-500" />
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{field.label}</span>
                    </div>
                    {savedData ? (
                      <p className={`font-black text-sm px-1 py-2 ${field.value === 'Campo não identificado' ? 'text-red-400 italic' : 'text-slate-900 dark:text-white'}`}>
                        {field.value}
                      </p>
                    ) : (
                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setExtractedData(prev => prev ? {
                            ...prev,
                            [field.key]: val
                          } : null);
                        }}
                        disabled={isSaving}
                        className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black text-sm px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all disabled:opacity-70 disabled:cursor-not-allowed uppercase"
                        placeholder={`Editar ${field.label.toLowerCase()}`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {savedData ? (
                <div className="space-y-6">
                  <div className="p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-[32px] text-center">
                    <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-500/20">
                      <CheckCircle2 className="w-8 h-8 text-white" />
                    </div>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">ASO Salvo com Sucesso</h4>
                    <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mb-6">Os dados foram armazenados e vinculados à empresa.</p>
                    
                    {userSummary && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
                        {/* Resumo Empresa */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                          {userSummary.company.created && <div className="absolute top-0 right-0 p-1 bg-emerald-500 text-white rounded-bl-xl"><ShieldCheck className="w-3 h-3" /></div>}
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <Building className="w-4 h-4 text-slate-400" />
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Acesso Empresa</span>
                            </div>
                            <button 
                              onClick={() => handlePreviewAccessPdf({
                                tipo: 'empresa',
                                nome: extractedData.empregador,
                                documento: extractedData.cnpj,
                                login: extractedData.cnpj.replace(/\D/g, ''),
                                senha: extractedData.cnpj.replace(/\D/g, '').slice(-6)
                              })}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-emerald-500 transition-colors"
                              title="Ver PDF de Acesso"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs font-black text-slate-900 dark:text-white mb-2 leading-tight uppercase line-clamp-1">{extractedData.empregador}</p>
                          <div className="space-y-1.5 pt-2 border-t border-slate-50 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                              <Key className="w-3 h-3 text-slate-300" />
                              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">Login: {extractedData.cnpj.replace(/\D/g, '')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Lock className="w-3 h-3 text-slate-300" />
                              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Senha: {extractedData.cnpj.replace(/\D/g, '').slice(-6)}</span>
                            </div>
                            <div className="mt-2 text-[8px] font-black uppercase tracking-tight px-2 py-1 rounded bg-slate-50 dark:bg-slate-900 w-fit">
                              {(userSummary.company as any).error ? (
                                <span className="text-red-500">Acesso não criado: {(userSummary.company as any).error}</span>
                              ) : (userSummary.company as any).statusLabel ? (
                                <span className="text-emerald-500">
                                  {(userSummary.company as any).statusLabel === '✅ Acesso já existente' 
                                    ? '✅ Empresa já possui acesso' 
                                    : (userSummary.company as any).statusLabel}
                                </span>
                              ) : (userSummary.company as any).existed ? (
                                '✅ Empresa já possui acesso'
                              ) : (
                                '✅ Acesso criado'
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Resumo Funcionário */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                          {userSummary.employee.created && <div className="absolute top-0 right-0 p-1 bg-emerald-500 text-white rounded-bl-xl"><ShieldCheck className="w-3 h-3" /></div>}
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <User className="w-4 h-4 text-slate-400" />
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Acesso Funcionário</span>
                            </div>
                            <button 
                              onClick={() => handlePreviewAccessPdf({
                                tipo: 'funcionario',
                                nome: extractedData.funcionario,
                                documento: extractedData.cpf,
                                empresaNome: extractedData.empregador,
                                login: extractedData.cpf.replace(/\D/g, ''),
                                senha: extractedData.cpf.replace(/\D/g, '').slice(-6)
                              })}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-emerald-500 transition-colors"
                              title="Ver PDF de Acesso"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs font-black text-slate-900 dark:text-white mb-2 leading-tight uppercase line-clamp-1">{extractedData.funcionario}</p>
                          <div className="space-y-1.5 pt-2 border-t border-slate-50 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                              <Key className="w-3 h-3 text-slate-300" />
                              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">Login: {extractedData.cpf.replace(/\D/g, '')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Lock className="w-3 h-3 text-slate-300" />
                              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Senha: {extractedData.cpf.replace(/\D/g, '').slice(-6)}</span>
                            </div>
                            <div className="mt-2 text-[8px] font-black uppercase tracking-tight px-2 py-1 rounded bg-slate-50 dark:bg-slate-900 w-fit">
                              {(userSummary.employee as any).error ? (
                                <span className="text-red-500">Acesso não criado: {(userSummary.employee as any).error}</span>
                              ) : (userSummary.employee as any).statusLabel ? (
                                <span className="text-emerald-500">
                                  {(userSummary.employee as any).statusLabel === '✅ Acesso já existente' 
                                    ? '✅ Funcionário já possui acesso' 
                                    : (userSummary.employee as any).statusLabel}
                                </span>
                              ) : (userSummary.employee as any).existed ? (
                                '✅ Funcionário já possui acesso'
                              ) : (
                                '✅ Acesso criado'
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex flex-wrap justify-center gap-4">
                      <a 
                        href={savedData.pdfUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-6 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ver PDF Salvo
                      </a>
                      <button
                        onClick={() => {
                          setExtractedData(null);
                          setSavedData(null);
                          setFile(null);
                        }}
                        className="px-6 py-3 bg-slate-900 dark:bg-white rounded-xl text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                      >
                        Importar Outro
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-4">
                  <button
                    onClick={() => setExtractedData(null)}
                    disabled={isSaving}
                    className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black text-sm rounded-3xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all uppercase tracking-widest disabled:opacity-50"
                  >
                    Tentar outro arquivo
                  </button>
                  <button
                    onClick={saveASO}
                    disabled={isSaving}
                    className="flex-1 py-5 bg-emerald-500 text-white font-black text-sm rounded-3xl shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {savingStep || 'Salvando...'}
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Salvar ASO
                      </>
                    )}
                  </button>
                </div>
              )}

              {!savedData && (
                <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <p className="text-[10px] font-bold text-amber-600/80 dark:text-amber-500/80 uppercase tracking-tight leading-relaxed">
                    Confira as informações extraídas. Se estiverem corretas, clique em Salvar ASO para persistir no banco de dados e vincular à empresa.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}


