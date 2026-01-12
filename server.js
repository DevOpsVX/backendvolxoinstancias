import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';
import wppconnect from '@wppconnect-team/wppconnect';
import { nanoid } from 'nanoid';
import { startWhatsAppSession as startWPPSession, closeWhatsAppSession, getPhoneNumber } from './wppconnect-session.js';
import {
  sendInboundMessageToGHL,
  findOrCreateContactInGHL,
  updateMessageStatusInGHL,
  getLocationInfo,
  getLocationConversationProviderId
} from './ghl-integration.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// 🔧 Variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERRO: Variáveis de ambiente do Supabase não configuradas!');
  process.exit(1);
}

console.log('✅ Variáveis de ambiente do Supabase configuradas');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_REDIRECT_URI = process.env.GHL_REDIRECT_URI;
const GHL_AUTH_URL = process.env.GHL_AUTH_URL || 'https://marketplace.gohighlevel.com/oauth/chooselocation';
const GHL_CONVERSATION_PROVIDER_ID = process.env.GHL_CONVERSATION_PROVIDER_ID; // NOVO

const GHL_SCOPES =
  process.env.GHL_SCOPES ||
  'conversations.readonly conversations.write conversations/message.readonly conversations/message.write conversations/reports.readonly contacts.readonly contacts.write oauth.write oauth.readonly conversation-ai.readonly conversation-ai.write locations.write locations.readonly custom-menu-link.readonly custom-menu-link.write marketplace-installer-details.readonly numberpools.read phonenumbers.read';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || `${process.cwd()}/.cache/puppeteer`;

process.env.PUPPETEER_CACHE_DIR = PUPPETEER_CACHE_DIR;
console.log(`📁 PUPPETEER_CACHE_DIR configurado: ${PUPPETEER_CACHE_DIR}`);

// Armazenamento de sessões ativas do WhatsApp
const activeSessions = new Map();

// 🛡️ Função para limpar sessões antigas ao iniciar
async function cleanupOldSessions() {
  console.log('🧹 Limpando sessões antigas...');
  activeSessions.clear();
  console.log('✅ Sessões antigas limpas. Servidor iniciando limpo.');
}

cleanupOldSessions();

// ✅ Rota de teste
app.get('/', (req, res) => res.send('API listening'));

// 🔍 Rota de teste de conexão com Supabase
app.get('/api/test-supabase', async (req, res) => {
  try {
    const { data, error, count } = await supabase
      .from('installations')
      .select('*', { count: 'exact', head: false })
      .limit(1);
    
    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao conectar com Supabase',
        error: error
      });
    }
    
    res.json({
      success: true,
      message: 'Conexão com Supabase OK',
      data: { recordCount: count }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Exceção ao testar Supabase',
      error: err.message
    });
  }
});

// 🧭 Função que gera a URL de autenticação no GHL
function buildGhlAuthUrl(instanceId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: GHL_CLIENT_ID,
    redirect_uri: GHL_REDIRECT_URI,
    state: instanceId,
  });

  if (GHL_SCOPES) {
    params.append('scope', GHL_SCOPES);
  }

  return `${GHL_AUTH_URL}?${params.toString()}`;
}

// 🔹 Rota para criar nova instância
app.post('/api/instances', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const instanceId = nanoid();
    
    const { data, error } = await supabase
      .from('installations')
      .insert([{ instance_id: instanceId, instance_name: name }])
      .select('*')
      .single();

    if (error) throw error;

    const authUrl = buildGhlAuthUrl(data.instance_id);
    res.json({ authUrl, instanceId: data.instance_id });
  } catch (err) {
    console.error('[CREATE] Erro ao criar instância:', err);
    res.status(500).json({ 
      error: 'Erro ao criar instância',
      details: err.message
    });
  }
});

