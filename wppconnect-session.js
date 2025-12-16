// wppconnect-session.js
import wppconnect from '@wppconnect-team/wppconnect';
import puppeteer from 'puppeteer';

/**
 * Inicia sessão do WhatsApp com WPPConnect
 * @param {string} instanceId
 * @param {(base64Qr: string) => void} onQRCode
 * @param {(status: string) => void} onStatusChange
 * @param {(client: any) => void} onReady
 */
export async function startWhatsAppSession(instanceId, onQRCode, onStatusChange, onReady) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);

  try {
    // Obtém executablePath: env var > puppeteer.executablePath() > undefined
    let execPath;
    try {
      execPath = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
    } catch (err) {
      console.log('[WPP] ⚠️ puppeteer.executablePath() falhou:', err.message);
      execPath = undefined; // Deixa WPPConnect decidir
    }
    
    console.log('[WPP] Criando cliente WPPConnect com configuração simplificada...');
    console.log(`[WPP] Puppeteer executablePath: ${execPath || 'auto-detect'}`);
    console.log(`[WPP] PUPPETEER_CACHE_DIR: ${process.env.PUPPETEER_CACHE_DIR || 'not set'}`);
    
    const client = await wppconnect.create({
      session: instanceId,

      // Captura QR code (base64) e envia pro callback
      catchQR: async (base64Qr, asciiQR, attempts, urlCode) => {
        try {
          console.log(`[WPP] ✅ QR CODE GERADO! (tentativa ${attempts})`);
          console.log(`[WPP] QR Code length: ${base64Qr?.length || 0}`);
          
          if (onQRCode) {
            await onQRCode(base64Qr);
          }
        } catch (err) {
          console.error('[WPP] Erro no callback catchQR:', err);
        }
      },

      // Callback de mudança de status
      statusFind: (statusSession, session) => {
        console.log(`[WPP] Status da sessão ${session}: ${statusSession}`);
        
        if (onStatusChange) {
          onStatusChange(statusSession);
        }

        // Se sessão foi fechada
        if (statusSession === 'browserClose' || statusSession === 'qrReadError') {
          console.log(`[WPP] ❌ Sessão fechada: ${statusSession}`);
        }
      },

      // Configurações do Puppeteer
      puppeteerOptions: {
        headless: true,
        // Usa execPath calculado (env var > puppeteer.executablePath() > undefined)
        executablePath: execPath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process', // Importante para Render (pouca memória)
        ],
      },

      // Desabilita logs excessivos
      logQR: false,
      disableWelcome: true,
      updatesLog: false,
    });

    console.log('[WPP] ✅ Cliente WPPConnect criado com sucesso!');

    // Aguarda cliente estar pronto
    await client.isConnected();
    console.log('[WPP] ✅ Cliente conectado ao WhatsApp!');

    if (onReady) {
      await onReady(client);
    }

    return client;

  } catch (err) {
    console.error(`[WPP] ❌ Erro ao iniciar sessão WhatsApp:`, err);
    console.error(`[WPP] Stack trace:`, err.stack);
    throw err;
  }
}

/**
 * Fecha sessão do WhatsApp
 * @param {any} client
 */
export async function closeWhatsAppSession(client) {
  if (!client) {
    console.log('[WPP] Nenhum cliente para fechar.');
    return;
  }

  try {
    console.log('[WPP] Fechando sessão WhatsApp...');
    await client.close();
    console.log('[WPP] ✅ Sessão fechada com sucesso.');
  } catch (err) {
    console.error('[WPP] Erro ao fechar sessão:', err);
    throw err;
  }
}

/**
 * Obtém número de telefone do cliente conectado
 * @param {any} client
 * @returns {Promise<string>}
 */
export async function getPhoneNumber(client) {
  try {
    const hostDevice = await client.getHostDevice();
    const phoneNumber = hostDevice.id.user || hostDevice.wid?.user || 'unknown';
    console.log(`[WPP] Número obtido: ${phoneNumber}`);
    return phoneNumber;
  } catch (err) {
    console.error('[WPP] Erro ao obter número:', err);
    return 'unknown';
  }
}
