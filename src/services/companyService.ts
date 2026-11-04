import { doc, getDoc, setDoc, deleteDoc, Timestamp, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface CompanyData {
  cnpj: string;
  cnpjFormatado: string;
  nome: string;
  responsavel: string;
  endereco: string;
  cep: string;
  cidadeEstado: string;
  qntFuncionarios: string;
  prazoContratoPadrao: string;
  localForoPadrao: string;
  createdAt?: string;
  updatedAt?: string;
  lastApiSyncAt?: string;
  bairro?: string;
  numero?: string;
  cidade?: string;
  estado?: string;
  source?: 'database' | 'api' | 'cache-stale';
}

export const companyService = {
  /**
   * Normalizes CNPJ by removing dots, slashes and dashes
   */
  normalizeCNPJ(cnpj: string): string {
    return cnpj.replace(/\D/g, '');
  },

  /**
   * Fetches a company from Firestore using its normalized CNPJ as ID
   */
  async getByCNPJ(cnpj: string): Promise<CompanyData | null> {
    const id = this.normalizeCNPJ(cnpj);
    if (!id || id.length < 14) return null;

    try {
      const docRef = doc(db, 'companies', id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as CompanyData;
        
        // 30 days in MS
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const lastSync = data.lastApiSyncAt ? new Date(data.lastApiSyncAt).getTime() : 
                        data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
        
        const isStale = (Date.now() - lastSync) > thirtyDaysMs;

        return { 
          ...data, 
          source: isStale ? 'cache-stale' : 'database' 
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching company:', error);
      return null;
    }
  },

  /**
   * Fetches company data from BrasilAPI
   */
  async fetchFromBrasilAPI(cnpj: string): Promise<CompanyData | null> {
    const id = this.normalizeCNPJ(cnpj);
    if (!id || id.length < 14) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${id}`, {
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`BrasilAPI error: ${response.status}`);
      }

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        console.error('Error parsing JSON from BrasilAPI:', e);
        return null;
      }

      if (!data) return null;
      
      // Try to find a representative (Sócio-Administrador or similar)
      const priorityQualificacoes = [
        'administrador',
        'sócio-administrador',
        'titular',
        'empresário',
        'diretor',
        'presidente'
      ];

      let responsavel = '';
      if (data.qsa && data.qsa.length > 0) {
        for (const qualif of priorityQualificacoes) {
          const found = data.qsa.find((s: any) => 
            s.qualificacao_socio?.toLowerCase() === qualif.toLowerCase() ||
            s.qualificacao_socio?.toLowerCase().includes(qualif.toLowerCase())
          );
          if (found) {
            responsavel = found.nome_socio || '';
            break;
          }
        }
        
        if (!responsavel) {
          responsavel = data.qsa[0].nome_socio || '';
        }
      }

      const mountedAddress = data.numero 
        ? `${data.logradouro || ''}, ${data.numero}${data.bairro ? ` - ${data.bairro}` : ''}`
        : `${data.logradouro || ''}${data.bairro ? ` - ${data.bairro}` : ''}`;

      console.log(`[CNPJ Lookup] Endereço completo montado: ${mountedAddress}`);
      console.log(`[CNPJ Lookup] Representante selecionado: ${responsavel}`);

      const companyData: CompanyData = {
        cnpj: id,
        cnpjFormatado: `${id.slice(0, 2)}.${id.slice(2, 5)}.${id.slice(5, 8)}/${id.slice(8, 12)}-${id.slice(12, 14)}`,
        nome: data.razao_social || data.nome_fantasia || '',
        responsavel: responsavel,
        endereco: mountedAddress,
        numero: data.numero || '',
        bairro: data.bairro || '',
        cep: data.cep || '',
        cidade: data.municipio || '',
        estado: data.uf || '',
        cidadeEstado: `${data.municipio || ''}-${data.uf || ''}`,
        qntFuncionarios: '',
        prazoContratoPadrao: '12',
        localForoPadrao: data.municipio || '',
        source: 'api',
        lastApiSyncAt: new Date().toISOString()
      };

      return companyData;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('BrasilAPI lookup timed out');
      } else {
        console.error('Error fetching from BrasilAPI:', error);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /**
   * Deletes a company record from Firestore
   */
  async delete(cnpj: string): Promise<void> {
    const id = this.normalizeCNPJ(cnpj);
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'companies', id));
    } catch (error) {
      console.error('Error deleting company:', error);
      throw error;
    }
  },

  /**
   * Complete CNPJ lookup logic: Firestore -> BrasilAPI -> Save
   */
  async lookupCNPJ(cnpj: string): Promise<CompanyData | null> {
    const id = this.normalizeCNPJ(cnpj);
    if (!id || id.length < 14) return null;

    // 1. Check database
    const local = await this.getByCNPJ(id);
    if (local) return local;

    // 2. Fetch from API
    const remote = await this.fetchFromBrasilAPI(id);
    if (remote) {
      // 3. Save to database for future use
      try {
        await this.upsert(remote);
      } catch (e) {
        console.warn('Could not save API result to database:', e);
      }
      return remote;
    }

    return null;
  },

  /**
   * Fetches all companies from Firestore
   */
  async getAll(): Promise<CompanyData[]> {
    try {
      const companiesRef = collection(db, 'companies');
      const q = query(companiesRef, orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data() } as CompanyData));
    } catch (error) {
      console.error('Error fetching all companies:', error);
      return [];
    }
  },

  /**
   * Creates or updates a company record in Firestore
   */
  async upsert(data: Omit<CompanyData, 'createdAt' | 'updatedAt'>): Promise<void> {
    const id = this.normalizeCNPJ(data.cnpj);
    if (!id || id.length < 14) return;

    try {
      const docRef = doc(db, 'companies', id);
      const now = new Date().toISOString();
      
      const companyRecord = {
        ...data,
        cnpj: id, // Ensure id is clean
        updatedAt: now
      };

      // Check if it exists to preserve createdAt
      const existing = await this.getByCNPJ(id);
      if (!existing) {
        (companyRecord as any).createdAt = now;
      }

      await setDoc(docRef, companyRecord, { merge: true });
    } catch (error) {
      console.error('Error saving company:', error);
      throw error;
    }
  }
};