// 🔹 Rota para listar instâncias existentes
app.get('/api/instances', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('installations')
      .select('*')
      .order('instance_id', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[LIST] Erro ao listar instâncias:', err);
    res.status(500).json({ 
      error: 'Erro ao listar instâncias',
      details: err.message
    });
  }
});

// 🔹 Rota de TESTE do callback (para verificar se está acessível)
app.get('/leadconnectorhq/oauth/callback/test', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Callback route is accessible',
    timestamp: new Date().toISOString()
  });
});

// 🔹 Rota de callback (recebe o retorno do GHL)
app.get('/leadconnectorhq/oauth/callback', async (req, res) => {
  try {
    console.log('[OAUTH CALLBACK] Iniciando callback OAuth');
    console.log('[OAUTH CALLBACK] Query params:', req.query);
    
    const { code, state } = req.query;
    if (!code) {
      console.error('[OAUTH CALLBACK] Código ausente!');
      return res.status(400).json({ error: 'Código ausente' });
    }
    
    if (!state) {
      console.error('[OAUTH CALLBACK] State (instanceId) ausente!');
      return res.status(400).json({ error: 'State ausente' });
    }
    
    console.log('[OAUTH CALLBACK] Code:', code.substring(0, 10) + '...');
    console.log('[OAUTH CALLBACK] State (instanceId):', state);

    // GHL requer application/x-www-form-urlencoded
    const params = new URLSearchParams({
      client_id: GHL_CLIENT_ID,
      client_secret: GHL_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GHL_REDIRECT_URI,
    });
    
    const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const tokenData = await response.json();
    console.log('[OAUTH CALLBACK] Response status:', response.status);
    console.log('[OAUTH CALLBACK] TokenData completo:', JSON.stringify(tokenData, null, 2));
    console.log('[OAUTH CALLBACK] TokenData keys:', Object.keys(tokenData));
    
    // Se houver erro, loga e retorna erro
    if (tokenData.error) {
      console.error('[OAUTH CALLBACK] ERRO DO GHL:', tokenData.error);
      console.error('[OAUTH CALLBACK] DESCRIÇÃO:', tokenData.error_description);
      return res.status(400).send(`Erro OAuth: ${tokenData.error} - ${tokenData.error_description}`);
    }
    
    console.log('[OAUTH CALLBACK] Token obtido com sucesso');
    console.log('[OAUTH CALLBACK] CompanyId:', tokenData.companyId);
    console.log('[OAUTH CALLBACK] LocationId:', tokenData.locationId);

    // Obtém informações da location
    let locationId = tokenData.locationId;
    if (!locationId) {
      try {
        const locationInfo = await getLocationInfo(tokenData.access_token);
        locationId = locationInfo.locations?.[0]?.id;
      } catch (err) {
        console.error('[OAUTH] Erro ao obter location:', err);
      }
    }

    // Busca o Location Provider ID correto
    console.log('[OAUTH CALLBACK] Buscando Location Provider ID...');
    const locationProviderId = await getLocationConversationProviderId(tokenData.access_token);
    console.log('[OAUTH CALLBACK] Location Provider ID:', locationProviderId);
    
    console.log('[OAUTH CALLBACK] Atualizando Supabase...');
    console.log('[OAUTH CALLBACK] InstanceId:', state);
    console.log('[OAUTH CALLBACK] LocationId final:', locationId);
    
    const { data: updateData, error: updateError } = await supabase.from('installations').update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      company_id: tokenData.companyId,
      location_id: locationId,
      location_provider_id: locationProviderId, // NOVO: ID do provider da location
    })
    .eq('instance_id', state)
    .select();
    
    if (updateError) {
      console.error('[OAUTH CALLBACK] Erro ao atualizar Supabase:', updateError);
      throw updateError;
    }
    
    console.log('[OAUTH CALLBACK] Supabase atualizado com sucesso!');
    console.log('[OAUTH CALLBACK] Dados atualizados:', updateData);

    console.log('[OAUTH CALLBACK] Redirecionando para:', `${FRONTEND_URL}/instance/${state}`);
    res.redirect(`${FRONTEND_URL}/instance/${state}`);
  } catch (err) {
    console.error('[OAUTH CALLBACK] ERRO FATAL:', err);
    console.error('[OAUTH CALLBACK] Stack:', err.stack);
    res.status(500).send('Erro ao processar callback do GHL: ' + err.message);
  }
});

