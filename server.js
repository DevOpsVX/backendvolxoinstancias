import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';
import wppconnect from '@wppconnect-team/wppconnect';
import { nanoid } from 'nanoid';
import { startWhatsAppSession as startWPPSession, closeWhatsAppSession, getPhoneNumber } from './wppconnect-session.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// 🔧 Variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
// Aceita tanto SUPABASE_KEY quanto SUPABASE_ANON_KEY para compatibilidade
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

// Verificação de variáveis de ambiente
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERRO: Variáveis de ambiente do Supabase não configuradas!');
  console.error('SUPABASE_URL:', SUPABASE_URL ? '✅ Configurada' : '❌ Faltando');
  console.error('SUPABASE_KEY:', SUPABASE_KEY ? '✅ Configurada' : '❌ Faltando');
  console.error('Nota: Aceita SUPABASE_KEY ou SUPABASE_ANON_KEY');
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
const PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || `${process.cwd()}/.cache/puppeteer`;

// Configurar PUPPETEER_CACHE_DIR para o Puppeteer
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

// Executa limpeza ao iniciar
cleanupOldSessions();

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

// 🔹 Rota para buscar QR Code da instância
app.get('/api/instances/:id/qr', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('installations')
      .select('qr_code, qr_code_updated_at')
      .eq('instance_id', id)
      .single();

    if (error) throw error;
    
    // Verifica se QR Code existe e não está expirado (5 minutos)
    if (data.qr_code && data.qr_code_updated_at) {
      const updatedAt = new Date(data.qr_code_updated_at);
      const now = new Date();
      const diffMinutes = (now - updatedAt) / 1000 / 60;
      
      if (diffMinutes < 5) {
        return res.json({ qr_code: data.qr_code });
      }
    }
    
    // QR Code não existe ou expirou
    res.json({ qr_code: null });
  } catch (err) {
    console.error('Erro ao buscar QR Code:', err);
    res.status(500).json({ error: 'Erro ao buscar QR Code' });
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
      if (session.client) {
        await closeWhatsAppSession(session.client);
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
      if (session.client) {
        await closeWhatsAppSession(session.client);
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

// 🔹 Função para iniciar sessão do WhatsApp com WPPConnect
async function startWhatsAppSession(instanceId) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);
  
  try {
    const client = await startWPPSession(
      instanceId,
      // Callback quando QR Code é gerado
      async (base64Qr) => {
        console.log(`[WPP] ✅ QR CODE GERADO!`);
        console.log(`[WPP] QR Code length: ${base64Qr.length}`);
        
        // Salva QR Code no Supabase para polling HTTP
        try {
          await supabase
            .from('installations')
            .update({ 
              qr_code: base64Qr,
              qr_code_updated_at: new Date().toISOString()
            })
            .eq('instance_id', instanceId);
          console.log(`[WPP] QR Code salvo no Supabase para ${instanceId}`);
        } catch (err) {
          console.error(`[WPP] Erro ao salvar QR Code no Supabase:`, err);
        }
        
        // Também envia via WebSocket (fallback)
        broadcastToInstance(instanceId, { type: 'qr', data: base64Qr });
      },
      // Callback de mudança de status
      async (status) => {
        console.log(`[WPP] Status mudou para: ${status}`);
        
        if (status === 'qrReadFail' || status === 'qrReadError') {
          // QR Code expirou ou erro ao ler
          console.log(`[WPP] ❌ Erro ao ler QR Code`);
          
          // Limpa QR Code do banco
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
            reason: 'qr_read_fail',
            message: 'Erro ao ler QR Code. Tente novamente.'
          });
        }
      },
      // Callback quando conectado
      async (client) => {
        console.log(`[WPP] ✅ WhatsApp conectado com sucesso!`);
        
        // Obtém número de telefone
        const phoneNumber = await getPhoneNumber(client);
        console.log(`[WPP] Número de telefone: ${phoneNumber}`);
        
        // Atualiza no banco de dados e limpa QR Code
        await supabase
          .from('installations')
          .update({ 
            phone_number: phoneNumber,
            qr_code: null,
            qr_code_updated_at: null
          })
          .eq('instance_id', instanceId);

        // Notifica clientes
        broadcastToInstance(instanceId, { type: 'status', data: 'connected' });
      }
    );
    
    // Armazena cliente na sessão
    if (!activeSessions.has(instanceId)) {
      activeSessions.set(instanceId, { client, clients: new Set() });
    } else {
      const session = activeSessions.get(instanceId);
      session.client = client;
    }
    
    console.log(`[WPP] Cliente WPPConnect armazenado para ${instanceId}`);
    return client;
    
  } catch (err) {
    console.error(`[WPP] ❌ Erro ao iniciar sessão WhatsApp:`, err);
    throw err;
  }
}

