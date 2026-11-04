import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { siteImages } from '../config/siteImages';

interface AccessPdfData {
  tipo: 'funcionario' | 'empresa';
  nome: string;
  documento: string; // CPF ou CNPJ formatado
  empresaNome?: string;
  login: string; // CPF ou CNPJ limpo
  senha: string;
}

export interface GeneratedPdfResult {
  blob: Blob;
  fileName: string;
  data: AccessPdfData;
}

export const generateAccessPdf = async (data: AccessPdfData): Promise<GeneratedPdfResult> => {
  const { tipo, nome, documento, empresaNome, login, senha } = data;
  
  // Criar o PDF (A4 é padrão)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Configurações visuais
  const brandGreen = [16, 185, 129]; // emerald-500 equivalent
  const textDark = [15, 23, 42]; // slate-900
  const textGray = [100, 116, 139]; // slate-500

  // 1. Cabeçalho com detalhe verde
  doc.setFillColor(brandGreen[0], brandGreen[1], brandGreen[2]);
  doc.rect(0, 0, pageWidth, 15, 'F');

  // 2. Logo
  const tryLoadLogo = async () => {
    try {
      // Usar caminho local para evitar CORS (Opção 1 recomendada)
      // O usuário deve garantir que este arquivo exista em /public/logo_bioseguranca.png
      const logoUrl = "/logo_bioseguranca.png"; 
      
      const response = await fetch(logoUrl);
      if (!response.ok) throw new Error("Local logo not found");

      const blob = await response.blob();
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64 = await base64Promise;
      
      doc.addImage(base64, 'PNG', pageWidth / 2 - 25, 20, 50, 15);
      return true;
    } catch (e) {
      // Fallback Visual: Texto estilizado no lugar da logo se o arquivo local falhar
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(brandGreen[0], brandGreen[1], brandGreen[2]);
      doc.text('BioSegurança ArqMed', pageWidth / 2, 28, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(textGray[0], textGray[1], textGray[2]);
      doc.text('Saúde e Segurança do Trabalho', pageWidth / 2, 33, { align: 'center' });
      return false;
    }
  };

  await tryLoadLogo();

  // 3. Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  const title = tipo === 'funcionario' ? 'Acesso ao Portal do Trabalhador' : 'Acesso ao Portal da Empresa';
  doc.text(title, pageWidth / 2, 50, { align: 'center' });

  // 4. Card Central (Bordas arredondadas)
  const cardX = 15;
  const cardY = 65;
  const cardWidth = pageWidth - 30;
  const cardHeight = 110;

  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 5, 5, 'FD');

  // 5. Dados do Usuário
  let currentY = cardY + 15;
  doc.setFontSize(10);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);
  doc.text(tipo === 'funcionario' ? 'NOME DO FUNCIONÁRIO' : 'NOME DA EMPRESA', cardX + 10, currentY);
  
  currentY += 7;
  doc.setFontSize(14);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  const splitNome = doc.splitTextToSize(nome.toUpperCase(), cardWidth - 20);
  doc.text(splitNome, cardX + 10, currentY);
  currentY += (splitNome.length * 6);

  doc.setFontSize(10);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);
  doc.text(tipo === 'funcionario' ? 'CPF' : 'CNPJ', cardX + 10, currentY);
  
  currentY += 7;
  doc.setFontSize(14);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(documento, cardX + 10, currentY);
  currentY += 12;

  if (tipo === 'funcionario' && empresaNome) {
    doc.setFontSize(10);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text('EMPRESA', cardX + 10, currentY);
    
    currentY += 7;
    doc.setFontSize(12);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    const splitEmpresa = doc.splitTextToSize(empresaNome.toUpperCase(), cardWidth - 20);
    doc.text(splitEmpresa, cardX + 10, currentY);
    currentY += (splitEmpresa.length * 6);
  }

  // Login e Senha em Destaque
  currentY += 5;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(cardX + 5, currentY - 5, cardWidth - 10, 30, 3, 3, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);
  doc.text('LOGIN', cardX + 15, currentY + 5);
  doc.text('SENHA TEMPORÁRIA', cardX + cardWidth / 2 + 5, currentY + 5);

  doc.setFontSize(16);
  doc.setTextColor(brandGreen[0], brandGreen[1], brandGreen[2]);
  doc.text(login, cardX + 15, currentY + 15);
  doc.text(senha, cardX + cardWidth / 2 + 5, currentY + 15);

  // 6. QR Code
  const qrUrl = tipo === 'funcionario' 
    ? `https://app.biosegurancaarqmed.com.br/login?cpf=${login}`
    : `https://app.biosegurancaarqmed.com.br/login?cnpj=${login}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      margin: 1,
      width: 400,
      color: {
        dark: '#0f172a', // slate-900
        light: '#ffffff'
      }
    });

    const qrSize = 60;
    const qrX = pageWidth / 2 - qrSize / 2;
    const qrY = cardY + cardHeight + 15;
    
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    
    doc.setFontSize(10);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text('Escaneie para acessar o portal', pageWidth / 2, qrY + qrSize + 10, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(textGray[0], textGray[1], textGray[2]);
    doc.text('Ao acessar, o documento já estará preenchido.', pageWidth / 2, qrY + qrSize + 17, { align: 'center' });
    doc.text('Digite apenas a senha temporária.', pageWidth / 2, qrY + qrSize + 22, { align: 'center' });

  } catch (err) {
    console.error("Erro ao gerar QR Code:", err);
  }

  // 7. Rodapé
  doc.setDrawColor(241, 245, 249); // slate-100
  doc.line(15, pageHeight - 25, pageWidth - 15, pageHeight - 25);
  
  doc.setFontSize(10);
  doc.setTextColor(brandGreen[0], brandGreen[1], brandGreen[2]);
  doc.text('BioSegurança ArqMed', pageWidth / 2, pageHeight - 15, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(textGray[0], textGray[1], textGray[2]);
  doc.text('Saúde e Segurança do Trabalho', pageWidth / 2, pageHeight - 10, { align: 'center' });

  // 8. Result
  const fileName = tipo === 'funcionario'
    ? `ACESSO_Trabalhador_${nome.replace(/\s+/g, '_').toUpperCase()}_${login}.pdf`
    : `ACESSO_Empresa_${login}.pdf`;
    
  return {
    blob: doc.output('blob'),
    fileName,
    data
  };
};