// 🆕 NOVO: Webhook para receber mensagens outbound do GHL
app.post('/ghl/outbound', async (req, res) => {
  try {
    console.log('[GHL WEBHOOK] Recebida mensagem outbound do GHL');
    console.log('[GHL WEBHOOK] Body:', JSON.stringify(req.body, null, 2));

    const { locationId, conversationProviderId, message, messageId, phone } = req.body;
    
    if (!message || !locationId || !phone) {
      console.error('[GHL WEBHOOK] Dados incompletos no webhook');
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // GHL envia 'phone' e 'message' diretamente no body
    // Normaliza número: remove TODOS os caracteres não numéricos
    const phoneNumber = phone.replace(/[^0-9]/g, '');
    
    // Valida formato do número
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      console.error('[GHL WEBHOOK] Número de telefone inválido:', { original: phone, cleaned: phoneNumber });
      return res.status(400).json({ error: `Número de telefone inválido: ${phone}` });
    }
    
    const to = `${phoneNumber}@c.us`; // Adiciona @c.us para formato WhatsApp
    const body = message;
    
    console.log('[GHL WEBHOOK] Número normalizado:', { original: phone, normalized: to });

    // Busca instância associada ao locationId
    const { data: instance, error } = await supabase
      .from('installations')
      .select('*')
      .eq('location_id', locationId)
      .single();

    if (error || !instance) {
      console.error('[GHL WEBHOOK] Instância não encontrada para locationId:', locationId);
      return res.status(404).json({ error: 'Instância não encontrada' });
    }

    // Obtém cliente WPPConnect da sessão
    const session = activeSessions.get(instance.instance_id);
    if (!session || !session.client) {
      console.error('[GHL WEBHOOK] WhatsApp não conectado para instância:', instance.instance_id);
      return res.status(400).json({ error: 'WhatsApp não conectado' });
    }
    // Envia mensagem via WhatsApp
    console.log('[GHL WEBHOOK] Enviando mensagem via WhatsApp para:', to);
    
    try {
      // Workaround para erro "No LID for user": abrir chat antes de enviar
      console.log('[GHL WEBHOOK] Abrindo chat...');
      let chatOpened = false;
      try {
        // Abre o chat para forçar criação do LID
        await session.client.openChat(to);
        chatOpened = true;
        console.log('[GHL WEBHOOK] ✅ Chat aberto com sucesso');
        
        // Aguarda 1 segundo para garantir que o LID foi criado
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (openError) {
        console.error('[GHL WEBHOOK] ⚠️ Erro ao abrir chat:', openError.message);
        // Tenta continuar mesmo se falhar, mas loga o erro
      }
      
      // Envia mensagem
      console.log('[GHL WEBHOOK] Enviando texto...', { to, bodyLength: body.length });
      const result = await session.client.sendText(to, body);
      
      // Valida se mensagem foi enviada com sucesso
      if (!result || !result.id) {
        throw new Error('Mensagem não foi enviada (sem ID de retorno)');
      }
      
      console.log('[GHL WEBHOOK] ✅ Mensagem enviada com sucesso, ID:', result.id);
      
      // Registra no cache para evitar processar novamente quando o evento onMessage disparar
      const cacheKey = `${to}-${body.substring(0, 50)}`; // Usa primeiros 50 chars
      outboundMessagesSent.set(cacheKey, Date.now());
      setTimeout(() => outboundMessagesSent.delete(cacheKey), 2 * 60 * 1000); // Expira em 2 min
    } catch (sendError) {
      console.error('[GHL WEBHOOK] ❌ Erro ao enviar mensagem:', {
        error: sendError.message,
        stack: sendError.stack,
        to: to,
        bodyPreview: body.substring(0, 100)
      });
      
      // Atualiza status como 'failed' no GHL se messageId fornecido
      if (messageId && instance.access_token) {
        try {
          await updateMessageStatusInGHL(instance.access_token, messageId, 'failed');
          console.log('[GHL WEBHOOK] Status atualizado para "failed" no GHL');
        } catch (statusError) {
          console.error('[GHL WEBHOOK] Erro ao atualizar status de falha:', statusError.message);
        }
      }
      
      throw sendError;
    }

    // Atualiza status no GHL (se messageId fornecido)
    if (messageId && instance.access_token) {
      try {
        await updateMessageStatusInGHL(instance.access_token, messageId, 'delivered');
        console.log('[GHL WEBHOOK] ✅ Status atualizado no GHL');
      } catch (err) {
        console.error('[GHL WEBHOOK] Erro ao atualizar status:', err);
      }
    }

    res.json({ success: true, message: 'Mensagem enviada' });
  } catch (err) {
    console.error('[GHL WEBHOOK] Erro ao processar outbound:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Rota para obter detalhes de uma instância específica
app.get('/api/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('installations')
      .select('*')
      .eq('instance_id', id)
      .single();

    if (error) throw error;
    
    const sessionInfo = activeSessions.has(id) ? {
      isActive: true,
      hasSocket: !!activeSessions.get(id).client,
      connectedClients: activeSessions.get(id).clients.size
    } : {
      isActive: false,
      hasSocket: false,
      connectedClients: 0
    };

    res.json({ ...data, sessionInfo });
  } catch (err) {
    console.error('Erro ao buscar instância:', err);
    res.status(500).json({ error: 'Erro ao buscar instância' });
  }
});

// 🔹 Rota para obter QR code de uma instância
app.get('/api/instances/:id/qrcode', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('installations')
      .select('qr_code, qr_code_updated_at, phone_number')
      .eq('instance_id', id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    // Se já está conectado (tem phone_number), não precisa de QR code
    if (data.phone_number) {
      return res.json({
        connected: true,
        phone_number: data.phone_number,
        qr_code: null
      });
    }
    
    // Se não tem QR code disponível
    if (!data.qr_code) {
      return res.status(404).json({ 
        error: 'QR code not available',
        message: 'Start the instance first to generate QR code'
      });
    }
    
    res.json({
      connected: false,
      qr_code: data.qr_code,
      updated_at: data.qr_code_updated_at
    });
  } catch (err) {
    console.error('[QR] Erro ao buscar QR code:', err);
    res.status(500).json({ error: 'Error fetching QR code' });
  }
});

// 🔹 Rota de DEBUG para listar providers do GHL
app.get('/api/instances/:id/debug-providers', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Busca dados da instância
    const { data: instance, error } = await supabase
      .from('installations')
      .select('*')
      .eq('instance_id', id)
      .single();

    if (error || !instance) {
      return res.status(404).json({ error: 'Instância não encontrada' });
    }

    if (!instance.access_token) {
      return res.status(400).json({ error: 'Instância sem access_token' });
    }

    // Busca providers do GHL
    const providerId = await getLocationConversationProviderId(instance.access_token);
    
    res.json({
      success: true,
      instance_id: id,
      location_id: instance.location_id,
      current_location_provider_id: instance.location_provider_id,
      found_provider_id: providerId,
      message: 'Verifique os logs do servidor para ver todos os providers retornados pelo GHL'
    });
  } catch (err) {
    console.error('[DEBUG] Erro ao buscar providers:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Rota para deletar uma instância
app.delete('/api/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fecha a sessão do WhatsApp se estiver ativa
    if (activeSessions.has(id)) {
      const session = activeSessions.get(id);
      if (session.client) {
        await closeWhatsAppSession(session.client);
      }
      activeSessions.delete(id);
    }

    const { error } = await supabase
      .from('installations')
      .delete()
      .eq('instance_id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar instância:', err);
    res.status(500).json({ error: 'Erro ao deletar instância' });
  }
});

// 🔹 Rota para atualizar nome da instância
app.patch('/api/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { instance_name } = req.body;
    
    if (!instance_name) {
      return res.status(400).json({ error: 'Nome da instância é obrigatório' });
    }

    const { data, error } = await supabase
      .from('installations')
      .update({ instance_name })
      .eq('instance_id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Erro ao atualizar instância:', err);
    res.status(500).json({ error: 'Erro ao atualizar instância' });
  }
});

