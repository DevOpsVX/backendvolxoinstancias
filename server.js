import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { nanoid } from 'nanoid';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// 🔧 Variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Verificação de variáveis de ambiente
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERRO: Variáveis de ambiente do Supabase não configuradas!');
  console.error('SUPABASE_URL:', SUPABASE_URL ? '✅ Configurada' : '❌ Faltando');
  console.error('SUPABASE_KEY:', SUPABASE_KEY ? '✅ Configurada' : '❌ Faltando');
  process.exit(1);
}

console.log('✅ Variáveis de ambiente do Supabase configuradas');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_REDIRECT_URI = process.env.GHL_REDIRECT_URI;
const GHL_AUTH_URL =
  process.env.GHL_AUTH_URL ||
  'https://marketplace.gohighlevel.com/oauth/chooselocation';

// 🔹 Novo parâmetro para escopos
const GHL_SCOPES =
  process.env.GHL_SCOPES ||
  'conversations.readonly conversations.write conversations/message.readonly conversations/message.write conversations/reports.readonly contacts.readonly contacts.write oauth.write oauth.readonly conversation-ai.readonly conversation-ai.write locations.write locations.readonly custom-menu-link.readonly custom-menu-link.write marketplace-installer-details.readonly numberpools.read phonenumbers.read';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';

// Armazenamento de sessões ativas do WhatsApp
const activeSessions = new Map();

// ✅ Rota de teste
app.get('/', (req, res) => res.send('API listening'));

