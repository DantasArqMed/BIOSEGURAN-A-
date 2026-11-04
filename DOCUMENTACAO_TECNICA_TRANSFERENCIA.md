# DOCUMENTAÇÃO TÉCNICA DE TRANSFERÊNCIA – BIOSEGURANÇA ARQMED

**Sistema:** BioSegurança ArqMed – Gestão de Contratos, ASOs e Portais Corporativos  
**Data da Documentação:** Novembro de 2026  
**Finalidade:** Guia completo de arquitetura, infraestrutura, dependências e requisitos de transferência para a nova equipe de desenvolvimento.

---

## 1. INVENTÁRIO DA ARQUITETURA ATUAL

O sistema é construído sobre uma arquitetura moderna Full-Stack em **React + TypeScript + Vite**, com backend **Node.js/Express** em desenvolvimento local e **Serverless Functions** preparadas para implantação na **Vercel**, integrado aos serviços gerenciados do **Google Firebase**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAMADA DE FRONTEND                            │
│           React 19 + TypeScript + Vite + Tailwind CSS v4 + PWA          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
                 ▼                                       ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│     INTEGRAÇÃO DIRETA SDK WEB     │   │      ROTA DE APIS SERVERLESS      │
│         (Firebase Web SDK)        │   │    (Express Local / Vercel API)   │
├───────────────────────────────────┤   ├───────────────────────────────────┤
│ • Auth (Login/Sessão)             │   │ • /api/admin/create-aso-user      │
│ • Firestore (Consultas diretas)   │   │ • /api/admin/delete-user          │
│ • Storage (Download/Upload ASOs)  │   │ • /api/admin/disable-user         │
└─────────────────┬─────────────────┘   │ • /api/admin/update-password      │
                  │                     │ • /api/admin/reset-contracts      │
                  │                     └─────────────────┬─────────────────┘
                  │                                       │
                  │     ┌─────────────────────────────────┘
                  │     │ (Autenticado via Firebase Admin SDK com Service Account)
                  ▼     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SERVIÇOS DE INFRAESTRUTURA FIREBASE                  │
