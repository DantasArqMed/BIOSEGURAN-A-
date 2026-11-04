import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import ThemeToggleButton from '../components/ThemeToggleButton';
import ScaleControl from '../components/ScaleControl';
import { 
  FileText, 
  ArrowLeft, 
  Download, 
  Trash2, 
  Calculator, 
  Building2, 
  User as UserIcon, 
  MapPin, 
  CreditCard, 
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  History,
  Home,
  ChevronDown, 
  Activity, 
  FileStack, 
  Loader2, 
  RefreshCw 
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBrandingConfig, BrandingData } from '../services/brandingService';
import { siteImages } from '../config/siteImages';
import { contractService } from '../services/contractService';
import { logService } from '../services/logService';
import { companyService } from '../services/companyService';
import { valorPorExtenso, dataPorExtenso } from '../utils/contractUtils';
import toast, { Toaster } from 'react-hot-toast';

const contractFields = {
  'ESOCIAL E LAUDO': [
    'LOCAL_FORO', 'DATA_EXTENSO', 'EMPRESA', 'CNPJ', 'ENDERECO', 'CIDADE_ESTADO', 
    'CEP', 'QNT_FUNCIONARIO', 'VALOR', 'VALOR_ESOCIAL', 'VALOR_PARCELA', 
    'VALOR_PARCELA_EXTENSO', 'VALOR_LAUDO', 'VALOR_LAUDO_EXTENSO', 
    'PARCELA', 'VENCIMENTO', 'PRAZO_CONTRATO', 'TESTEMUNHA1', 'RG1', 'TESTEMUNHA2', 'RG2'
  ],
  'ESOCIAL LAD CONSUL': [
    'LOCAL_FORO', 'DATA_EXTENSO', 'EMPRESA', 'CNPJ', 'ENDERECO', 'CIDADE_ESTADO', 
    'CEP', 'QNT_FUNCIONARIO', 'VALOR', 'VALOR_ESOCIAL', 'VALOR_PARCELA', 
    'VALOR_PARCELA_EXTENSO', 'PARCELA', 'VENCIMENTO', 'PRAZO_CONTRATO', 'TESTEMUNHA1', 'RG1', 'TESTEMUNHA2', 'RG2'
  ],
  'NR01': [
    'LOCAL_FORO', 'DATA_EXTENSO', 'EMPRESA', 'CNPJ', 'ENDERECO', 'CIDADE_ESTADO', 
    'CEP', 'VALOR_ESOCIAL', 'VALOR_ESOCIAL_EXTENSO', 'VALOR_PARCELA', 
    'VALOR_PARCELA_EXTENSO', 'PARCELA', 'VENCIMENTO', 'PRAZO_CONTRATO', 'TESTEMUNHA1', 'RG1', 'TESTEMUNHA2', 'RG2'
  ],
  'NR01 EPP': [
    'LOCAL_FORO', 'DATA_EXTENSO', 'EMPRESA', 'CNPJ', 'ENDERECO', 'CIDADE_ESTADO', 
    'CEP', 'VALOR_ESOCIAL', 
    'VALOR_ESOCIAL_EXTENSO', 'VALOR_PARCELA', 'VALOR_PARCELA_EXTENSO', 
    'PARCELA', 'VENCIMENTO', 'PRAZO_CONTRATO'
  ]
};