// 🔹 Função para enviar mensagem para todos os clientes de uma instância
function broadcastToInstance(instanceId, message) {
  console.log(`[BROADCAST] Tentando enviar para instância: ${instanceId}`);
  console.log(`[BROADCAST] Tipo de mensagem: ${message.type}`);
  
  const session = activeSessions.get(instanceId);
  
  if (!session) {
    console.log(`[BROADCAST] ❌ Sessão não encontrada em activeSessions!`);
    return;
  }
  
  if (!session.clients) {
    console.log(`[BROADCAST] ❌ Sessão não tem array de clientes!`);
    return;
  }
  
  console.log(`[BROADCAST] Número de clientes conectados: ${session.clients.size}`);
  
  const msgString = JSON.stringify(message);
  let sentCount = 0;
  
  session.clients.forEach((client) => {
    console.log(`[BROADCAST] Cliente readyState: ${client.readyState}`);
    if (client.readyState === 1) {
      client.send(msgString);
      sentCount++;
      console.log(`[BROADCAST] ✅ Mensagem enviada para cliente!`);
    } else {
      console.log(`[BROADCAST] ❌ Cliente não está OPEN (readyState: ${client.readyState})`);
    }
  });
  
  console.log(`[BROADCAST] Total de mensagens enviadas: ${sentCount}/${session.clients.size}`);
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
    activeSessions.set(instanceId, { client: null, clients: new Set() });
  }
  
  const session = activeSessions.get(instanceId);
  session.clients.add(ws);
  
  // Configura ping/pong para manter conexão viva
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Envia ping a cada 30 segundos
  const pingInterval = setInterval(() => {
    if (ws.isAlive === false) {
      console.log(`[WS] Cliente não respondeu ao ping, encerrando conexão: ${instanceId}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  }, 30000);
  
  // Envia status atual da sessão
  if (session.client?.user) {
    // Já conectado
    ws.send(JSON.stringify({ type: 'status', data: 'connected' }));
  } else if (session.client) {
    // Conectando
    ws.send(JSON.stringify({ type: 'status', data: 'connecting' }));
  } else {
    // Não iniciado
    ws.send(JSON.stringify({ type: 'status', data: 'disconnected' }));
  }
  
  // Escuta comandos do cliente
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'start') {
        console.log(`[WS] Cliente solicitou início de sessão para ${instanceId}`);
        
        // Verifica se já existe sessão ativa
        if (session.client) {
          console.log(`[WS] Sessão já existe para ${instanceId}`);
          ws.send(JSON.stringify({ type: 'error', data: 'Sessão já está ativa' }));
          return;
        }
        
        // Inicia nova sessão
        await startWhatsAppSession(instanceId);
      }
    } catch (err) {
      console.error(`[WS] Erro ao processar mensagem:`, err);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket desconectado para instância: ${instanceId}`);
    clearInterval(pingInterval);
    session.clients.delete(ws);
    
    // Se não há mais clientes e não está conectado, limpa a sessão
    if (session.clients.size === 0 && !session.client?.user) {
      // Mantém a sessão por 5 minutos antes de limpar
      const timeoutId = setTimeout(() => {
        const currentSession = activeSessions.get(instanceId);
        if (currentSession && currentSession.clients.size === 0 && !currentSession.client?.user) {
          console.log(`[WS] Limpando sessão inativa: ${instanceId}`);
          activeSessions.delete(instanceId);
        }
      }, 5 * 60 * 1000);
      // Armazena o timeout para poder cancelar se necessário
      session.cleanupTimeout = timeoutId;
    }
  });

  ws.on('error', (err) => {
    console.error(`Erro no WebSocket para ${instanceId}:`, err);
  });
});