// 🔹 Rota para desconectar uma instância
app.post('/api/instances/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (activeSessions.has(id)) {
      const session = activeSessions.get(id);
      if (session.client) {
        await closeWhatsAppSession(session.client);
      }
      activeSessions.delete(id);
    }

    await supabase
      .from('installations')
      .update({ phone_number: null, qr_code: null, qr_code_updated_at: null })
      .eq('instance_id', id);

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao desconectar instância:', err);
    res.status(500).json({ error: 'Erro ao desconectar instância' });
  }
});

// 🔹 Rota para reconectar uma instância
app.post('/api/instances/:id/reconnect', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fecha sessão antiga se existir
    if (activeSessions.has(id)) {
      const session = activeSessions.get(id);
      if (session.client) {
        await closeWhatsAppSession(session.client);
      }
      activeSessions.delete(id);
    }

    // Limpa dados de conexão
    await supabase
      .from('installations')
      .update({ phone_number: null, qr_code: null, qr_code_updated_at: null })
      .eq('instance_id', id);

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao reconectar instância:', err);
    res.status(500).json({ error: 'Erro ao reconectar instância' });
  }
});

// 🔹 Rota para obter estatísticas
app.get('/api/stats', async (req, res) => {
  try {
    const { count } = await supabase
      .from('installations')
      .select('*', { count: 'exact', head: true });

    const activeConnections = Array.from(activeSessions.values())
      .filter(s => s.client && s.client.user)
      .length;

    res.json({
      totalInstances: count || 0,
      activeConnections,
      activeSessions: activeSessions.size
    });
  } catch (err) {
    console.error('Erro ao obter estatísticas:', err);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

// 🔹 Função para iniciar sessão do WhatsApp com WPPConnect
async function startWhatsAppSession(instanceId) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);
  
  try {
    const client = await startWPPSession(
      instanceId,
      // Callback quando QR Code é gerado
      async (base64Qr) => {
        console.log(`[WPP] ✅ QR CODE GERADO!`);
        
        try {
          await supabase
            .from('installations')
            .update({ 
              qr_code: base64Qr,
              qr_code_updated_at: new Date().toISOString()
            })
            .eq('instance_id', instanceId);
        } catch (err) {
          console.error(`[WPP] Erro ao salvar QR Code:`, err);
        }
        
        broadcastToInstance(instanceId, { type: 'qr', data: base64Qr });
      },
      // Callback de mudança de status
      async (status) => {
        console.log(`[WPP] Status mudou para: ${status}`);
        
        if (status === 'qrReadFail' || status === 'qrReadError') {
          try {
            await supabase
              .from('installations')
              .update({ 
                qr_code: null,
                qr_code_updated_at: null
              })
              .eq('instance_id', instanceId);
          } catch (err) {
            console.error(`[WPP] Erro ao limpar QR Code:`, err);
          }
          
          broadcastToInstance(instanceId, { 
            type: 'status', 
            data: 'disconnected',
            reason: 'qr_read_fail'
          });
        }
      },
      // Callback quando conectado
      async (client) => {
        console.log(`[WPP] ✅ WhatsApp conectado com sucesso!`);
        
        const phoneNumber = await getPhoneNumber(client);
        console.log(`[WPP] Número de telefone: ${phoneNumber}`);
        
        await supabase
          .from('installations')
          .update({ 
            phone_number: phoneNumber,
            qr_code: null,
            qr_code_updated_at: null
          })
          .eq('instance_id', instanceId);

        // 🆕 NOVO: Configura listener de mensagens inbound
        setupWhatsAppMessageListener(client, instanceId);

        broadcastToInstance(instanceId, { type: 'status', data: 'connected' });
      }
    );
    
    if (!activeSessions.has(instanceId)) {
      activeSessions.set(instanceId, { client, clients: new Set() });
    } else {
      const session = activeSessions.get(instanceId);
      session.client = client;
    }
    
    return client;
    
  } catch (err) {
    console.error(`[WPP] ❌ Erro ao iniciar sessão WhatsApp:`, err);
    throw err;
  }
}

// Cache de mensagens processadas (previne duplicação)
const processedMessages = new Map();

// Cache de mensagens outbound enviadas via GHL (previne duplicação de mensagens próprias)
const outboundMessagesSent = new Map();

// 🆕 NOVO: Configura listener de mensagens do WhatsApp
async function setupWhatsAppMessageListener(client, instanceId) {
  console.log(`[WPP] Configurando listener de mensagens para ${instanceId}`);
  
  try {
    // Listener para mensagens recebidas
    client.onMessage(async (message) => {
      try {
        console.log(`[WPP] 📨 Mensagem recebida:`, {
          from: message.from,
          to: message.to,
          body: message.body,
          type: message.type,
          id: message.id,
          fromMe: message.fromMe
        });

        // ⚠️ IMPORTANTE: Verificar grupo/status ANTES de deduplicatação
        // para evitar poluir o cache com mensagens que serão ignoradas
        
        // Ignora mensagens de grupo e status (EXCETO mensagens próprias)
        if ((message.isGroupMsg || message.from === 'status@broadcast') && !message.fromMe) {
          console.log('[WPP] ⚠️ Ignorando mensagem de grupo ou status (não própria):', {
            isGroupMsg: message.isGroupMsg,
            from: message.from,
            to: message.to,
            fromMe: message.fromMe,
            body: message.body?.substring(0, 50)
          });
          return;
        }
        
        // Verifica se é chat individual (termina com @c.us) - EXCETO mensagens próprias
        if (!message.fromMe && !message.from.endsWith('@c.us') && !message.to?.endsWith('@c.us')) {
          console.log('[WPP] ⚠️ Ignorando mensagem não individual (não própria):', {
            from: message.from,
            to: message.to,
            type: message.type,
            fromMe: message.fromMe
          });
          return;
        }

        // Processa mensagens próprias (enviadas via app do WhatsApp)
        let isOutbound = false;
        if (message.fromMe) {
          // Verifica se foi enviada via GHL (webhook outbound)
          const cacheKey = `${message.to}-${(message.body || '').substring(0, 50)}`;
          if (outboundMessagesSent.has(cacheKey)) {
            console.log('[WPP] Mensagem própria já registrada no GHL via webhook, ignorando');
            return;
          }
          
          // Mensagem enviada via app do WhatsApp, deve ser sincronizada
          console.log('[WPP] Mensagem própria enviada via app, sincronizando com GHL');
          isOutbound = true;
        }

        // Deduplicatação: verifica se mensagem já foi processada
        const messageId = message.id || `${message.from}-${message.to}-${message.timestamp}`;
        if (processedMessages.has(messageId)) {
          console.log('[WPP] ⚠️ Mensagem já processada, ignorando duplicata:', {
            messageId: messageId,
            body: message.body?.substring(0, 50)
          });
          return;
        }
        
        // Marca como processada (expira em 2 minutos)
        processedMessages.set(messageId, Date.now());
        setTimeout(() => processedMessages.delete(messageId), 2 * 60 * 1000);

        // Log do tipo de mensagem para monitoramento
        console.log('[WPP] Tipo de mensagem:', {
          type: message.type,
          hasBody: !!message.body,
          hasMediaKey: !!message.mediaKey,
          mimetype: message.mimetype
        });
        
        // Prepara conteúdo da mensagem baseado no tipo
        let messageContent = message.body || '';
        
        // Para mensagens de mídia, adiciona indicação do tipo
        if (message.type === 'image') {
          messageContent = message.body ? `🖼️ Imagem: ${message.body}` : '🖼️ Imagem';
        } else if (message.type === 'ptt' || message.type === 'audio') {
          messageContent = '🎤 Áudio';
        } else if (message.type === 'video') {
          messageContent = '🎥 Vídeo';
        } else if (message.type === 'document') {
          messageContent = message.body ? `📄 Documento: ${message.body}` : '📄 Documento';
        } else if (message.type === 'sticker') {
          messageContent = '👍 Figurinha';
        }

        // Valida se a mensagem tem conteúdo (texto ou mídia)
        if (!messageContent || messageContent.trim() === '') {
          console.log('[WPP] ⚠️ Ignorando mensagem sem conteúdo:', {
            from: message.from,
            type: message.type,
            bodyLength: message.body?.length || 0,
            hasMediaKey: !!message.mediaKey
          });
          return;
        }

        // Busca dados da instância
        const { data: instance, error } = await supabase
          .from('installations')
          .select('*')
          .eq('instance_id', instanceId)
          .single();

        if (error || !instance) {
          console.error('[WPP] Instância não encontrada:', instanceId);
          return;
        }

        if (!instance.access_token || !instance.location_id) {
          console.error('[WPP] Instância sem access_token ou location_id');
          return;
        }

        // Converte numero do WhatsApp para formato E.164
        // Para mensagens outbound (fromMe), o número está em 'to', para inbound está em 'from'
        const phoneField = isOutbound ? message.to : message.from;
        const phoneNumber = phoneField.replace('@c.us', '').replace('@g.us', '').replace('@lid', '');
        
        // Valida se é um número de telefone válido (apenas dígitos após remover sufixos)
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 10 || cleanPhone.length > 15) {
          console.log('[WPP] ⚠️ Ignorando mensagem de número inválido:', {
            original: message.from,
            phoneNumber: phoneNumber,
            cleanPhone: cleanPhone,
            length: cleanPhone.length
          });
          return;
        }
        
        // Ignora números com sufixos especiais do WhatsApp (@lid, etc)
        if (phoneField.includes('@lid') || phoneField.includes('@broadcast')) {
          console.log('[WPP] ⚠️ Ignorando mensagem de identificador especial:', {
            phoneField: phoneField,
            from: message.from,
            to: message.to
          });
          return;
        }
        
        const phoneE164 = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
        console.log('[WPP] Conversão de número:', { original: message.from, phoneNumber, phoneE164 });
        
        // Busca ou cria contato no GHL
        const contactId = await findOrCreateContactInGHL(
          instance.access_token,
          instance.location_id,
          phoneE164,
          message.notifyName || null
        );

        // Envia mensagem para GHL
        const messageData = {
          type: 'SMS',
          message: messageContent,  // Usa messageContent que já inclui indicação de mídia
          contactId: contactId
        };
        
        // Se for mensagem outbound (enviada via app do WhatsApp), adiciona direction
        if (isOutbound) {
          messageData.direction = 'outbound';
          console.log('[WPP] Mensagem outbound (enviada via app do WhatsApp)');
        }

        // NOTA: Para Default Providers (sem "Is this a Custom Conversation Provider" marcado),
        // o conversationProviderId NÃO deve ser enviado, conforme documentação do GHL.
        // O GHL automaticamente usa o provider configurado como default na location.
        console.log('[WPP] Enviando mensagem sem conversationProviderId (Default Provider)');

        await sendInboundMessageToGHL(instance.access_token, messageData);
        console.log('[WPP] ✅ Mensagem enviada para GHL com sucesso');

      } catch (err) {
        console.error('[WPP] Erro ao processar mensagem inbound:', err);
      }
    });

    console.log('[WPP] ✅ Listener de mensagens configurado');
  } catch (err) {
    console.error('[WPP] Erro ao configurar listener:', err);
  }
}