export default function GenerateContract() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userData } = useAuth();
  
  const renovarContrato = location.state?.renovarContrato;
  const isRenewal = !!renovarContrato;
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'database' | 'api' | 'error' | 'not_found'>('idle');
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [validationTriggered, setValidationTriggered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false); // Used if needed
  
  const [formData, setFormData] = useState({
    modelo: 'NR01',
    cnpj: '',
    dono: '',
    empresa: '',
    endereco: '',
    cep: '',
    cidadeEstado: '',
    qntFuncionario: '',
    valorEsocial: '',
    valorLaudo: '',
    parcelas: '1',
    vencimento: '',
    prazoContrato: '',
    localForo: '',
    testemunha1: 'Moisés Alves Silva',
    testemunha2: 'DAVID ALLAN DE OLIVEIRA SOUZA',
    rg1: '2165866',
    rg2: '03914517158',
    dataContrato: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const isFieldActive = (fieldName: string) => {
    const activePlaceholders = contractFields[formData.modelo as keyof typeof contractFields] || [];
    const isEpp = !formData.modelo || 
                  formData.modelo.toLowerCase() === 'nr01_epp' || 
                  formData.modelo.toLowerCase() === 'nr01 epp' || 
                  formData.modelo.toLowerCase().replace(/\s+|_/g, '') === 'nr01epp';
    
    switch (fieldName) {
      case 'cnpj': return activePlaceholders.includes('CNPJ');
      case 'empresa': return activePlaceholders.includes('EMPRESA');
      case 'dono': return activePlaceholders.includes('DONO');
      case 'endereco': return activePlaceholders.includes('ENDERECO');
      case 'cep': return activePlaceholders.includes('CEP');
      case 'cidadeEstado': return activePlaceholders.includes('CIDADE_ESTADO');
      case 'qntFuncionario': return activePlaceholders.includes('QNT_FUNCIONARIO');
      case 'valorEsocial': return activePlaceholders.includes('VALOR_ESOCIAL') || activePlaceholders.includes('VALOR');
      case 'parcelas': return activePlaceholders.includes('PARCELA');
      case 'valorLaudo': return activePlaceholders.includes('VALOR_LAUDO');
      case 'vencimento': return activePlaceholders.includes('VENCIMENTO');
      case 'prazoContrato': return activePlaceholders.includes('PRAZO_CONTRATO');
      case 'localForo': return activePlaceholders.includes('LOCAL_FORO');
      case 'testemunha1': return !isEpp;
      case 'rg1': return !isEpp;
      case 'testemunha2': return !isEpp;
      case 'rg2': return !isEpp;
      default: return false;
    }
  };

  useEffect(() => {
    const isEpp = !formData.modelo || 
                  formData.modelo.toLowerCase() === 'nr01_epp' || 
                  formData.modelo.toLowerCase() === 'nr01 epp' || 
                  formData.modelo.toLowerCase().replace(/\s+|_/g, '') === 'nr01epp';
    if (isEpp) {
      console.log('CONTRACT_WITNESSES_SECTION_HIDDEN_NR01_EPP');
    } else {
      console.log('CONTRACT_WITNESSES_SECTION_VISIBLE');
    }
  }, [formData.modelo]);

  useEffect(() => {
    const loadBranding = async () => {
      const data = await getBrandingConfig();
      setBranding(data);
    };
    loadBranding();

    // Reset lookup status if renewal
    if (isRenewal) {
      console.log('[GenerateContract] Dados recebidos para renovação:', renovarContrato);
      setLookupStatus('database');
      
      // Use functional update to ensure we have the correct base state
      setFormData(prev => {
        let renewalFields = { ...prev };
        
        // Helper to extract numeric value from currency string
        const parseCurrency = (val: any) => {
          if (!val) return '';
          const str = String(val);
          // Handles "R$ 1.500,00" -> "1500.00"
          return str.replace(/[^\d,]/g, '').replace(',', '.');
        };

      // Priority 1: formData (User requested specialized block)
        if (renovarContrato.formData) {
          console.log('[RenewContract] formData encontrado:', renovarContrato.formData);
          console.log('[GenerateContract] Formulário preenchido via formData:', renovarContrato.formData);
          renewalFields = {
            ...renewalFields,
            ...renovarContrato.formData,
            modelo: renovarContrato.formData.modeloContrato || renovarContrato.tipoContrato || renewalFields.modelo
          };
        }
        // Priority 2: templateData (Modern contracts)
        else if (renovarContrato.templateData) {
          console.log('[GenerateContract] Preenchendo via templateData');
          const td = renovarContrato.templateData;
          renewalFields = {
            ...renewalFields,
            modelo: renovarContrato.tipoContrato || renewalFields.modelo,
            cnpj: td.CNPJ || renewalFields.cnpj,
            dono: td.DONO || renewalFields.dono,
            empresa: td.EMPRESA || renewalFields.empresa,
            endereco: td.ENDERECO || renewalFields.endereco,
            cep: td.CEP || renewalFields.cep,
            cidadeEstado: td.CIDADE_ESTADO || renewalFields.cidadeEstado,
            qntFuncionario: td.QNT_FUNCIONARIO || renewalFields.qntFuncionario,
            valorEsocial: parseCurrency(td.VALOR_ESOCIAL) || renewalFields.valorEsocial,
            valorLaudo: parseCurrency(td.VALOR_LAUDO) || renewalFields.valorLaudo,
            parcelas: td.PARCELA || renewalFields.parcelas,
            vencimento: td.VENCIMENTO || renewalFields.vencimento,
            prazoContrato: td.PRAZO_CONTRATO || renewalFields.prazoContrato,
            localForo: td.LOCAL_FORO || renewalFields.localForo,
            testemunha1: td.TESTEMUNHA1 || renewalFields.testemunha1,
            testemunha2: td.TESTEMUNHA2 || renewalFields.testemunha2,
            rg1: td.RG1 || renewalFields.rg1,
            rg2: td.RG2 || renewalFields.rg2
          };
        } 
        // Priority 2: Flattened fields (Future-proofing/intermediate versions)
        // Check for common variations in naming
        else {
          console.log('[GenerateContract] Preenchendo via campos do documento (Flattened)');
          renewalFields = {
            ...renewalFields,
            modelo: renovarContrato.tipoContrato || renewalFields.modelo,
            empresa: renovarContrato.empresa || renewalFields.empresa,
            cnpj: renovarContrato.cnpj || renovarContrato.CNPJ || renewalFields.cnpj,
            dono: renovarContrato.dono || renovarContrato.DONO || renovarContrato.responsavel || renewalFields.dono,
            endereco: renovarContrato.endereco || renovarContrato.ENDERECO || renewalFields.endereco,
            cep: renovarContrato.cep || renovarContrato.CEP || renewalFields.cep,
            cidadeEstado: renovarContrato.cidadeEstado || renovarContrato.CIDADE_ESTADO || renovarContrato.cidade || renewalFields.cidadeEstado,
            qntFuncionario: renovarContrato.qntFuncionario || renovarContrato.QNT_FUNCIONARIO || renewalFields.qntFuncionario,
            valorEsocial: parseCurrency(renovarContrato.valorEsocial || renovarContrato.VALOR_ESOCIAL) || renewalFields.valorEsocial,
            valorLaudo: parseCurrency(renovarContrato.valorLaudo || renovarContrato.VALOR_LAUDO) || renewalFields.valorLaudo,
            parcelas: renovarContrato.parcelas || renovarContrato.PARCELA || renewalFields.parcelas,
            vencimento: renovarContrato.vencimento || renovarContrato.VENCIMENTO || renewalFields.vencimento,
            prazoContrato: renovarContrato.prazoContrato || renovarContrato.PRAZO_CONTRATO || renewalFields.prazoContrato,
            localForo: renovarContrato.localForo || renovarContrato.LOCAL_FORO || renewalFields.localForo,
            testemunha1: renovarContrato.testemunha1 || renovarContrato.TESTEMUNHA1 || renewalFields.testemunha1,
            testemunha2: renovarContrato.testemunha2 || renovarContrato.TESTEMUNHA2 || renewalFields.testemunha2,
            rg1: renovarContrato.rg1 || renovarContrato.RG1 || renewalFields.rg1,
            rg2: renovarContrato.rg2 || renovarContrato.RG2 || renewalFields.rg2
          };
        }

        console.log('[GenerateContract] Campos preenchidos na renovação:', renewalFields);
        
        // Enforce system-wide standard witnesses for contract renewals (Pillar: System Constraint)
        renewalFields.testemunha1 = 'Moisés Alves Silva';
        renewalFields.testemunha2 = 'DAVID ALLAN DE OLIVEIRA SOUZA';
        renewalFields.rg1 = '2165866';
        renewalFields.rg2 = '03914517158';

        return renewalFields;
      });
    }
  }, [isRenewal, renovarContrato]);

  useEffect(() => {
    const cleanCNPJ = formData.cnpj.replace(/\D/g, '');
    
    if (cleanCNPJ.length !== 14 || lookupStatus !== 'idle') {
      if (cleanCNPJ.length !== 14) setLookupStatus('idle');
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingCompany(true);
      setLookupStatus('idle');

      try {
        const company = await companyService.lookupCNPJ(cleanCNPJ);
        
        if (company) {
          // Se vier do banco (antigo), pode estar separado. Se vier da API, já vem montado no 'endereco'.
          // Mas para garantir o formato solicitado "RUA, NÚMERO - BAIRRO", montamos aqui se tivermos os campos separados.
          let addressToFill = company.endereco;
          
          if (company.source === 'api') {
            // No fetchFromBrasilAPI já montamos o endereco como "RUA, NÚMERO - BAIRRO"
            addressToFill = company.endereco;
          } else if (company.numero) {
            // Se vier do banco e tiver número separado, montamos
            addressToFill = `${company.endereco}, ${company.numero}${company.bairro ? ` - ${company.bairro}` : ''}`;
          }

          setFormData(prev => ({
            ...prev,
            empresa: (prev.empresa === '' || !prev.empresa) ? company.nome : prev.empresa,
            dono: (prev.dono === '' || !prev.dono) ? company.responsavel : prev.dono,
            endereco: (prev.endereco === '' || !prev.endereco) ? addressToFill : prev.endereco,
            cep: (prev.cep === '' || !prev.cep) ? company.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : prev.cep,
            cidadeEstado: (prev.cidadeEstado === '' || !prev.cidadeEstado) ? company.cidadeEstado : prev.cidadeEstado,
            qntFuncionario: company.qntFuncionarios || prev.qntFuncionario,
            prazoContrato: company.prazoContratoPadrao || prev.prazoContrato,
            localForo: company.localForoPadrao || prev.localForo
          }));

          const status = (company.source === 'database' || company.source === 'cache-stale') ? 'database' : 'api';
          setLookupStatus(status);

          const message = status === 'database' 
            ? 'Empresa encontrada no cadastro.' 
            : 'Dados encontrados na ArqMedAPI.';
          
          toast.success(message, {
            icon: '🏢',
            style: { borderRadius: '12px', background: '#0F172A', color: '#fff' }
          });

          // BACKGROUND SYNC logic: if data is stale (> 30 days)
          if (company.source === 'cache-stale') {
            console.log('[CNPJ Lookup] Data is stale, starting background sync...');
            
            // Trigger background fetch
            companyService.fetchFromBrasilAPI(cleanCNPJ).then(async (freshData) => {
              if (freshData) {
                // Update Firestore
                await companyService.upsert(freshData);
                console.log('[CNPJ Lookup] Background sync complete and Firestore updated.');

                // Only update form if user hasn't changed the CNPJ in the meantime
                setFormData(current => {
                  if (current.cnpj.replace(/\D/g, '') === cleanCNPJ) {
                    toast('Dados da empresa atualizados com sucesso.', {
                      icon: '🔄',
                      style: { borderRadius: '12px' }
                    });
                    return {
                      ...current,
                      empresa: freshData.nome,
                      dono: freshData.responsavel || current.dono,
                      endereco: freshData.endereco,
                      cep: freshData.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2'),
                      cidadeEstado: freshData.cidadeEstado
                    };
                  }
                  return current;
                });
                setLookupStatus('api');
              }
            }).catch(err => {
              console.warn('[CNPJ Lookup] Background sync failed:', err);
            });
          }
        } else {
          setLookupStatus('not_found');
          toast.error("Empresa não encontrada. Preencha manualmente.", {
            style: { borderRadius: '12px' }
          });
        }
      } catch (err: any) {
        console.error("Lookup error:", err);
        setLookupStatus('error');
        toast.error("Não foi possível buscar os dados do CNPJ. Preencha manualmente.");
      } finally {
        setIsSearchingCompany(false);
      }
    }, 1000); // 1000ms debounce

    return () => clearTimeout(timer);
  }, [formData.cnpj]);

  useEffect(() => {
    // Se mudar de modelo e não for o modelo que suporta laudos, limpa o valor dos laudos
    if (formData.modelo !== 'ESOCIAL E LAUDO') {
      setFormData(prev => ({ ...prev, valorLaudo: '' }));
    }
  }, [formData.modelo]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let { name, value } = e.target;
    
    // Simple Masks
    if (name === 'cnpj') {
      value = value.replace(/\D/g, '').slice(0, 14);
      if (value.length > 2) value = value.replace(/^(\d{2})(\d)/, '$1.$2');
      if (value.length > 5) value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
      if (value.length > 8) value = value.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4');
      if (value.length > 12) value = value.replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
    }

    if (name === 'cep') {
      value = value.replace(/\D/g, '').slice(0, 8);
      if (value.length > 5) value = value.replace(/^(\d{5})(\d)/, '$1-$2');
    }

    // Numeric only fields
    if (['prazoContrato', 'rg1', 'rg2'].includes(name)) {
      value = value.replace(/\D/g, '');
    }

    if (name === 'vencimento') {
      value = value.replace(/\D/g, '').slice(0, 2);
    }

    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (isFieldActive('cnpj') && !formData.cnpj) newErrors.cnpj = 'CNPJ é obrigatório';
    if (isFieldActive('empresa') && !formData.empresa) newErrors.empresa = 'Nome da empresa é obrigatório';
    if (isFieldActive('valorEsocial') && !formData.valorEsocial) newErrors.valorEsocial = 'Valor eSocial é obrigatório';
    
    // Witness validation (Optional for UI but user mentioned placeholders must be replaced)
    if (isFieldActive('vencimento') && formData.vencimento) {
      const v = parseInt(formData.vencimento);
      if (v < 1 || v > 31) {
        newErrors.vencimento = 'Dia de vencimento deve ser entre 1 e 31';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateParcelaValue = () => {
    const valor = parseFloat(formData.valorEsocial) || 0;
    const parcelas = parseInt(formData.parcelas) || 1;
    return valor / parcelas;
  };

  const checkMissingFields = () => {
    const missing: string[] = [];
    if (isFieldActive('cnpj') && !formData.cnpj) missing.push('CNPJ');
    if (isFieldActive('empresa') && !formData.empresa) missing.push('Empresa');
    if (isFieldActive('endereco') && !formData.endereco) missing.push('Endereço');
    if (!formData.modelo) missing.push('Modelo');
    if (isFieldActive('vencimento') && !formData.vencimento) missing.push('Vencimento');
    if (isFieldActive('testemunha1') && !formData.testemunha1) missing.push('Testemunha 1');
    if (isFieldActive('testemunha2') && !formData.testemunha2) missing.push('Testemunha 2');
    return missing;
  };

  const handleGenerateClick = () => {
    if (!validate()) {
      setValidationTriggered(true);
      return;
    }
    
    const missing = checkMissingFields();
    if (missing.length > 0) {
      setMissingFields(missing);
      setShowValidationModal(true);
      setValidationTriggered(true);
    } else {
      handleGenerate();
    }
  };

  const handleGenerate = async () => {
    if (!validate()) return;
    
    setIsLoading(true);
    try {
      // Definindo o arquivo do modelo
      let modelPath = '';
      switch (formData.modelo) {
        case 'ESOCIAL LAD CONSUL': modelPath = '/templates/esocial_lad_consul.docx'; break;
        case 'ESOCIAL E LAUDO': modelPath = '/templates/esocial_e_laudo.docx'; break;
        case 'NR01': modelPath = '/templates/nr01.docx'; break;
        case 'NR01 EPP': modelPath = '/templates/nr01_epp.docx'; break;
        default: modelPath = '/templates/nr01.docx';
      }

      const valorParcela = calculateParcelaValue();
      const valorEsocial = parseFloat(formData.valorEsocial) || 0;
      const valorLaudo = parseFloat(formData.valorLaudo) || 0;
      const isEsocialELaudo = formData.modelo === 'ESOCIAL E LAUDO';

      // Preparar os dados para substituição
      const templateData = {
        CNPJ: formData.cnpj,
        DONO: formData.dono,
        EMPRESA: formData.empresa,
        ENDERECO: formData.endereco,
        CEP: formData.cep,
        CIDADE_ESTADO: formData.cidadeEstado,
        QNT_FUNCIONARIO: formData.qntFuncionario,
        VALOR_ESOCIAL: valorEsocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        VALOR: valorEsocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        VALOR_LAUDO: isEsocialELaudo ? valorLaudo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
        PARCELA: formData.parcelas,
        VALOR_PARCELA: valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        VALOR_PARCELA_EXTENSO: valorPorExtenso(valorParcela),
        VALOR_ESOCIAL_EXTENSO: valorPorExtenso(valorEsocial),
        VALOR_LAUDO_EXTENSO: isEsocialELaudo ? valorPorExtenso(valorLaudo) : '',
        VENCIMENTO: formData.vencimento,
        PRAZO_CONTRATO: formData.prazoContrato,
        LOCAL_FORO: formData.localForo,
        TESTEMUNHA1: formData.testemunha1,
        TESTEMUNHA2: formData.testemunha2,
        RG1: formData.rg1,
        RG2: formData.rg2,
        DATA_EXTENSO: formData.dataContrato ? (() => {
          const [year, month, day] = formData.dataContrato.split('-');
          return dataPorExtenso(new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
        })() : dataPorExtenso()
      };

      if (isFieldActive('testemunha1')) {
        console.log('CONTRACT_WITNESSES_DATA_SENT', {
          testemunha1: formData.testemunha1,
          rg1: formData.rg1,
          testemunha2: formData.testemunha2,
          rg2: formData.rg2
        });
      }

      const sanitize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const fileName = `contrato-${sanitize(formData.empresa)}-${sanitize(formData.modelo)}.docx`;

      // Chamada para o serviço unificado com tratamento de placeholders e erros
      const userMetadata = user && userData ? { 
        id: user.uid, 
        nome: userData.nome, 
        email: user.email, 
        cidade: userData.verContratos || userData.cidade 
      } : undefined;
      
      await contractService.generate(
        modelPath, 
        templateData, 
        fileName, 
        userMetadata,
        formData.modelo,
        isRenewal ? renovarContrato.id : undefined,
        formData
      );

      // Registrar log da ação
      if (user && userData) {
        logService.record(
          { uid: user.uid, nome: userData.nome, email: user.email },
          'GERAR_CONTRATO',
          `Gerou contrato para "${formData.empresa}" (${formData.modelo})`
        ).catch(() => {});
      }

      toast.success("Contrato gerado com sucesso!", {
        duration: 5000,
        position: 'bottom-right',
        style: {
          background: '#0F172A',
          color: '#fff',
          borderRadius: '16px',
          padding: '16px',
          fontWeight: 'bold'
        }
      });

    } catch (error: any) {
      console.error('[GenerateContract] Erro:', error);
      toast.error(error.message || "Erro ao gerar contrato. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (name: string) => {
    const baseMissingList = [];
    if (isFieldActive('cnpj')) baseMissingList.push('cnpj');
    if (isFieldActive('empresa')) baseMissingList.push('empresa');
    if (isFieldActive('endereco')) baseMissingList.push('endereco');
    if (isFieldActive('vencimento')) baseMissingList.push('vencimento');
    if (isFieldActive('testemunha1')) baseMissingList.push('testemunha1');
    if (isFieldActive('testemunha2')) baseMissingList.push('testemunha2');
    
    const isMissing = validationTriggered && !formData[name as keyof typeof formData] && baseMissingList.includes(name);
    const isReadonly = ['testemunha1', 'rg1', 'testemunha2', 'rg2'].includes(name);

    return `
      block w-full px-4 md:px-6 py-3.5 lg:py-4 xl:py-5 border opacity-100 transition-all duration-300
      ${isReadonly ? 'bg-slate-50/50 dark:bg-slate-900/60 cursor-not-allowed select-none border-slate-200/60 dark:border-slate-800/60' : 'bg-white dark:bg-slate-900 border-emerald-500/20 dark:border-emerald-500/10'}
      ${!isReadonly && (errors[name] || isMissing) ? 'border-red-400 dark:border-red-900 ring-2 ring-red-50 dark:ring-red-900/10' : ''} 
      rounded-2xl md:rounded-[28px] ${isReadonly ? 'text-slate-400 dark:text-slate-500 font-bold' : 'text-slate-950 dark:text-white font-bold'} placeholder:text-slate-300 dark:placeholder:text-slate-700 text-xs md:text-sm
      ${isReadonly ? '' : 'focus:outline-none focus:ring-8 focus:ring-emerald-500/[0.04] focus:border-emerald-500/30'}
      shadow-sm ${isReadonly ? '' : 'focus:shadow-emerald-500/5'}
    `;
  };

  const sectionHeader = (index: string, title: string, subtitle: string) => (
    <div className="flex items-start gap-4 md:gap-6 mb-6 md:mb-12 lg:mb-8 xl:mb-12 overflow-hidden">
      <div className="w-10 h-10 lg:w-10 lg:h-10 xl:w-12 xl:h-12 shrink-0 bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded-xl md:rounded-2xl flex items-center justify-center font-black text-xs md:text-sm shadow-xl shadow-slate-900/10 transition-all border border-emerald-500/20">
        {index}
      </div>
      <div>
        <h3 className="text-xl md:text-3xl lg:text-2xl xl:text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.9] mb-2 md:mb-3 transition-colors">{title}</h3>
        <p className="text-slate-500 dark:text-slate-400 font-bold text-xs md:text-sm transition-colors opacity-80">{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300">
      {/* Dynamic Header */}
      <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-emerald-500/10 dark:border-emerald-500/5 px-4 md:px-8 py-2.5 lg:py-3 xl:py-5 flex items-center justify-between sticky top-0 z-[100] shadow-[0_2px_20px_-5px_rgba(0,0,0,0.05)] transition-all">
        <div className="flex items-center gap-3 md:gap-6">
          <button 
            onClick={() => navigate('/dashboard')}
            className="group flex items-center gap-2 text-slate-400 dark:text-slate-500 hover:text-emerald-500 transition-all font-black text-[9px] md:text-[10px] uppercase tracking-[0.2em]"
          >
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl md:rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-emerald-500/5 group-hover:text-emerald-500 border border-transparent group-hover:border-emerald-500/20 transition-all shadow-sm">
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 transition-transform group-hover:-translate-x-1" />
            </div>
            <span className="hidden xs:block">Voltar</span>
          </button>
          
          <div className="hidden md:block h-8 w-[1px] bg-slate-100 dark:bg-slate-800" />
          
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center justify-center p-1 md:p-1.5 bg-emerald-500/5 rounded-lg md:rounded-xl border border-emerald-500/10 transition-all">
              <img 
                src={siteImages.logoPrincipal} 
                className="h-6 md:h-7 xl:h-8 w-auto object-contain dark:brightness-110" 
                alt="Logo BioSegurança ArqMed" 
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[8px] md:text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-0.5">
                {branding?.companyName || 'BioSegurança ArqMed'}
              </span>
              <h1 className="text-[10px] md:text-sm font-black text-slate-900 dark:text-white tracking-tighter transition-colors">Emissão</h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <ScaleControl />
          <ThemeToggleButton />
          
          <button 
            onClick={() => navigate('/contratos')}
            className="px-3 md:px-6 py-2 md:py-3 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-black rounded-xl md:rounded-2xl hover:bg-emerald-500/5 hover:border-emerald-500/20 hover:text-emerald-500 transition-all text-[9px] md:text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm group"
          >
            <History className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:block">Painel</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 md:p-8 xl:p-12">
        {isRenewal && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 lg:mb-8 2xl:mb-12 p-4 md:p-6 lg:p-4 xl:p-6 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 dark:border-emerald-500/10 rounded-[24px] md:rounded-[40px] flex items-center gap-4 md:gap-6 shadow-2xl shadow-emerald-500/5 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="w-10 h-10 md:w-14 md:h-14 bg-emerald-500 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/30 shrink-0">
              <RefreshCw className="w-5 h-5 md:w-8 md:h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[8px] md:text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] mb-0.5">Renovação Assistida</h4>
              <p className="text-[10px] md:text-sm text-slate-600 dark:text-slate-400 font-bold leading-tight truncate">Atualizando <span className="text-emerald-600 font-black">{renovarContrato.empresa}</span></p>
            </div>
          </motion.div>
        )}
        
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
          
          {/* Main Operational Flow */}
          <div className="flex-1 w-full space-y-10 md:space-y-12 xl:space-y-20 pb-20">
            
            {/* Stage 1: Setup & Identification */}
            <section className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] p-6 lg:p-7 xl:p-10 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-all text-left">
              {sectionHeader("01", "Identificação", "Dados cadastrais e modelo.")}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 md:gap-y-5 xl:gap-y-6">
                <div className="md:col-span-2">
                  <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 ml-1">Modelo de Contrato</label>
                  <div className="relative group">
                    <select
                      name="modelo"
                      value={formData.modelo}
                      onChange={handleChange}
                      className={`${inputClass('modelo')} appearance-none`}
                    >
                      <option value="ESOCIAL LAD CONSUL">ESOCIAL LAD CONSUL</option>
                      <option value="ESOCIAL E LAUDO">ESOCIAL E LAUDO</option>
                      <option value="NR01">NR01</option>
                      <option value="NR01 EPP">NR01 EPP</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                  </div>
                </div>

                {isFieldActive('cnpj') && (
                  <div className={!isFieldActive('empresa') ? "md:col-span-2" : ""}>
                    <div className="flex items-center justify-between mb-2 ml-1">
                      <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">CNPJ da Contratante</label>
                      {isSearchingCompany && (
                        <Loader2 className="w-3 h-3 text-brand-primary animate-spin" />
                      )}
                    </div>
                    <input
                      name="cnpj"
                      value={formData.cnpj}
                      onChange={handleChange}
                      placeholder="00.000.000/0000-00"
                      className={inputClass('cnpj')}
                    />
                    {errors.cnpj && (
                      <p className="mt-1 text-[10px] text-red-500 font-bold">{errors.cnpj}</p>
                    )}
                  </div>
                )}

                {isFieldActive('empresa') && (
                  <div className={!isFieldActive('cnpj') ? "md:col-span-2" : ""}>
                    <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 ml-1">Razão Social</label>
                    <input
                      name="empresa"
                      value={formData.empresa}
                      onChange={handleChange}
                      placeholder="Nome da empresa"
                      className={inputClass('empresa')}
                    />
                  </div>
                )}

                {isFieldActive('dono') && (
                  <div className="md:col-span-2">
                    <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 ml-1">Representante Legal</label>
                    <input
                      name="dono"
                      value={formData.dono}
                      onChange={handleChange}
                      placeholder="Nome do sócio"
                      className={inputClass('dono')}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Stage 2: Location & Logistics */}
            {(isFieldActive('endereco') || isFieldActive('cep') || isFieldActive('cidadeEstado') || isFieldActive('qntFuncionario')) && (
              <section className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] p-6 lg:p-7 xl:p-10 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-all text-left">
                {sectionHeader("02", "Endereço", "Local de execução.")}
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-4 md:gap-y-5 xl:gap-y-6">
                  {isFieldActive('endereco') && (
                    <div className={
                      (isFieldActive('cep') || isFieldActive('cidadeEstado') || isFieldActive('qntFuncionario')) 
                        ? "md:col-span-8" 
                        : "md:col-span-12"
                    }>
                      <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 ml-1">Endereço Completo</label>
                      <input
                        name="endereco"
                        value={formData.endereco}
                        onChange={handleChange}
                        placeholder="Logradouro, Nº - Bairro"
                        className={inputClass('endereco')}
                      />
                    </div>
                  )}

                  {isFieldActive('cep') && (
                    <div className="md:col-span-4">
                      <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 ml-1">CEP</label>
                      <input
                        name="cep"
                        value={formData.cep}
                        onChange={handleChange}
                        placeholder="00000-000"
                        className={inputClass('cep')}
                      />
                    </div>
                  )}

                  {isFieldActive('cidadeEstado') && (
                    <div className={isFieldActive('qntFuncionario') ? "md:col-span-8" : "md:col-span-12"}>
                      <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 ml-1">Cidade / UF</label>
                      <input
                        name="cidadeEstado"
                        value={formData.cidadeEstado}
                        onChange={handleChange}
                        placeholder="Cidade - UF"
                        className={inputClass('cidadeEstado')}
                      />
                    </div>
                  )}

                  {isFieldActive('qntFuncionario') && (
                    <div className="md:col-span-4">
                      <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 ml-1">Funcionários</label>
                      <input
                        name="qntFuncionario"
                        value={formData.qntFuncionario}
                        onChange={handleChange}
                        placeholder="Ex: 10"
                        className={inputClass('qntFuncionario')}
                      />
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Stage 3: Commercial Terms */}
            <section className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] p-6 lg:p-7 xl:p-10 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-all text-left">
              {sectionHeader("03", "Financeiro", "Valores e condições.")}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 lg:gap-6 xl:gap-8">
                {/* eSocial Section */}
                {isFieldActive('valorEsocial') && (
                  <div className="space-y-4 md:space-y-6 p-6 md:p-8 lg:p-5 xl:p-8 bg-white dark:bg-slate-900 border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl md:rounded-[32px] shadow-sm transition-colors">
                    <h4 className="text-xs md:text-sm font-black text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 md:pb-4 flex items-center gap-2 transition-colors">
                      <History className="w-4 h-4 text-emerald-500" /> eSocial / Mensal
                    </h4>
                    <div className="flex flex-col gap-4 md:gap-6">
                      <div>
                        <label className="block text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 transition-colors">Valor Total</label>
                        <input
                          name="valorEsocial"
                          type="number"
                          step="0.01"
                          value={formData.valorEsocial}
                          onChange={handleChange}
                          placeholder="R$ 0,00"
                          className={inputClass('valorEsocial')}
                        />
                      </div>
                      {isFieldActive('parcelas') && (
                        <div>
                          <label className="block text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 transition-colors">Parcelamento</label>
                          <div className="relative group">
                            <select
                              name="parcelas"
                              value={formData.parcelas}
                              onChange={handleChange}
                              className={`${inputClass('parcelas')} appearance-none`}
                            >
                              {Array.from({ length: 48 }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n.toString()}>{n}x parcelas</option>
                              ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-slate-600 transition-colors">
                              <ChevronDown className="w-4 h-4 md:w-5 md:h-5" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Laudos Section - ONLY for ESOCIAL E LAUDO model */}
                {isFieldActive('valorLaudo') && (
                  <div className="space-y-4 md:space-y-6 p-6 md:p-8 bg-white dark:bg-slate-900 border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl md:rounded-[32px] shadow-sm transition-colors">
                    <h4 className="text-xs md:text-sm font-black text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 md:pb-4 flex items-center gap-2 transition-colors">
                       <FileStack className="w-4 h-4 text-emerald-500" /> Laudos / Único
                    </h4>
                    <div className="flex flex-col gap-4 md:gap-6">
                      <div>
                        <label className="block text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 transition-colors">Valor do Laudo</label>
                        <input
                          name="valorLaudo"
                          type="number"
                          step="0.01"
                          value={formData.valorLaudo}
                          onChange={handleChange}
                          placeholder="R$ 0,00"
                          className={inputClass('valorLaudo')}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {isFieldActive('vencimento') && (
                  <div className={`space-y-4 md:space-y-6 p-6 md:p-8 bg-white dark:bg-slate-900 border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl md:rounded-[32px] shadow-sm transition-colors ${!isFieldActive('valorLaudo') ? 'md:col-span-2' : ''}`}>
                    <h4 className="text-xs md:text-sm font-black text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 md:pb-4 flex items-center gap-2 transition-colors">
                       <Calendar className="w-4 h-4 text-emerald-500" /> Condições
                    </h4>
                    <div className="flex flex-col gap-4 md:gap-6">
                      <div>
                        <label className="block text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 transition-colors">Dia Vencimento</label>
                        <input
                          name="vencimento"
                          type="text"
                          inputMode="numeric"
                          value={formData.vencimento}
                          onChange={handleChange}
                          placeholder="Ex: 10"
                          className={inputClass('vencimento')}
                        />
                        {errors.vencimento && (
                          <p className="mt-1 text-[10px] text-red-500 font-bold tracking-tight">{errors.vencimento}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {isFieldActive('prazoContrato') && (
                  <div className="md:col-span-2">
                     <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 md:mb-3 ml-1">Vigência (Meses)</label>
                     <div className="relative group">
                       <input
                         name="prazoContrato"
                         type="text"
                         inputMode="numeric"
                         value={formData.prazoContrato}
                         onChange={handleChange}
                         placeholder="Ex: 12"
                         className={inputClass('prazoContrato')}
                       />
                       <div className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                         <span className="text-[10px] md:text-xs font-black text-slate-300 uppercase">Meses</span>
                       </div>
                     </div>
                  </div>
                )}
              </div>
            </section>

            {/* Stage 4: Legal & Finalization */}
            {(isFieldActive('localForo') || isFieldActive('testemunha1') || isFieldActive('testemunha2')) && (
              <section className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-all text-left">
                {sectionHeader("04", "Jurídico", "Validadores finais.")}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12">
                  {isFieldActive('localForo') && (
                    <div className="md:col-span-1">
                      <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 md:mb-3 ml-1">Comarca do Foro</label>
                      <input
                        name="localForo"
                        value={formData.localForo}
                        onChange={handleChange}
                        placeholder="Cidade para resolução de conflitos"
                        className={inputClass('localForo')}
                      />
                    </div>
                  )}

                  <div className="md:col-span-1">
                    <label className="block text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 md:mb-3 ml-1">Data do Contrato (Opcional)</label>
                    <input
                      name="dataContrato"
                      type="date"
                      value={formData.dataContrato}
                      onChange={handleChange}
                      className={inputClass('dataContrato')}
                    />
                  </div>

                  {isFieldActive('testemunha1') && (
                    <div className="space-y-4 md:space-y-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-[10px] md:text-xs ring-1 ring-slate-200 dark:ring-slate-700 transition-colors">A</div>
                        <span className="text-[10px] md:text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest transition-colors">1ª Testemunha</span>
                      </div>
                      <div className="space-y-3 md:space-y-4">
                        <input name="testemunha1" value={formData.testemunha1} readOnly={true} placeholder="Nome Completo" className={inputClass('testemunha1')} />
                        <input name="rg1" value={formData.rg1} readOnly={true} placeholder="RG" className={inputClass('rg1')} />
                      </div>
                    </div>
                  )}

                  {isFieldActive('testemunha2') && (
                    <div className="space-y-4 md:space-y-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-[10px] md:text-xs ring-1 ring-slate-200 dark:ring-slate-700 transition-colors">B</div>
                        <span className="text-[10px] md:text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest transition-colors">2ª Testemunha</span>
                      </div>
                      <div className="space-y-3 md:space-y-4">
                        <input name="testemunha2" value={formData.testemunha2} readOnly={true} placeholder="Nome Completo" className={inputClass('testemunha2')} />
                        <input name="rg2" value={formData.rg2} readOnly={true} placeholder="RG" className={inputClass('rg2')} />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Right Sidebar: Real-time Operational Pulse */}
          <aside className="w-full lg:w-[350px] xl:w-[400px] lg:sticky lg:top-32 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[40px] border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm p-6 lg:p-6 xl:p-8 flex flex-col transition-all">
              
              <div className="mb-6 lg:mb-8 xl:mb-10 text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 lg:w-16 lg:h-16 xl:w-20 xl:h-20 bg-emerald-500/5 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6 ring-1 ring-emerald-500/10 transition-colors">
                   <FileText className="w-8 h-8 md:w-10 md:h-10 lg:w-8 lg:h-8 xl:w-10 xl:h-10 text-emerald-500" />
                </div>
                <h3 className="text-xl md:text-2xl lg:text-xl xl:text-2xl font-black text-slate-900 dark:text-white mb-2 transition-colors tracking-tight">Resumo Operacional</h3>
                <p className="text-slate-400 dark:text-slate-500 text-[10px] md:text-sm lg:text-xs xl:text-sm font-medium tracking-tight transition-colors">Revisão em tempo real do documento</p>
              </div>

              <div className="flex-1 space-y-2">
                <div className="p-4 md:p-6 lg:p-4 xl:p-6 bg-slate-50/50 dark:bg-slate-950/50 rounded-2xl md:rounded-3xl border border-slate-100/50 dark:border-slate-800/50 transition-colors">
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 transition-colors">Configuração</p>
                  
                  <div className="space-y-3 md:space-y-4">
                    <div className="flex justify-between items-start">
                      <p className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400">Modelo</p>
                      <p className="text-[10px] md:text-xs font-black text-slate-900 dark:text-white text-right max-w-[150px] transition-colors">{formData.modelo.replace('CONTRATO - ', '')}</p>
                    </div>
                    {isFieldActive('empresa') && (
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400">Empresa</p>
                        <p className="text-[10px] md:text-xs font-black text-slate-900 dark:text-white text-right truncate max-w-[150px] transition-colors">{formData.empresa || '---'}</p>
                      </div>
                    )}
                    {isFieldActive('dono') && (
                      <div className="flex justify-between items-start">
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400">Titular</p>
                        <p className="text-[10px] md:text-xs font-black text-slate-900 dark:text-white text-right truncate max-w-[150px] transition-colors">{formData.dono || '---'}</p>
                      </div>
                    )}
                  </div>

                  <div className="h-[1px] bg-slate-200/50 dark:bg-slate-800 my-4 md:my-6 transition-colors" />

                  <div className="space-y-4 md:space-y-5">
                    {isFieldActive('valorEsocial') && (
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Valor:</p>
                          <p className="text-sm md:text-lg font-black text-slate-900 dark:text-white transition-colors">
                            {(parseFloat(formData.valorEsocial) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                        {isFieldActive('parcelas') && (
                          <div className="flex flex-col text-right">
                             <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest transition-colors">Parcelas</p>
                             <p className="text-[10px] md:text-sm font-bold text-slate-600 dark:text-slate-400 transition-colors">{formData.parcelas}x</p>
                          </div>
                        )}
                      </div>
                    )}

                    {isFieldActive('valorEsocial') && isFieldActive('parcelas') && (
                      <div className="p-3 md:p-4 bg-emerald-500 text-white rounded-xl md:rounded-2xl shadow-lg shadow-emerald-500/20 flex justify-between items-center">
                        <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em]">Valor/Parcela</span>
                        <span className="text-base md:text-xl font-black">
                          {calculateParcelaValue().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    )}

                    {isFieldActive('valorLaudo') && (
                      <div className="flex justify-between items-center opacity-60">
                        <p className="text-[9px] md:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest transition-colors">Valor do Laudo</p>
                        <p className="text-[10px] md:text-sm font-black text-slate-900 dark:text-white transition-colors">
                          {(parseFloat(formData.valorLaudo) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 md:mt-10 space-y-3 md:space-y-4">
                <button
                  onClick={handleGenerateClick}
                  disabled={isLoading}
                  className="w-full py-4 md:py-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm md:text-lg rounded-2xl md:rounded-[28px] shadow-xl hover:bg-slate-800 dark:hover:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 md:gap-4"
                >
                  {isLoading ? (
                    <><Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> Gerando...</>
                  ) : (
                    <><Download className="w-5 h-5 md:w-6 md:h-6" /> Gerar Contrato</>
                  )}
                </button>

                <button
                  onClick={() => setFormData({
                    modelo: 'NR01', cnpj: '', dono: '', empresa: '', endereco: '', cep: '', cidadeEstado: '',
                    qntFuncionario: '', valorEsocial: '', valorLaudo: '', parcelas: '1', vencimento: '',
                    prazoContrato: '', localForo: '',
                    testemunha1: 'Moisés Alves Silva',
                    testemunha2: 'DAVID ALLAN DE OLIVEIRA SOUZA',
                    rg1: '2165866',
                    rg2: '03914517158',
                    dataContrato: ''
                  })}
                  className="w-full py-2 text-slate-400 dark:text-slate-500 font-bold text-[10px] hover:text-red-500 transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3 h-3 md:w-4 md:h-4" /> Limpar Tudo
                </button>
              </div>

              
            </div>
          </aside>

        </div>
      </main>

      {/* Footer */}
      <footer className="p-8 md:p-16 text-center border-t border-slate-100/50 dark:border-slate-900/50">
        <div className="h-px w-10 md:w-20 bg-emerald-500/20 mx-auto mb-4 md:mb-8" />
        <p className="text-[8px] md:text-[10px] uppercase font-black tracking-[0.2em] md:tracking-[0.4em] text-slate-300 dark:text-slate-700 italic">
          Safe Emission System - BioSegurança ArqMed
        </p>
      </footer>

      {/* Modal de Validação Inteligente */}
      {showValidationModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-slate-950/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[32px] md:rounded-[48px] shadow-2xl border border-amber-500/20 overflow-hidden"
          >
            <div className="p-8 md:p-12 text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-amber-500/20">
                <AlertCircle className="w-8 h-8 md:w-10 md:h-10 text-amber-500" />
              </div>
              
              <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Atenção: campos pendentes</h3>
              <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mb-8">Alguns campos importantes não foram preenchidos:</p>
              
              <div className="flex flex-wrap justify-center gap-2 mb-10">
                {missingFields.map((field, idx) => (
                  <span key={idx} className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-black text-[10px] md:text-xs rounded-full border border-red-100 dark:border-red-900/30 uppercase tracking-wider">
                    {field}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setShowValidationModal(false)}
                  className="px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black text-xs md:text-sm rounded-2xl md:rounded-[24px] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all uppercase tracking-widest"
                >
                  Voltar e Preencher
                </button>
                <button
                  onClick={() => {
                    setShowValidationModal(false);
                    handleGenerate();
                  }}
                  className="px-6 py-4 bg-emerald-500 text-white font-black text-xs md:text-sm rounded-2xl md:rounded-[24px] shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all uppercase tracking-widest"
                >
                  Gerar Mesmo Assim
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}


