# 🌐 Integração WhatsApp com Navegador Visível

Esta implementação permite abrir o navegador Chrome em modo **visível** (não headless) para escanear o QR Code do WhatsApp Web diretamente na tela do navegador.

## 📦 Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `wppconnect-visible-browser.js` | Módulo principal com funções para abrir navegador visível |
| `connect-whatsapp-visible.js` | Rotas de API Express para controlar conexões visíveis |
| `test-visible-browser.js` | Script standalone para testar a funcionalidade |
| `EXEMPLO_INTEGRACAO.md` | Guia detalhado de integração no server.js |
| `README_NAVEGADOR_VISIVEL.md` | Este arquivo |

## 🚀 Início Rápido

### Opção 1: Teste Standalone (Recomendado para Primeiro Teste)

Execute o script de teste sem modificar nada:

```bash
cd /home/ubuntu/backendvolxoinstancias
node test-visible-browser.js minha-instancia-teste
```

O navegador Chrome abrirá automaticamente com o QR Code do WhatsApp. Escaneie com seu celular!

### Opção 2: Integração Completa no Server.js

1. **Adicione o import no início do `server.js`:**

```javascript
import { setupVisibleWhatsAppRoute } from './connect-whatsapp-visible.js';
```

2. **Registre as rotas após criar o app Express:**

```javascript
// Configura rotas para WhatsApp com navegador visível
setupVisibleWhatsAppRoute(app);
```

3. **Inicie o servidor:**

```bash
node server.js
```

4. **Faça uma requisição POST:**

```bash
curl -X POST http://localhost:3000/api/instances/SEU_INSTANCE_ID/connect-visible
```

## 🎯 Como Funciona

### Fluxo de Funcionamento

```
┌─────────────────┐
│  Usuário clica  │
│  no botão       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  POST /api/instances/:id/       │
│  connect-visible                │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Puppeteer abre Chrome          │
│  em modo VISÍVEL (headless:false)│
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  WPPConnect acessa WhatsApp Web │
│  e gera QR Code                 │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  QR Code aparece na janela      │
│  do navegador Chrome            │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Usuário escaneia com celular   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  WhatsApp conectado!            │
│  Número salvo no Supabase       │
└─────────────────────────────────┘
```

### Diferença entre Modo Headless e Visível

| Característica | Modo Headless (Atual) | Modo Visível (Novo) |
|----------------|----------------------|---------------------|
| Navegador visível | ❌ Não | ✅ Sim |
| QR Code na tela | ❌ Não | ✅ Sim |
| Funciona em servidor | ✅ Sim | ❌ Não |
| Funciona localmente | ✅ Sim | ✅ Sim |
| Ideal para debug | ⚠️ Médio | ✅ Excelente |
| Produção | ✅ Sim | ❌ Não |

## 📡 API Endpoints

### 1. Conectar WhatsApp (Navegador Visível)

**Endpoint:** `POST /api/instances/:id/connect-visible`

**Descrição:** Inicia uma sessão WhatsApp abrindo o navegador Chrome visível.

**Exemplo:**
```bash
curl -X POST http://localhost:3000/api/instances/ABC123/connect-visible
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "Conexão iniciada! O navegador Chrome será aberto em breve.",
  "instanceId": "ABC123"
}
```

**Resposta de Erro (Sessão já existe):**
```json
{
  "error": "Sessão já está ativa para esta instância",
  "message": "Feche a sessão atual antes de iniciar uma nova"
}
```

### 2. Desconectar Sessão Visível

**Endpoint:** `POST /api/instances/:id/disconnect-visible`

**Descrição:** Fecha a sessão WhatsApp visível e limpa os dados.

**Exemplo:**
```bash
curl -X POST http://localhost:3000/api/instances/ABC123/disconnect-visible
```

**Resposta:**
```json
{
  "success": true,
  "message": "Sessão visível desconectada com sucesso"
}
```

