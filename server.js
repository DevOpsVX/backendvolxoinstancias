import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// 🔧 Variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
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

// ✅ Rota de teste
app.get('/', (req, res) => res.send('API listening'));

// 🧭 Função que gera a URL de autenticação no GHL
function buildGhlAuthUrl(instanceId) {
  const params = new URLSearchParams({
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
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const { data, error } = await supabase
      .from('installations')
      .insert([{ instanceId: name }])
      .select('*')
      .single();

    if (error) throw error;

    const authUrl = buildGhlAuthUrl(data.instanceId);
    res.json({ redirectUrl: authUrl });
  } catch (err) {
    console.error('Erro ao criar instância:', err);
    res.status(500).json({ error: 'Erro ao criar instância' });
  }
});

// 🔹 Rota para listar instâncias existentes
app.get('/api/instances', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('installations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json(data); // envia direto o array (não um objeto)
  } catch (err) {
    console.error('Erro ao listar instâncias:', err);
    res.status(500).json({ error: 'Erro ao listar instâncias' });
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
    .eq('instanceId', state);

    res.send('Autenticação concluída com sucesso!');
  } catch (err) {
    console.error('Erro no callback do GHL:', err);
    res.status(500).send('Erro ao processar callback do GHL');
  }
});

// 🔹 Inicialização do servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ API listening on port ${PORT}`));
