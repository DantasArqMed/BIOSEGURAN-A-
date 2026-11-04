import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Download, MessageCircle, FileText, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import Topbar from '../components/Topbar';
import toast from 'react-hot-toast';

interface PreviewState {
  pdfUrl: string;
  fileName: string;
  data: {
    tipo: 'funcionario' | 'empresa';
    nome: string;
    login: string;
    senha: string;
  };
}

export default function AccessPdfPreview() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    const s = location.state as PreviewState;
    if (!s || !s.pdfUrl) {
      console.error("QR_PREVIEW_LOAD_ERROR");
      toast.error("Dados de visualização não encontrados.");
      navigate(-1);
      return;
    }

    console.log("QR_PREVIEW_OPEN", {
      pdfUrl: s.pdfUrl,
      fileName: s.fileName,
      data: s.data
    });

    setState(s);
    setLoading(false);
  }, [location.state, navigate]);

  useEffect(() => {
    if (!state?.pdfUrl) return;

    // Se o iframe não der trigger no onLoad em 6 segundos, fornecemos o fallback de erro para o usuário abrir manualmente
    const timer = setTimeout(() => {
      if (!iframeLoaded) {
        console.error("QR_PREVIEW_LOAD_ERROR: Tempo limite de carregamento do iframe excedido.");
        setHasError(true);
      }
    }, 6000);

    return () => clearTimeout(timer);
  }, [iframeLoaded, state]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
    console.log("QR_PREVIEW_LOAD_SUCCESS");
  };

  const handleDownload = () => {
    if (!state) return;
    const link = document.createElement('a');
    link.href = state.pdfUrl;
    link.download = state.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Download iniciado!");
  };

  const handleWhatsApp = async () => {
    if (!state) return;
    const { tipo, nome, login, senha } = state.data;
    const portalUrl = "https://app.biosegurancaarqmed.com.br/login";
    
    const message = `Olá! Segue seu acesso ao portal BioSegurança ArqMed:

📌 *${tipo === 'funcionario' ? 'Portal do Trabalhador' : 'Portal da Empresa'}*
👤 *Nome:* ${nome}
🔑 *Login:* ${login}
🔒 *Senha:* ${senha}

🌐 *Acesse pelo link:*
${portalUrl}`;

    try {
      // Tentar usar Web Share API se suportado para arquivos (Geralmente Mobile)
      if (navigator.share && navigator.canShare) {
        const response = await fetch(state.pdfUrl);
        const blob = await response.blob();
        const file = new File([blob], state.fileName, { type: 'application/pdf' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Acesso BioSegurança ArqMed - ${nome}`,
            text: message
          });
          return; // Sucesso no compartilhamento nativo
        }
      }
    } catch (error) {
      console.warn("Falha ao compartilhar via Web Share API, usando fallback wa.me:", error);
    }

    // Fallback: WhatsApp Web/App via link (apenas mensagem, sem anexo automático)
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  if (loading || !state) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <Topbar 
        title="Pré-visualização do Acesso" 
        subtitle={state.data.nome}
        showBackButton
        onBackClick={() => navigate(-1)}
        icon={<FileText className="w-5 h-5 text-emerald-500" />}
      />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col">
        {/* Header Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-3 p-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-[1.01] active:scale-95 transition-all"
          >
            <Download className="w-5 h-5" />
            Baixar PDF
          </button>

          <button
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-3 p-4 bg-white dark:bg-slate-800 text-[#25D366] rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm border border-slate-100 dark:border-slate-700 hover:scale-[1.01] active:scale-95 transition-all"
          >
            <MessageCircle className="w-5 h-5" />
            Enviar WhatsApp
          </button>

          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-3 p-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm border border-slate-100 dark:border-slate-700 hover:scale-[1.01] active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar
          </button>
        </div>

        {/* PDF Viewer Container / preview-container */}
        <div className="flex-1 rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden relative">
          <div className="preview-container relative w-full h-[calc(100vh-250px)] min-h-[550px]" style={{ width: '100%', height: 'calc(100vh - 250px)', minHeight: '550px' }}>
            {!iframeLoaded && !hasError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-sm z-20">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carregando PDF...</p>
                </div>
              </div>
            )}

            {hasError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 text-center z-30">
                <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 rounded-2xl flex items-center justify-center mb-4 border border-red-100 dark:border-red-900/30">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Não foi possível carregar a prévia do PDF.</h4>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6 text-[10px] font-bold uppercase tracking-wider leading-relaxed">
                  A visualização direta foi impedida pelas políticas do navegador ou conexão. Utilize a alternativa abaixo para visualizar.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <a 
                    href={state.pdfUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-6 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-md"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir PDF em nova guia
                  </a>
                  <button 
                    onClick={() => {
                      setHasError(false);
                      setIframeLoaded(false);
                      // Force a tiny visual reload of the URL by appending unique hash
                      const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
                      if (iframe) {
                        iframe.src = `${state.pdfUrl}#view=FitH&toolbar=1&navpanes=0&scrollbar=1&t=${Date.now()}`;
                      }
                    }}
                    className="px-6 py-3.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all"
                  >
                    Tentar Novamente
                  </button>
                </div>
              </div>
            )}
            
            <iframe 
              id="preview-iframe"
              src={`${state.pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`} 
              className="w-full h-full border-none relative z-10"
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Prévia do QR Code"
              onLoad={handleIframeLoad}
              onError={() => {
                console.error("QR_PREVIEW_LOAD_ERROR");
                setHasError(true);
              }}
            />
          </div>
        </div>

        {/* Global Helper Footer */}
        <div className="mt-4 text-center flex flex-wrap justify-center gap-4">
          <a 
            href={state.pdfUrl} 
            target="_blank" 
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-emerald-500 font-black text-[10px] uppercase tracking-widest hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir PDF em nova guia (Visualizador Externo)
          </a>
        </div>
      </main>
    </div>
  );
}