### 3. Listar Sessões Visíveis Ativas

**Endpoint:** `GET /api/visible-sessions`

**Descrição:** Retorna lista de todas as sessões visíveis ativas.

**Exemplo:**
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
    },
    {
      "instanceId": "XYZ789",
      "startedAt": "2025-12-15T14:35:00.000Z",
      "hasClient": true
    }
  ],
  "count": 2
}
```

## 🎨 Integração no Frontend (React)

### Adicionar Função no Componente

```javascript
// src/ui/Instance.jsx

async function handleConnectVisible() {
  try {
    setIsConnecting(true);
    
    const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
    const response = await fetch(`${API_URL}/api/instances/${id}/connect-visible`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('✅ ' + data.message);
      console.log('Navegador Chrome abrindo...');
    } else {
      alert('❌ Erro: ' + (data.error || 'Erro desconhecido'));
      setIsConnecting(false);
    }
  } catch (err) {
    console.error('Erro ao conectar:', err);
    alert('❌ Erro ao iniciar conexão visível');
    setIsConnecting(false);
  }
}
```

### Adicionar Botão na Interface

```jsx
{/* Botão para conectar com navegador visível */}
<button 
  onClick={handleConnectVisible}
  disabled={isConnecting || status === 'connected'}
  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-6 py-3 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
>
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
  {isConnecting ? 'Abrindo navegador...' : '🌐 Conectar com Navegador Visível'}
</button>
```

## ⚙️ Configuração

### Variáveis de Ambiente

As mesmas variáveis do sistema atual são utilizadas:

```env
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-chave-aqui

# Puppeteer (opcional)
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
```

### Instalação de Dependências

Todas as dependências já estão instaladas no projeto:

- `@wppconnect-team/wppconnect`
- `puppeteer`
- `express`
- `@supabase/supabase-js`

## 🐛 Troubleshooting

### Problema: Navegador não abre

**Causa:** Você está em um servidor remoto sem interface gráfica.

**Solução:** Use esta funcionalidade apenas em ambiente local de desenvolvimento.

### Problema: "Chrome não encontrado"

**Causa:** Chromium não está instalado.

**Solução:**
```bash
npx puppeteer browsers install chrome
```

### Problema: "Sessão já está ativa"

**Causa:** Já existe uma sessão visível para esta instância.

**Solução:** Desconecte a sessão atual primeiro:
```bash
curl -X POST http://localhost:3000/api/instances/SEU_ID/disconnect-visible
```

### Problema: QR Code não aparece

**Causa:** Pode demorar alguns segundos para carregar.

**Solução:** Aguarde até 30 segundos. Verifique os logs no terminal.

### Problema: "Error: Failed to launch the browser process"

**Causa:** Faltam dependências do sistema no Linux.

**Solução (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2
```

## 📊 Logs e Debug

### Logs do Sistema

O sistema gera logs detalhados com prefixos específicos:

```
[WPP-VISIBLE] - Logs do módulo de navegador visível
[CONNECT-VISIBLE] - Logs das rotas de API
```

### Exemplo de Logs de Sucesso

```
[WPP-VISIBLE] 🌐 Iniciando sessão WhatsApp VISÍVEL para instância: ABC123
[WPP-VISIBLE] ⚠️ ATENÇÃO: O navegador Chrome será aberto em uma janela visível!
[WPP-VISIBLE] 📁 Usando cache Puppeteer em: /opt/render/.cache/puppeteer
[WPP-VISIBLE] 🔍 Tentando resolver executablePath via puppeteer.executablePath()...
[WPP-VISIBLE] ✅ Chromium já existe em: /opt/render/.cache/puppeteer/chrome/...
[WPP-VISIBLE] Criando cliente WPPConnect com navegador VISÍVEL...
[WPP-VISIBLE] ✅ QR CODE GERADO! (tentativa 1)
[WPP-VISIBLE] 📱 Escaneie o QR Code na janela do navegador Chrome que foi aberta!
[CONNECT-VISIBLE] ✅ QR CODE GERADO para ABC123!
[WPP-VISIBLE] Status da sessão ABC123: inChat
[WPP-VISIBLE] ✅ WhatsApp conectado com sucesso!
[CONNECT-VISIBLE] ✅ WhatsApp conectado para ABC123!
[CONNECT-VISIBLE] Número obtido: 5511999999999
[CONNECT-VISIBLE] ✅ Número salvo no banco: 5511999999999
```

