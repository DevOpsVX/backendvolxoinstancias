// 🔹 Função para iniciar sessão do WhatsApp com WPPConnect
import wppconnect from '@wppconnect-team/wppconnect';

// Função para encontrar o caminho do Chromium instalado pelo Puppeteer
function findChromiumPath() {
  console.log(`[WPP] 🔍 Configurando caminho do Chromium...`);
  
  // Caminho onde o Puppeteer instala o Chromium no Render (confirmado nos logs de build)
  const chromiumPath = '/opt/render/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';
  
  console.log(`[WPP] ✅ Usando Chromium: ${chromiumPath}`);
  console.log(`[WPP] 💡 Se houver erro "Could not find Chrome", verifique se o build instalou o Chromium`);
  
  return chromiumPath;
}

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
      autoClose: 180000, // Fecha automaticamente após 180s (3 minutos) sem escanear QR
      waitForLogin: true, // Aguarda login antes de continuar
      createPathFileToken: true, // Cria diretório de tokens automaticamente
      puppeteerOptions: {
        headless: true,
        executablePath: findChromiumPath(),
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
    // WPPConnect usa getWid() para obter o ID do WhatsApp
    const wid = await client.getWid();
    console.log(`[WPP] WID obtido:`, wid);
    
    // Extrai apenas o número (remove @c.us)
    const phoneNumber = wid ? wid.user || wid._serialized.split('@')[0] : null;
    console.log(`[WPP] Número extraído: ${phoneNumber}`);
    
    return phoneNumber;
  } catch (err) {
    console.error(`[WPP] Erro ao obter número de telefone:`, err);
    
    // Tenta método alternativo
    try {
      const hostDevice = await client.getHostDevice();
      console.log(`[WPP] Host device:`, hostDevice);
      return hostDevice?.id?.user || hostDevice?.wid?.user || null;
    } catch (err2) {
      console.error(`[WPP] Erro no método alternativo:`, err2);
      return null;
    }
  }
}
