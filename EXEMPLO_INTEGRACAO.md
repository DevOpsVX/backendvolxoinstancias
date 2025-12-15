# 🚀 Como Integrar a Função de Navegador Visível no Server.js

Este guia mostra como adicionar a funcionalidade de abrir o navegador Chrome visível para escanear o QR Code do WhatsApp.

## 📋 Arquivos Criados

1. **wppconnect-visible-browser.js** - Módulo com funções para abrir navegador visível
2. **connect-whatsapp-visible.js** - Rotas de API para controlar a conexão visível
3. **EXEMPLO_INTEGRACAO.md** - Este arquivo com instruções

## 🔧 Passo 1: Importar o Módulo no server.js

Adicione esta linha no início do arquivo `server.js`, junto com os outros imports:

```javascript
import { setupVisibleWhatsAppRoute } from './connect-whatsapp-visible.js';
```

## 🔧 Passo 2: Registrar as Rotas

Adicione esta linha após a criação do app Express e antes de iniciar o servidor (procure por `app.listen`):

```javascript
// Configura rotas para WhatsApp com navegador visível
setupVisibleWhatsAppRoute(app);
```

### Exemplo de onde adicionar:

```javascript
// ... outros imports ...
import { setupVisibleWhatsAppRoute } from './connect-whatsapp-visible.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// ... configurações do Supabase ...

// Configura rotas para WhatsApp com navegador visível
setupVisibleWhatsAppRoute(app);

// ... resto das rotas existentes ...

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Servidor rodando na porta \${PORT}\`);
});
```

## 📡 Rotas Disponíveis

Após a integração, você terá acesso a estas rotas:

### 1. Conectar WhatsApp com Navegador Visível
```
POST /api/instances/:id/connect-visible
```

**Exemplo de uso:**
```bash
curl -X POST http://localhost:3000/api/instances/ABC123/connect-visible
```

**Resposta:**
```json
{
  "success": true,
  "message": "Conexão iniciada! O navegador Chrome será aberto em breve.",
  "instanceId": "ABC123"
}
```

### 2. Desconectar Sessão Visível
```
POST /api/instances/:id/disconnect-visible
```

**Exemplo de uso:**
```bash
curl -X POST http://localhost:3000/api/instances/ABC123/disconnect-visible
```

### 3. Listar Sessões Visíveis Ativas
```
GET /api/visible-sessions
```

**Exemplo de uso:**
```bash
curl http://localhost:3000/api/visible-sessions
```

**Resposta:**
```json
{
  "sessions": [
    {
      "instanceId": "ABC123",
      "startedAt": "2025-12-15T14:30:00.000Z",
      "hasClient": true
    }
  ],
  "count": 1
}
```

## 🎨 Integração no Frontend

Adicione um botão no componente `Instance.jsx` para chamar a rota:

```javascript
async function handleConnectVisible() {
  try {
    const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
    const response = await fetch(\`\${API_URL}/api/instances/\${id}/connect-visible\`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Navegador Chrome será aberto! Escaneie o QR Code na janela do navegador.');
    } else {
      alert('Erro: ' + (data.error || 'Erro desconhecido'));
    }
  } catch (err) {
    console.error('Erro ao conectar:', err);
    alert('Erro ao iniciar conexão visível');
  }
}
```

E adicione o botão no JSX:

```jsx
<button 
  onClick={handleConnectVisible}
  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg"
>
  🌐 Conectar com Navegador Visível
</button>
```

## ⚠️ Importante

### Ambiente de Desenvolvimento vs Produção

- **Desenvolvimento Local**: Funciona perfeitamente! O Chrome abrirá na sua máquina.
- **Servidor Remoto (Render, AWS, etc.)**: NÃO funcionará porque servidores não têm interface gráfica.

### Quando Usar

✅ **Use navegador visível quando:**
- Estiver desenvolvendo localmente
- Quiser ver o QR Code diretamente no navegador
- Estiver debugando problemas de conexão
- Quiser uma experiência visual melhor

❌ **NÃO use navegador visível quando:**
- Estiver em produção
- Estiver em servidor sem interface gráfica
- Precisar de múltiplas conexões simultâneas

### Solução Híbrida

Você pode usar ambas as abordagens:
- **Modo headless** (atual) para produção
- **Modo visível** (novo) para desenvolvimento

Basta manter as rotas existentes e adicionar as novas rotas de navegador visível.

## 🧪 Testando

1. Inicie o servidor:
```bash
cd /home/ubuntu/backendvolxoinstancias
node server.js
```

2. Faça uma requisição POST:
```bash
curl -X POST http://localhost:3000/api/instances/SEU_INSTANCE_ID/connect-visible
```

3. O navegador Chrome deve abrir automaticamente com o QR Code do WhatsApp!

4. Escaneie o QR Code com seu celular

5. Aguarde a conexão ser estabelecida

## 🐛 Troubleshooting

### Erro: "Chrome não encontrado"
Execute manualmente:
```bash
npx puppeteer browsers install chrome
```

### Navegador não abre
Verifique se você está em ambiente com interface gráfica (não servidor remoto).

### Sessão já existe
Desconecte a sessão atual primeiro:
```bash
curl -X POST http://localhost:3000/api/instances/SEU_INSTANCE_ID/disconnect-visible
```

## 📝 Logs

O sistema gera logs detalhados com prefixo `[WPP-VISIBLE]` e `[CONNECT-VISIBLE]` para facilitar o debug:

```
[WPP-VISIBLE] 🌐 Iniciando sessão WhatsApp VISÍVEL para instância: ABC123
[WPP-VISIBLE] ⚠️ ATENÇÃO: O navegador Chrome será aberto em uma janela visível!
[WPP-VISIBLE] ✅ QR CODE GERADO! (tentativa 1)
[WPP-VISIBLE] 📱 Escaneie o QR Code na janela do navegador Chrome que foi aberta!
[CONNECT-VISIBLE] ✅ WhatsApp conectado para ABC123!
[CONNECT-VISIBLE] Número obtido: 5511999999999
```

## 🎯 Resumo

1. Importe o módulo no `server.js`
2. Registre as rotas com `setupVisibleWhatsAppRoute(app)`
3. Adicione botão no frontend para chamar `/api/instances/:id/connect-visible`
4. O navegador Chrome abrirá automaticamente com o QR Code
5. Escaneie o QR Code com seu celular
6. Pronto! WhatsApp conectado!

---

**Desenvolvido para facilitar o desenvolvimento e debug de integrações WhatsApp** 🚀