## ⚠️ Limitações e Considerações

### ✅ Funciona em:
- Desenvolvimento local (Windows, macOS, Linux com interface gráfica)
- Máquinas virtuais com interface gráfica
- WSL2 com WSLg (Windows 11)

### ❌ NÃO funciona em:
- Servidores remotos (Render, Heroku, AWS EC2, etc.)
- Ambientes Docker sem display
- CI/CD pipelines
- Ambientes headless

### 🔒 Segurança

- As sessões visíveis são armazenadas apenas em memória (Map)
- Não há persistência de sessões visíveis no banco de dados
- Cada instância pode ter apenas uma sessão visível por vez
- Ao fechar o servidor, todas as sessões visíveis são perdidas

### 🎯 Casos de Uso Recomendados

✅ **Recomendado:**
- Debug de problemas de conexão WhatsApp
- Desenvolvimento local de novas features
- Demonstrações ao vivo para clientes
- Testes de integração manual

❌ **Não Recomendado:**
- Produção
- Servidores remotos
- Automação em larga escala
- Ambientes sem supervisão

## 🔄 Migração do Modo Headless para Visível

Se você quiser substituir completamente o modo headless pelo visível (não recomendado para produção):

1. Substitua os imports em `server.js`:
```javascript
// Antes
import { startWhatsAppSession, closeWhatsAppSession, getPhoneNumber } from './wppconnect-session.js';

// Depois
import { 
  startWhatsAppSessionVisible as startWhatsAppSession, 
  closeWhatsAppSessionVisible as closeWhatsAppSession, 
  getPhoneNumberVisible as getPhoneNumber 
} from './wppconnect-visible-browser.js';
```

2. Não é necessário alterar mais nada! As funções têm a mesma assinatura.

## 📚 Recursos Adicionais

### Documentação Relacionada

- [WPPConnect Documentation](https://wppconnect.io/)
- [Puppeteer Documentation](https://pptr.dev/)
- [WhatsApp Web.js](https://wwebjs.dev/)

### Scripts Úteis

**Verificar sessões ativas:**
```bash
curl http://localhost:3000/api/visible-sessions | jq
```

**Conectar instância específica:**
```bash
curl -X POST http://localhost:3000/api/instances/ABC123/connect-visible
```

**Desconectar todas as sessões visíveis:**
```bash
# Primeiro, liste as sessões
curl http://localhost:3000/api/visible-sessions | jq -r '.sessions[].instanceId' | while read id; do
  echo "Desconectando $id..."
  curl -X POST "http://localhost:3000/api/instances/$id/disconnect-visible"
done
```

## 🤝 Contribuindo

Se você encontrar bugs ou tiver sugestões de melhorias:

1. Documente o problema com logs completos
2. Descreva o comportamento esperado vs atual
3. Informe o ambiente (SO, versão do Node, etc.)

## 📝 Changelog

### v1.0.0 (2025-12-15)
- ✨ Implementação inicial
- ✅ Suporte para navegador visível
- ✅ Rotas de API completas
- ✅ Script de teste standalone
- ✅ Documentação completa

## 📄 Licença

Este código segue a mesma licença do projeto principal.

---

**Desenvolvido com ❤️ para facilitar o desenvolvimento e debug de integrações WhatsApp**

🚀 **Bom desenvolvimento!**
