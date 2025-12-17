# Integração VolxoWPP com GoHighLevel

## 🎯 Visão Geral

Esta atualização implementa a integração completa entre VolxoWPP e GoHighLevel como **Custom Conversation Provider**.

## 📋 Arquivos Adicionados

1. **`ghl-integration.js`** - Funções de integração com GHL API
2. **`migration_add_location.sql`** - Script SQL para atualizar banco de dados
3. **`.env.adicional`** - Variáveis de ambiente adicionais necessárias

## 🚀 Implementação Rápida

### 1. Configure o GHL Marketplace (10 min)

1. Acesse https://marketplace.gohighlevel.com
2. Vá em: **Build > Modules > Conversation Providers**
3. Crie novo provider:
   - Name: **VolxoWPP**
   - Type: **SMS**
   - Delivery URL: **https://volxowppconect.onrender.com/ghl/outbound**
   - ✅ Marque: **"Is this a Custom Conversation Provider"**
   - ✅ Marque: **"Always show this Conversation Provider"**
4. Copie o **Provider ID** gerado

### 2. Atualize o Banco de Dados (2 min)

Execute o script `migration_add_location.sql` no Supabase:

```sql
ALTER TABLE public.installations 
ADD COLUMN IF NOT EXISTS location_id text;

CREATE INDEX IF NOT EXISTS idx_installations_location_id 
ON public.installations(location_id);
```

### 3. Configure Variáveis de Ambiente (2 min)

Adicione no Render (ou .env):

```env
GHL_CONVERSATION_PROVIDER_ID=[Provider ID copiado do Marketplace]
```

### 4. Deploy (5 min)

O deploy será automático após o push para o GitHub.

### 5. Teste (5 min)

1. Instale o app em uma sub-account do GHL
2. Vá em: **Settings > Conversation Providers**
3. Verifique se **VolxoWPP** aparece
4. Conecte WhatsApp e teste mensagens

## 🔧 O Que Foi Implementado

### Webhook para Mensagens Outbound (GHL → WhatsApp)

Nova rota: `POST /ghl/outbound`

Recebe mensagens do GHL e envia via WhatsApp.

### Listener de Mensagens Inbound (WhatsApp → GHL)

Captura mensagens do WhatsApp e envia para GHL via API.

### Gerenciamento de Contatos

Busca ou cria contatos automaticamente no GHL.

### Atualização de Status

Atualiza status de mensagens no GHL (delivered, read, etc.).

## 📊 Fluxo de Dados

**WhatsApp → GHL:**
```
WhatsApp → WPPConnect → Backend → GHL API → GHL Conversations
```

**GHL → WhatsApp:**
```
GHL Conversations → Webhook → Backend → WPPConnect → WhatsApp
```

## ⚠️ Importante

1. **Provider ID é obrigatório** - Sem ele, mensagens não funcionarão
2. **Location ID é crítico** - Salvo automaticamente durante OAuth
3. **Scopes já estão corretos** - Não precisa alterar

## 🔍 Troubleshooting

### Provider não aparece no GHL
- Verifique se marcou "Is this a Custom Conversation Provider"
- Reinstale o app na sub-account

### Mensagens não chegam
- Verifique se `GHL_CONVERSATION_PROVIDER_ID` está configurado
- Verifique logs do backend
- Verifique se WhatsApp está conectado

## 📚 Documentação

Para documentação completa, consulte:
- Documentação oficial GHL: https://marketplace.gohighlevel.com/docs/marketplace-modules/ConversationProviders/

## ✅ Checklist

- [ ] Criar Conversation Provider no GHL Marketplace
- [ ] Executar migration SQL no Supabase
- [ ] Adicionar variável `GHL_CONVERSATION_PROVIDER_ID`
- [ ] Fazer deploy
- [ ] Instalar app no GHL
- [ ] Testar envio/recebimento de mensagens