// 🔹 Função para enviar mensagem para todos os clientes de uma instância
function broadcastToInstance(instanceId, message) {
  const session = activeSessions.get(instanceId);
  if (!session || !session.clients) return;
  
  const msgString = JSON.stringify(message);
  session.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msgString);
    }
  });
}

// 🔹 Inicialização do servidor
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => {
  console.log(`✅ API listening on port ${PORT}`);
  console.log(`📍 GHL Webhook URL: ${process.env.GHL_REDIRECT_URI?.replace('/leadconnectorhq/oauth/callback', '/ghl/outbound')}`);
  console.log(`🔑 GHL Conversation Provider ID: ${GHL_CONVERSATION_PROVIDER_ID || 'NÃO CONFIGURADO'}`);
});

// 🔹 Configuração do WebSocket
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const urlParts = req.url.split('/');
  const instanceId = urlParts[urlParts.length - 1];

  console.log(`WebSocket conectado para instância: ${instanceId}`);

  if (!activeSessions.has(instanceId)) {
    activeSessions.set(instanceId, { client: null, clients: new Set() });
  }
  
  const session = activeSessions.get(instanceId);
  session.clients.add(ws);
  
  if (session.cleanupTimeout) {
    clearTimeout(session.cleanupTimeout);
    session.cleanupTimeout = null;
  }
  
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  const pingInterval = setInterval(() => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  }, 30000);
  
  if (session.client?.user) {
    ws.send(JSON.stringify({ type: 'status', data: 'connected' }));
  } else if (session.client) {
    ws.send(JSON.stringify({ type: 'status', data: 'connecting' }));
  } else {
    ws.send(JSON.stringify({ type: 'status', data: 'disconnected' }));
  }
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'start') {
        if (session.client && session.client.user) {
          ws.send(JSON.stringify({ type: 'error', data: 'Sessão já está ativa' }));
          return;
        }
        
        if (session.client && !session.client.user) {
          try {
            await closeWhatsAppSession(session.client);
          } catch (err) {
            console.log(`[WS] Erro ao fechar sessão antiga:`, err.message);
          }
          session.client = null;
        }
        
        try {
          const client = await startWhatsAppSession(instanceId);
          session.client = client;
        } catch (err) {
          console.error(`[WS] Erro ao iniciar sessão:`, err);
          ws.send(JSON.stringify({ 
            type: 'error', 
            data: `Erro ao iniciar sessão WhatsApp: ${err.message}`
          }));
          broadcastToInstance(instanceId, { 
            type: 'status', 
            data: 'disconnected',
            reason: 'initialization_error'
          });
        }
      }
    } catch (err) {
      console.error(`[WS] Erro ao processar mensagem:`, err);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket desconectado para instância: ${instanceId}`);
    clearInterval(pingInterval);
    session.clients.delete(ws);
    
    if (session.clients.size === 0 && !session.client?.user) {
      const timeoutId = setTimeout(() => {
        const currentSession = activeSessions.get(instanceId);
        if (currentSession && currentSession.clients.size === 0 && !currentSession.client?.user) {
          activeSessions.delete(instanceId);
        }
      }, 5 * 60 * 1000);
      session.cleanupTimeout = timeoutId;
    }
  });

  ws.on('error', (err) => {
    console.error(`Erro no WebSocket para ${instanceId}:`, err);
  });
});