// 🔍 Rota de teste de conexão com Supabase
app.get('/api/test-supabase', async (req, res) => {
  try {
    console.log('[TEST] Testando conexão com Supabase...');
    console.log('[TEST] SUPABASE_URL:', SUPABASE_URL ? 'Configurada' : 'NÃO configurada');
    console.log('[TEST] SUPABASE_KEY:', SUPABASE_KEY ? 'Configurada (primeiros 10 chars: ' + SUPABASE_KEY.substring(0, 10) + '...)' : 'NÃO configurada');
    
    // Tenta fazer uma query simples
    const { data, error, count } = await supabase
      .from('installations')
      .select('*', { count: 'exact', head: false })
      .limit(1);
    
    if (error) {
      console.error('[TEST] Erro ao conectar:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao conectar com Supabase',
        error: {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        },
        config: {
          hasUrl: !!SUPABASE_URL,
          hasKey: !!SUPABASE_KEY,
          urlPreview: SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : 'N/A'
        }
      });
    }
    
    console.log('[TEST] Conexão bem-sucedida!');
    console.log('[TEST] Registros encontrados:', count);
    
    res.json({
      success: true,
      message: 'Conexão com Supabase OK',
      data: {
        recordCount: count,
        sampleRecord: data?.[0] || null
      },
      config: {
        hasUrl: true,
        hasKey: true,
        urlPreview: SUPABASE_URL.substring(0, 30) + '...'
      }
    });
  } catch (err) {
    console.error('[TEST] Exceção:', err);
    res.status(500).json({
      success: false,
      message: 'Exceção ao testar Supabase',
      error: err.message,
      stack: err.stack
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

  // adiciona o escopo se existir
  if (GHL_SCOPES) {
    params.append('scope', GHL_SCOPES);
  }

  return `${GHL_AUTH_URL}?${params.toString()}`;
}

// 🔹 Rota para criar nova instância
app.post('/api/instances', async (req, res) => {
  try {
    console.log('[CREATE] Recebida requisição para criar instância');
    console.log('[CREATE] Body:', req.body);
    
    const { name } = req.body;
    if (!name) {
      console.log('[CREATE] Erro: Nome não fornecido');
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const instanceId = nanoid();
    console.log('[CREATE] InstanceId gerado:', instanceId);
    console.log('[CREATE] Tentando inserir no Supabase...');
    
    const { data, error } = await supabase
      .from('installations')
      .insert([{ instance_id: instanceId, instance_name: name }])
      .select('*')
      .single();

    if (error) {
      console.error('[CREATE] Erro do Supabase:', error);
      throw error;
    }

    console.log('[CREATE] Instância criada com sucesso:', data);
    const authUrl = buildGhlAuthUrl(data.instance_id);
    console.log('[CREATE] AuthUrl gerada:', authUrl);
    
    res.json({ authUrl, instanceId: data.instance_id });
  } catch (err) {
    console.error('[CREATE] Erro ao criar instância:', err);
    console.error('[CREATE] Stack:', err.stack);
    res.status(500).json({ 
      error: 'Erro ao criar instância',
      details: err.message,
      code: err.code 
    });
  }
});

// 🔹 Rota para listar instâncias existentes
app.get('/api/instances', async (req, res) => {
  try {
    console.log('[LIST] Recebida requisição para listar instâncias');
    
    const { data, error } = await supabase
      .from('installations')
      .select('*')
      .order('instance_id', { ascending: false });

    if (error) {
      console.error('[LIST] Erro do Supabase:', error);
      throw error;
    }
    
    console.log('[LIST] Instâncias encontradas:', data?.length || 0);
    res.json({ data }); // envia como objeto com propriedade data
  } catch (err) {
    console.error('[LIST] Erro ao listar instâncias:', err);
    console.error('[LIST] Stack:', err.stack);
    res.status(500).json({ 
      error: 'Erro ao listar instâncias',
      details: err.message,
      code: err.code
    });
  }
});

// 🔹 Rota de callback (recebe o retorno do GHL)
app.get('/leadconnectorhq/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'Código ausente' });

    const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GHL_CLIENT_ID,
        client_secret: GHL_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GHL_REDIRECT_URI,
      }),
    });

    const tokenData = await response.json();

    await supabase.from('installations').update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      company_id: tokenData.companyId,
    })
    .eq('instance_id', state);

    // Redireciona de volta ao frontend com o instanceId
    res.redirect(`${FRONTEND_URL}/instance/${state}`);
  } catch (err) {
    console.error('Erro no callback do GHL:', err);
    res.status(500).send('Erro ao processar callback do GHL');
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
    
    // Adiciona informações de sessão ativa
    const sessionInfo = activeSessions.has(id) ? {
      isActive: true,
      hasSocket: !!activeSessions.get(id).sock,
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

// 🔹 Rota para atualizar nome da instância
app.patch('/api/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { instance_name } = req.body;

    if (!instance_name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const { data, error } = await supabase
      .from('installations')
      .update({ instance_name })
      .eq('instance_id', id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Erro ao atualizar instância:', err);
    res.status(500).json({ error: 'Erro ao atualizar instância' });
  }
});

// 🔹 Rota para desconectar WhatsApp (logout)
app.post('/api/instances/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (activeSessions.has(id)) {
      const session = activeSessions.get(id);
      if (session.sock) {
        await session.sock.logout();
      }
      activeSessions.delete(id);
    }

    // Limpa o número de telefone no banco
    await supabase
      .from('installations')
      .update({ phone_number: null })
      .eq('instance_id', id);

    res.json({ success: true, message: 'WhatsApp desconectado com sucesso' });
  } catch (err) {
    console.error('Erro ao desconectar WhatsApp:', err);
    res.status(500).json({ error: 'Erro ao desconectar WhatsApp' });
  }
});

// 🔹 Rota para reconectar WhatsApp (gera novo QR)
app.post('/api/instances/:id/reconnect', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fecha sessão existente se houver
    if (activeSessions.has(id)) {
      const session = activeSessions.get(id);
      if (session.sock) {
        await session.sock.logout();
      }
      activeSessions.delete(id);
    }

    // Limpa o número de telefone no banco
    await supabase
      .from('installations')
      .update({ phone_number: null })
      .eq('instance_id', id);

    res.json({ success: true, message: 'Reconexão iniciada. Acesse a página da instância para escanear o novo QR code.' });
  } catch (err) {
    console.error('Erro ao reconectar WhatsApp:', err);
    res.status(500).json({ error: 'Erro ao reconectar WhatsApp' });
  }
});

