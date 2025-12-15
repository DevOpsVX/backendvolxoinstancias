// connect-whatsapp-visible.js
// Endpoint para conectar WhatsApp com navegador VISÍVEL (modo desenvolvimento)

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { 
  startWhatsAppSessionVisible, 
  closeWhatsAppSessionVisible, 
  getPhoneNumberVisible 
} from './wppconnect-visible-browser.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ERRO: Variáveis de ambiente do Supabase não configuradas!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Armazena sessões ativas
const visibleSessions = new Map();

/**
 * Cria rota para conectar WhatsApp com navegador visível
 * @param {express.Application} app - Aplicação Express
 */
export function setupVisibleWhatsAppRoute(app) {
  
  // 🔹 Rota para iniciar conexão WhatsApp com navegador VISÍVEL
  app.post('/api/instances/:id/connect-visible', async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`[CONNECT-VISIBLE] Iniciando conexão visível para instância: ${id}`);
      
      // Verifica se já existe uma sessão ativa
      if (visibleSessions.has(id)) {
        console.log(`[CONNECT-VISIBLE] Sessão já existe para ${id}`);
        return res.status(400).json({ 
          error: 'Sessão já está ativa para esta instância',
          message: 'Feche a sessão atual antes de iniciar uma nova'
        });
      }
      
      // Busca dados da instância
      const { data: instance, error: fetchError } = await supabase
        .from('installations')
        .select('*')
        .eq('instance_id', id)
        .single();
      
      if (fetchError || !instance) {
        console.error(`[CONNECT-VISIBLE] Instância não encontrada: ${id}`);
        return res.status(404).json({ error: 'Instância não encontrada' });
      }
      
      // Responde imediatamente para não bloquear o frontend
      res.json({ 
        success: true, 
        message: 'Conexão iniciada! O navegador Chrome será aberto em breve.',
        instanceId: id
      });
      
      // Inicia sessão em background
      startWhatsAppSessionVisible(
        id,
        // Callback quando QR Code é gerado
        async (base64Qr) => {
          console.log(`[CONNECT-VISIBLE] ✅ QR CODE GERADO para ${id}!`);
          console.log(`[CONNECT-VISIBLE] 📱 Escaneie o QR Code na janela do navegador!`);
          
          // Salva QR Code no Supabase
          try {
            await supabase
              .from('installations')
              .update({ 
                qr_code: base64Qr,
                qr_code_updated_at: new Date().toISOString()
              })
              .eq('instance_id', id);
            console.log(`[CONNECT-VISIBLE] QR Code salvo no Supabase para ${id}`);
          } catch (err) {
            console.error(`[CONNECT-VISIBLE] Erro ao salvar QR Code:`, err);
          }
        },
        // Callback de mudança de status
        async (status) => {
          console.log(`[CONNECT-VISIBLE] Status mudou para: ${status}`);
          
          if (status === 'inChat' || status === 'isLogged') {
            console.log(`[CONNECT-VISIBLE] ✅ WhatsApp conectado para ${id}!`);
            
            // Obtém número de telefone
            const session = visibleSessions.get(id);
            if (session && session.client) {
              try {
                const phoneNumber = await getPhoneNumberVisible(session.client);
                console.log(`[CONNECT-VISIBLE] Número obtido: ${phoneNumber}`);
                
                // Atualiza no banco
                await supabase
                  .from('installations')
                  .update({ 
                    phone_number: phoneNumber,
                    qr_code: null,
                    qr_code_updated_at: null
                  })
                  .eq('instance_id', id);
                
                console.log(`[CONNECT-VISIBLE] ✅ Número salvo no banco: ${phoneNumber}`);
              } catch (err) {
                console.error(`[CONNECT-VISIBLE] Erro ao obter/salvar número:`, err);
              }
            }
          }
          
          if (status === 'qrReadError' || status === 'qrReadFail') {
            console.log(`[CONNECT-VISIBLE] ❌ Erro ao ler QR Code`);
            
            // Limpa QR Code do banco
            try {
              await supabase
                .from('installations')
                .update({ 
                  qr_code: null,
                  qr_code_updated_at: null
                })
                .eq('instance_id', id);
            } catch (err) {
              console.error(`[CONNECT-VISIBLE] Erro ao limpar QR Code:`, err);
            }
          }
        },
        // Callback quando pronto
        async (client) => {
          console.log(`[CONNECT-VISIBLE] ✅ Cliente pronto para ${id}!`);
          
          // Armazena cliente na sessão
          visibleSessions.set(id, { client, startedAt: new Date() });
        }
      ).catch(err => {
        console.error(`[CONNECT-VISIBLE] ❌ Erro ao iniciar sessão:`, err);
        visibleSessions.delete(id);
      });
      
    } catch (err) {
      console.error('[CONNECT-VISIBLE] Erro ao processar requisição:', err);
      res.status(500).json({ 
        error: 'Erro ao iniciar conexão',
        details: err.message
      });
    }
  });
  
  // 🔹 Rota para fechar sessão visível
  app.post('/api/instances/:id/disconnect-visible', async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!visibleSessions.has(id)) {
        return res.status(404).json({ 
          error: 'Nenhuma sessão visível ativa para esta instância'
        });
      }
      
      const session = visibleSessions.get(id);
      if (session.client) {
        await closeWhatsAppSessionVisible(session.client);
      }
      
      visibleSessions.delete(id);
      
      // Limpa dados no banco
      await supabase
        .from('installations')
        .update({ 
          phone_number: null,
          qr_code: null,
          qr_code_updated_at: null
        })
        .eq('instance_id', id);
      
      res.json({ 
        success: true, 
        message: 'Sessão visível desconectada com sucesso'
      });
      
    } catch (err) {
      console.error('[CONNECT-VISIBLE] Erro ao desconectar:', err);
      res.status(500).json({ 
        error: 'Erro ao desconectar sessão',
        details: err.message
      });
    }
  });
  
  // 🔹 Rota para listar sessões visíveis ativas
  app.get('/api/visible-sessions', (req, res) => {
    const sessions = Array.from(visibleSessions.entries()).map(([id, session]) => ({
      instanceId: id,
      startedAt: session.startedAt,
      hasClient: !!session.client
    }));
    
    res.json({ sessions, count: sessions.length });
  });
  
  console.log('✅ Rotas de WhatsApp visível configuradas:');
  console.log('   POST /api/instances/:id/connect-visible');
  console.log('   POST /api/instances/:id/disconnect-visible');
  console.log('   GET  /api/visible-sessions');
}

export default setupVisibleWhatsAppRoute;
