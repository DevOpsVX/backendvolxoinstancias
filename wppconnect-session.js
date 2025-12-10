// 🔹 Função para iniciar sessão do WhatsApp com WPPConnect
import wppconnect from '@wppconnect-team/wppconnect';

export async function startWhatsAppSession(instanceId, onQRCode, onStatusChange, onReady) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);
  
  try {
    const client = await wppconnect.create({
      session: instanceId,
      catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
        console.log(`[WPP] ✅ QR CODE GERADO! (tentativa ${attempts})`);
        console.log(`[WPP] QR Code length: ${base64Qr.length}`);
        
        // Callback com QR Code
        if (onQRCode) {
          onQRCode(base64Qr);
        }
      },
      statusFind: (statusSession, session) => {
        console.log(`[WPP] Status da sessão ${session}: ${statusSession}`);
        
        // Callback de mudança de status
        if (onStatusChange) {
          onStatusChange(statusSession);
        }
        
        if (statusSession === 'inChat') {
          console.log(`[WPP] ✅ WhatsApp conectado com sucesso!`);
          if (onReady) {
            onReady(client);
          }
        }
      },
      logQR: false, // Não imprime QR no terminal
      disableWelcome: true, // Desabilita mensagem de boas-vindas
      updatesLog: false, // Desabilita logs de atualização
      autoClose: 60000, // Fecha automaticamente após 60s sem escanear QR
      puppeteerOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });
    
    console.log(`[WPP] Cliente WPPConnect criado com sucesso para ${instanceId}`);
    return client;
    
  } catch (err) {
    console.error(`[WPP] ❌ Erro ao iniciar sessão WhatsApp:`, err);
    throw err;
  }
}

export async function closeWhatsAppSession(client) {
  try {
    if (client) {
      await client.close();
      console.log(`[WPP] Sessão fechada com sucesso`);
    }
  } catch (err) {
    console.error(`[WPP] Erro ao fechar sessão:`, err);
  }
}

export async function getPhoneNumber(client) {
  try {
    const hostDevice = await client.getHostDevice();
    return hostDevice.id.user;
  } catch (err) {
    console.error(`[WPP] Erro ao obter número de telefone:`, err);
    return null;
  }
}