// 🔹 Rota para obter estatísticas gerais
app.get('/api/stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('installations')
      .select('*');

    if (error) throw error;

    const stats = {
      total: data.length,
      connected: data.filter(i => i.phone_number).length,
      pending: data.filter(i => !i.phone_number).length,
      activeSessions: activeSessions.size,
      instances: data.map(i => ({
        instanceId: i.instance_id,
        instance_name: i.instance_name,
        phone_number: i.phone_number,
        company_id: i.company_id,
        hasActiveSession: activeSessions.has(i.instance_id)
      }))
    };

    res.json(stats);
  } catch (err) {
    console.error('Erro ao buscar estatísticas:', err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// 🔹 Rota para deletar instância
app.delete('/api/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fecha a sessão do WhatsApp se estiver ativa
    if (activeSessions.has(id)) {
      const session = activeSessions.get(id);
      if (session.sock) {
        await session.sock.logout();
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

// 🔹 Função para iniciar sessão do WhatsApp
async function startWhatsAppSession(instanceId, wss) {
  try {
    const authDir = `${PUPPETEER_CACHE_DIR}/auth_${instanceId}`;
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    activeSessions.set(instanceId, { sock, clients: new Set() });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Envia QR code para todos os clientes conectados
        broadcastToInstance(instanceId, { type: 'qr', data: qr });
      }

      if (connection === 'close') {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          startWhatsAppSession(instanceId, wss);
        } else {
          activeSessions.delete(instanceId);
        }
      } else if (connection === 'open') {
        const phoneNumber = sock.user?.id?.split(':')[0];
        
        // Atualiza no banco de dados
        await supabase
          .from('installations')
          .update({ phone_number: phoneNumber })
          .eq('instance_id', instanceId);

        // Notifica clientes
        broadcastToInstance(instanceId, { type: 'status', data: 'connected' });
      }
    });

    return sock;
  } catch (err) {
    console.error(`Erro ao iniciar sessão WhatsApp para ${instanceId}:`, err);
    throw err;
  }
}

// 🔹 Função para enviar mensagem para todos os clientes de uma instância
function broadcastToInstance(instanceId, message) {
  const session = activeSessions.get(instanceId);
  if (session && session.clients) {
    const msgString = JSON.stringify(message);
    session.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(msgString);
      }
    });
  }
}

// 🔹 Inicialização do servidor
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => console.log(`✅ API listening on port ${PORT}`));

// 🔹 Configuração do WebSocket
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const urlParts = req.url.split('/');
  const instanceId = urlParts[urlParts.length - 1];

  console.log(`WebSocket conectado para instância: ${instanceId}`);

  // Adiciona cliente à lista da instância
  if (!activeSessions.has(instanceId)) {
    activeSessions.set(instanceId, { sock: null, clients: new Set() });
    // Inicia sessão do WhatsApp
    startWhatsAppSession(instanceId, wss).catch(console.error);
  }
  
  const session = activeSessions.get(instanceId);
  session.clients.add(ws);

  ws.on('close', () => {
    console.log(`WebSocket desconectado para instância: ${instanceId}`);
    session.clients.delete(ws);
    
    // Se não há mais clientes, pode considerar fechar a sessão
    if (session.clients.size === 0 && !session.sock?.user) {
      // Mantém a sessão por 5 minutos antes de limpar
      setTimeout(() => {
        if (session.clients.size === 0) {
          activeSessions.delete(instanceId);
        }
      }, 5 * 60 * 1000);
    }
  });

  ws.on('error', (err) => {
    console.error(`Erro no WebSocket para ${instanceId}:`, err);
  });
});
