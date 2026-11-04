import { auth } from '../lib/firebase';

export type UserType = 'empresa' | 'funcionario' | 'aso_funcionario' | 'admin';

interface AutoCreateUserResult {
  created: boolean;
  existed: boolean;
  recreated?: boolean;
  email: string;
  error?: string;
  statusLabel?: string;
}

export const userService = {
  async autoCreateUser(
    identifier: string, // CNPJ ou CPF limpo
    name: string,
    type: string,
    empresaId?: string,
    empresaNome?: string
  ): Promise<AutoCreateUserResult> {
    const cleanId = identifier.replace(/\D/g, '');
    const domain = type === 'empresa' ? 'empresa.arqmed.local' : 'funcionario.arqmed.local';
    const email = `${cleanId}@${domain}`;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Você precisa estar logado para realizar esta operação.');
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/admin/create-aso-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          tipo: type,
          cpfOuCnpj: cleanId,
          nome: name,
          empresaId,
          empresaNome
        })
      });

      const text = await response.text();
      const result = text ? JSON.parse(text) : {};

      if (!response.ok) {
        console.error("API_ERROR_BODY:", result);
        throw new Error(result.error || result.message || `Erro HTTP ${response.status}`);
      }

      console.log("AUTO_USER_SUCCESS_FROM_API:", result);
      
      const statusLabelMap: Record<string, string> = {
        'criado': '✅ Acesso criado',
        'senha_redefinida': '✅ Acesso já existente',
        'existed': '✅ Acesso já existente'
      };

      console.log("AUTO_USER_STATUS_LABEL:", statusLabelMap[result.status] || result.status);

      return {
        created: result.status === 'criado',
        existed: result.status === 'existed' || result.status === 'senha_redefinida',
        recreated: result.status === 'senha_redefinida',
        email: result.email,
        statusLabel: statusLabelMap[result.status]
      };
    } catch (error: any) {
      console.error(`AUTO_USER_CREATE_FAILED:`, error);
      return { 
        created: false, 
        existed: false, 
        email, 
        error: error.message || 'Erro inesperado na API' 
      };
    }
  }
};