│  • Firebase Auth                                                        │
│  • Cloud Firestore (Database ID: ai-studio-6e4ee6d3-b961-4249-abd6-d7343040c99e)│
│  • Cloud Storage (Bucket: gen-lang-client-0289603031.firebasestorage.app)│
└─────────────────────────────────────────────────────────────────────────┘
```

### Fluxo de Comunicação:
1. **Autenticação Cliente:** O usuário realiza login na tela `/login` usando a SDK do Firebase Web. O token JWT (`idToken`) do Firebase Auth é gerado e mantido no estado global pelo `AuthContext`.
2. **Consultas de Interface:** Operações normais do usuário (listar empresas, buscar contratos, ler ASOs do seu perfil) conectam-se diretamente ao Firestore e Storage utilizando as regras de segurança aplicadas em `firestore.rules` e `storage.rules`.
3. **Operações Sensíveis e Administrativas:** Ações como criação de acessos em massa, alteração de senhas sem saber a senha antiga, desativação de contas e reset de contratos passam por chamadas autenticadas `POST /api/admin/*` enviando o `Bearer <idToken>`. A API valida se o emissor possui privilégios de Administrador no Firestore antes de executar via **Firebase Admin SDK**.

---

## 2. DEPENDÊNCIAS INSTALADAS E FINALIDADE

### A. Dependências de Produção (`dependencies`):

| Pacote | Versão | Finalidade e Uso na Aplicação | Status de Uso |
| :--- | :--- | :--- | :--- |
| `react` | `^19.0.0` | Biblioteca principal de interface declarativa. | **Em Uso** |
| `react-dom` | `^19.0.0` | Renderizador DOM para aplicação React. | **Em Uso** |
| `react-router-dom` | `^7.14.2` | Roteamento cliente (SPA) para gestão das URLs e permissões. | **Em Uso** |
| `firebase` | `^11.3.0` | SDK oficial cliente para conexão com Auth, Firestore e Storage. | **Em Uso** |
| `firebase-admin` | `^13.8.0` | SDK administrativo para rotas backend de criação/exclusão de usuários. | **Em Uso** |
| `express` | `^4.22.1` | Servidor HTTP backend e middleware para APIs em desenvolvimento. | **Em Uso** |
| `docxtemplater` | `^3.68.5` | Preenchimento automatizado de modelos Word (.docx) para geração de contratos. | **Em Uso** |
| `pizzip` | `^3.2.0` | Manipulação de arquivos zip/compressed exigido pelo `docxtemplater`. | **Em Uso** |
| `extenso` | `^2.1.0` | Conversão de valores numéricos e datas para texto por extenso. | **Em Uso** |
| `file-saver` | `^2.0.5` | Disparo de downloads de PDFs e documentos `.docx` no navegador. | **Em Uso** |
| `jspdf` | `^4.2.1` | Geração de PDFs de acesso do cliente com marca e credenciais. | **Em Uso** |
| `qrcode` | `^1.5.4` | Geração de imagem QR Code embutida nos cartões/PDFs de acesso. | **Em Uso** |
| `pdfjs-dist` | `^4.3.136` | Leitura e parsing de texto em arquivos PDF de ASOs enviados. | **Em Uso** |
| `mammoth` | `^1.12.0` | Conversão cliente de arquivos Word para HTML na pré-visualização. | **Em Uso** |
| `html2canvas` | `^1.4.1` | Captura de elementos da interface DOM para renderização de imagem/PDF. | **Em Uso** |
| `lucide-react` | `^0.546.0` | Biblioteca unificada de ícones SVG. | **Em Uso** |
| `motion` | `^12.23.24` | Animações suaves de transição de tela e modais. | **Em Uso** |
| `react-hot-toast` | `^2.6.0` | Notificações do sistema (sucesso, erro, carregando). | **Em Uso** |
| `dotenv` | `^17.2.3` | Leitura de variáveis de ambiente. | **Em Uso** |
| `vite` | `^6.2.0` | Ferramenta de build e bundling rápido. | **Em Uso** |
| `@tailwindcss/vite` | `^4.1.14` | Integração nativa de build Tailwind CSS v4 com Vite. | **Em Uso** |
| `@vitejs/plugin-react`| `^5.0.4` | Plugin oficial React para compilação Vite. | **Em Uso** |
| `vite-plugin-pwa` | `^1.3.0` | Suporte e geração de PWA (Progressive Web App) e Service Worker. | **Em Uso** |
| `@google/genai` | `^1.29.0` | SDK do Gemini AI (instalado no ambiente de prototipagem). | Opcional (Sem uso ativo no fluxo principal) |

### B. Dependências de Desenvolvimento (`devDependencies`):
* `@types/express`, `@types/file-saver`, `@types/node`, `@types/qrcode`, `@vercel/node`, `typescript`, `tsx`, `tailwindcss`, `autoprefixer`.

---

## 3. INTEGRAÇÕES EXTERNAS E APIS

1. **BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`)**
   * **Função:** Consulta gratuita e instantânea de dados da Receita Federal (Razão Social, Nome Fantasia, QSA/Sócio responsável, Endereço, Bairro, CEP, Cidade e Estado).
   * **Uso:** Implementado em `src/services/companyService.ts`. É disparado automaticamente durante o preenchimento de contrato ou importação de ASO ao inserir o CNPJ.
2. **CDN Public Cloudflare / cdnjs (`https://cdnjs.cloudflare.com/...`)**
   * **Função:** Carregamento do worker assíncrono do PDF.js para extração de texto sem sobrecarregar a thread principal.
3. **Google Firebase Platform (`gen-lang-client-0289603031`)**
   * Autenticação, Banco de Dados Relacional/Documental e Armazenamento em Nuvem.

---

## 4. ESTRUTURA DO FIREBASE

### A. Firebase Authentication
* Suporta login via **E-mail / Senha**.
* Usuários de empresas e funcionários do ASO possuem e-mails sintéticos corporativos vinculados ao seus CNPJs/CPFs:
  * Empresa: `{CNPJ_LIMPO}@empresa.arqmed.local`
  * Funcionário ASO: `{CPF_LIMPO}@funcionario.arqmed.local`

### B. Cloud Firestore (Coleções e Estrutura)
* `users/{userId}`: Perfil completo do usuário (tipo: `admin`, `empresa`, `funcionario`, `aso_funcionario`).
* `companies/{cnpj}`: Cadastro de empresas parceiras/clientes.
* `companies/{cnpj}/asos/{asoId}`: ASOs pertencentes à empresa.
* `companies/{cnpj}/funcionarios/{cpf}`: Vínculo dos trabalhadores com a empresa.
* `asoDocuments/{docId}`: Índice global de ASOs para busca e consulta instantânea por CPF.
* `contracts/{contractId}`: Histórico de contratos gerados no sistema.
* `logs/{logId}`: Trilha de auditoria das ações (logins, exclusões, alterações).
* `settings/branding`: Configurações visuais do sistema (cores, logos).

### C. Cloud Storage (Pastas de Armazenamento)
* `contracts/{userId}/{fileName}`: PDFs de contratos gerados.
* `companies/{cnpj}/asos/{cpf}/{fileName}`: PDFs de ASOs vinculados a empresas e trabalhadores.
* `access_pdfs/{tipo}/{login}.pdf`: Cartões de acesso em PDF com QR Code gerados para clientes.
* `img/*`: Imagens e logotipos institucionais.

---

## 5. VARIÁVEIS DE AMBIENTE NECESSÁRIAS

Copiar o arquivo `.env.example` para `.env` no ambiente de desenvolvimento ou configurar no painel da Vercel:

```env
# URL base de hospedagem da aplicação
APP_URL="https://app.biosegurancaarqmed.com.br"

# Credenciais do Firebase Admin SDK para funções backend e Serverless da Vercel
FIREBASE_PROJECT_ID="gen-lang-client-0289603031"
FIREBASE_CLIENT_EMAIL="seu-service-account@gen-lang-client-0289603031.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n"

# Opcional (Se houver chamadas de IA ativas)
GEMINI_API_KEY=""
```

---

## 6. ROTAS ADMINISTRATIVAS DA API (BACKEND)

Todas as rotas estão localizadas no diretório `/api/admin/` e espelhadas em `server.ts`:

1. `POST /api/admin/create-aso-user`:
   * **Função:** Cria ou redefine a senha de um usuário no Firebase Auth e sincroniza seu perfil no Firestore com privilégios restritos.
2. `POST /api/admin/delete-user`:
   * **Função:** Exclui permanentemente o usuário do Auth e realiza expurgo redundante no Firestore de seus perfis e índices. Impede auto-exclusão e protege funcionários internos.
3. `POST /api/admin/disable-user`:
   * **Função:** Altera o status do funcionário no Auth (`disabled`) e atualiza o estado para `'inativo'` ou `'ativo'` no Firestore.
4. `POST /api/admin/update-password`:
   * **Função:** Altera a senha do usuário indicado de forma administrativa.
5. `POST /api/admin/reset-contracts`:
   * **Função:** Exclui em lote todos os contratos do Firestore e remove os respectivos arquivos do Storage.

---

## 7. NÍVEIS DE ACESSO E PERFIS DE USUÁRIO

1. **Administrador (`tipo: 'admin'`)**:
   * Acesso total a todas as funções, relatórios, usuários, geração de contratos e exclusões.
2. **Funcionário Interno ArqMed (`tipo: 'funcionario'`)**:
   * Acesso à geração de contratos, histórico e cadastro de empresas.
   * Restrição de visualização de contratos por filial/área (`verContratos`: `'Campo Grande'`, `'Rondonópolis'` ou `'Todos'`).
3. **Cliente Empresa (`tipo: 'empresa'`)**:
   * Acesso restrito ao **Portal da Empresa** (`/empresa/asos`), onde visualiza apenas ASOs dos seus colaboradores.
4. **Trabalhador ASO (`tipo: 'aso_funcionario' | role: 'aso_viewer'`)**:
   * Acesso restrito ao **Portal do Trabalhador** (`/meus-asos`), onde visualiza apenas seus próprios ASOs. Totalmente bloqueado de visualizar contratos corporativos.

---

## 8. COMO EXECUTAR O PROJETO LOCALMENTE

1. Certifique-se de ter o **Node.js** (v18 ou superior) instalado.
2. Clone o repositório e instale as dependências:
   ```bash
   npm install
   ```
3. Garanta que o arquivo `firebase-applet-config.json` esteja na raiz do projeto.
4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
5. Acesse no navegador: `http://localhost:3000`.

---

## 9. REQUISITOS PARA NOVO DEPLOY NA VERCEL

1. Importar o repositório GitHub no painel da Vercel (`https://vercel.com`).
2. Configurações de Build:
   * **Framework Preset:** Vite
   * **Build Command:** `npm run build`
   * **Output Directory:** `dist`
3. Cadastrar as Variáveis de Ambiente no painel Vercel:
   * `FIREBASE_PROJECT_ID`
   * `FIREBASE_CLIENT_EMAIL`
   * `FIREBASE_PRIVATE_KEY`
   * `APP_URL`
4. O arquivo `vercel.json` na raiz gerenciará automaticamente as rotas da SPA e as Serverless Functions da pasta `/api/admin/`.

---

## 10. ARQUIVOS QUE NÃO DEVEM SER ALTERADOS NA TRANSIÇÃO

* `/firebase-applet-config.json`: Contém os identificadores técnicos ativos do projeto Firebase.
* `/firestore.rules`: Contém as regras de segurança e isolamento do banco.
* `/storage.rules`: Contém as permissões de upload/download de PDFs do Storage.
* `/firebase-blueprint.json`: Modelo de entidades das coleções.
* `/src/utils/userClassification.ts`: Motor de classificação de permissões de usuários.
* `/public/templates/*.docx`: Arquivos de modelo para geração de contratos Word.

---

## 11. MATRIZ DE RESPONSABILIDADES DA TRANSIÇÃO

### A. INFORMAÇÕES TÉCNICAS VERIFICADAS E ENTREGUES NO REPOSITÓRIO:
- [x] Código-fonte completo em React + TypeScript.
- [x] Configuração de build Vite e Tailwind CSS v4.
- [x] Regras de segurança do Firestore e Storage (`firestore.rules` e `storage.rules`).
- [x] Endpoints e lógica de backend Serverless (`/api/admin/` e `server.ts`).
- [x] Modelos de contratos `.docx` em `/public/templates/`.
- [x] Arquivo de configuração cliente do Firebase (`firebase-applet-config.json`).

### B. INFORMAÇÕES QUE PRECISAM SER FORNECIDAS PELO PROPRIETÁRIO/ADMINISTRADOR ATUAL:
- [ ] Transferência de propriedade ou acesso de Administrador ao projeto **Google Cloud / Firebase Console** (`gen-lang-client-0289603031`).
- [ ] Arquivo JSON de Chave de Serviço (Service Account Key) do Firebase Admin SDK para geração da `FIREBASE_PRIVATE_KEY` no servidor de produção.
- [ ] Acesso à conta de hospedagem **Vercel** ou apontamento de DNS no **Registro.br / Cloudflare** para o domínio `biosegurancaarqmed.com.br`.
- [ ] Confirmação da lista final de e-mails dos administradores que permanecerão na chave `allowedAdmins` das regras de segurança.
