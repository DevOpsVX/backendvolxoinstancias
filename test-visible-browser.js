#!/usr/bin/env node
// test-visible-browser.js
// Script standalone para testar a conexão WhatsApp com navegador visível
// Uso: node test-visible-browser.js [instanceId]

import { startWhatsAppSessionVisible, closeWhatsAppSessionVisible, getPhoneNumberVisible } from './wppconnect-visible-browser.js';

// Pega instanceId da linha de comando ou usa um padrão
const instanceId = process.argv[2] || `test-${Date.now()}`;

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  🧪 TESTE DE CONEXÃO WHATSAPP COM NAVEGADOR VISÍVEL       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`📋 Instance ID: ${instanceId}`);
console.log('⏳ Iniciando conexão...');
console.log('');
console.log('⚠️  ATENÇÃO:');
console.log('   - O navegador Chrome será aberto em uma janela visível');
console.log('   - Escaneie o QR Code que aparecer na tela');
console.log('   - Aguarde a conexão ser estabelecida');
console.log('   - Pressione Ctrl+C para encerrar');
console.log('');
console.log('─────────────────────────────────────────────────────────────');
console.log('');

let client = null;

// Inicia a sessão
startWhatsAppSessionVisible(
  instanceId,
  
  // Callback quando QR Code é gerado
  async (base64Qr) => {
    console.log('');
    console.log('✅ QR CODE GERADO!');
    console.log('📱 Escaneie o QR Code na janela do navegador Chrome');
    console.log(`📊 Tamanho do QR: ${base64Qr.length} caracteres`);
    console.log('');
  },
  
  // Callback de mudança de status
  async (status) => {
    console.log(`📡 Status: ${status}`);
    
    if (status === 'inChat' || status === 'isLogged') {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║  ✅ WHATSAPP CONECTADO COM SUCESSO!                       ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('');
      
      // Obtém número de telefone
      if (client) {
        try {
          const phoneNumber = await getPhoneNumberVisible(client);
          console.log(`📞 Número conectado: ${phoneNumber || 'Não disponível'}`);
        } catch (err) {
          console.error('❌ Erro ao obter número:', err.message);
        }
      }
      
      console.log('');
      console.log('🎉 Você pode fechar a janela do navegador agora.');
      console.log('💡 Pressione Ctrl+C para encerrar este script.');
      console.log('');
    }
    
    if (status === 'qrReadError' || status === 'qrReadFail') {
      console.log('');
      console.log('❌ Erro ao ler QR Code');
      console.log('💡 Um novo QR Code será gerado automaticamente');
      console.log('');
    }
    
    if (status === 'autocloseCalled' || status === 'browserClose') {
      console.log('');
      console.log('⚠️  Navegador fechado ou sessão encerrada');
      console.log('');
    }
  },
  
  // Callback quando pronto
  async (wppClient) => {
    console.log('');
    console.log('🚀 Cliente WPPConnect pronto!');
    console.log('');
    
    client = wppClient;
  }
).then(() => {
  console.log('✅ Sessão iniciada com sucesso!');
  console.log('');
}).catch(err => {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║  ❌ ERRO AO INICIAR SESSÃO                                ║');
  console.error('╚════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error('Detalhes do erro:');
  console.error(err);
  console.error('');
  process.exit(1);
});

// Tratamento de encerramento
process.on('SIGINT', async () => {
  console.log('');
  console.log('');
  console.log('⏹️  Encerrando sessão...');
  
  if (client) {
    try {
      await closeWhatsAppSessionVisible(client);
      console.log('✅ Sessão fechada com sucesso');
    } catch (err) {
      console.error('❌ Erro ao fechar sessão:', err.message);
    }
  }
  
  console.log('👋 Até logo!');
  console.log('');
  process.exit(0);
});

// Mantém o processo rodando
process.stdin.resume();
