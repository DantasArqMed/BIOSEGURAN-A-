import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { siteImages } from '../config/siteImages';

export interface BrandingData {
  logoUrl: string;
  logoAlt: string;
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  faviconUrl: string;
}

const DEFAULT_BRANDING: BrandingData = {
  logoUrl: siteImages.logoPrincipal,
  logoAlt: 'Logo BioSegurança ArqMed',
  companyName: 'BioSegurança ArqMed',
  primaryColor: '#16a34a',
  secondaryColor: '#15803d',
  faviconUrl: '/logo-favicon.png?v=2',
};

/**
 * Valida se uma string é uma cor hexadecimal válida.
 */
function isValidHex(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Aplica as cores da marca como variáveis CSS globais.
 */
function applyThemeVariables(branding: BrandingData) {
  const root = document.documentElement;
  root.style.setProperty('--primary-color', branding.primaryColor);
  root.style.setProperty('--secondary-color', branding.secondaryColor);
  
  // Atualiza o favicon se configurado
  if (branding.faviconUrl) {
    const link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (link) link.href = branding.faviconUrl;
  }
}

let cachedBranding: BrandingData | null = null;

/**
 * Busca as configurações de branding no Firestore com cache e aplicação automática de tema.
 */
export async function getBrandingConfig(forceRefresh = false): Promise<BrandingData> {
  if (cachedBranding && !forceRefresh) return cachedBranding;

  try {
    const brandingDoc = await getDoc(doc(db, 'settings', 'branding'));
    
    if (brandingDoc.exists()) {
      const data = brandingDoc.data();
      
      const validatedBranding: BrandingData = {
        logoUrl: '', // Não utilizado mais dinamicamente
        logoAlt: data.logoAlt || data.companyName || DEFAULT_BRANDING.logoAlt,
        companyName: data.companyName || DEFAULT_BRANDING.companyName,
        primaryColor: isValidHex(data.primaryColor) ? data.primaryColor : DEFAULT_BRANDING.primaryColor,
        secondaryColor: isValidHex(data.secondaryColor) ? data.secondaryColor : DEFAULT_BRANDING.secondaryColor,
        faviconUrl: data.faviconUrl || DEFAULT_BRANDING.faviconUrl,
      };

      cachedBranding = validatedBranding;
      applyThemeVariables(validatedBranding);
      return validatedBranding;
    }
  } catch (error) {
    console.error("Erro ao buscar branding:", error);
  }
  
  applyThemeVariables(DEFAULT_BRANDING);
  return DEFAULT_BRANDING;
}
