import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type ActivityAction = 
  | 'LOGIN' 
  | 'GERAR_CONTRATO' 
  | 'EXCLUIR_CONTRATO'
  | 'CRIAR_USUARIO' 
  | 'EDITAR_USUARIO' 
  | 'ALTERAR_STATUS_USUARIO'
  | 'ALTERAR_SENHA_USUARIO'
  | 'FUNCIONARIO_DELETADO_PERMANENTEMENTE'
  | 'ERRO_SISTEMA'
  | 'ERRO_DASHBOARD'
  | 'ERRO_HISTORICO';

interface LogPayload {
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string | null;
  acao: ActivityAction;
  detalhes: string;
  data: string;
}

export const logService = {
  /**
   * Records an activity in the audit trail
   */
  async record(
    userData: { uid: string; nome: string; email: string },
    acao: ActivityAction,
    detalhes: string
  ): Promise<void> {
    try {
      const logData: LogPayload = {
        usuarioId: userData.uid,
        usuarioNome: userData.nome,
        usuarioEmail: userData.email,
        acao,
        detalhes,
        data: new Date().toISOString()
      };

      await addDoc(collection(db, 'logs'), logData);
    } catch (error) {
      console.error('Error recording log:', error);
      // Fail silently to not interrupt the main user action
    }
  }
};
