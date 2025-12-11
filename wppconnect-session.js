// wppconnect-session.js

import wppconnect from '@wppconnect-team/wppconnect';
import puppeteer from 'puppeteer';

/**
 * Inicia uma sessão do WhatsApp usando WPPConnect.
 *
 * @param {string} instanceId - ID da instância (sessão) que você usa no seu sistema
 * @param {(qrBase64: string) => void} [onQRCode] - Callback para quando o QR Code for gerado
 * @param {(status: string) => void} [onStatusChange] - Callback para mudança de status da sessão
 * @param {(client: any) => void} [onReady] - Callback quando a sessão estiver conectada (inChat)
 */
export async function startWhatsAppSession(
  instanceId,
  onQRCode,
  onStatusChange,
  onReady
) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);

  console.log('[WPP] 🔍 Obtendo executablePath via Puppeteer...');
  const executablePath = puppeteer.executablePath();
  console.log(`[WPP] ✅ executablePath resolvido: ${executablePath}`);

  try {
    console.log('[WPP] Criando cliente WPPConnect...');

    const client = await wppconnect.create({
      session: instanceId,

      // 🔴 ESSA LINHA É FUNDAMENTAL: aponta pro Chrome/Chromium baixado pelo Puppeteer
      browserPathExecutable: executablePath,

      // Args para rodar em ambiente como Render (sem sandbox)
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],

      // Garante que o puppeteer interno do WPPConnect use o mesmo executável
      puppeteerOptions: {
        executablePath,
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
      },

      catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
        console.log(`[WPP] ✅ QR CODE GERADO! (tentativa ${attempts})`);
        console.log(`[WPP] QR Code length: ${base64Qr ? base64Qr.length : 0}`);

        if (onQRCode) {
          onQRCode(base64Qr);
        }
      },

      statusFind: (statusSession, session) => {
        console.log(`[WPP] Status da sessão ${session}: ${statusSession}`);

        if (onStatusChange) {
          onStatusChange(statusSession);
        }

        if (statusSession === 'inChat') {
          console.log('[WPP] ✅ WhatsApp conectado com sucesso!');
          if (onReady) {
            onReady(client);
          }
        }
      },

      logQR: false,
      disableWelcome: true,
      updatesLog: false,
      autoClose: 180000, // 3 minutos
      waitForLogin: true,
      createPathFileToken: true
    });

    console.log(`[WPP] Cliente WPPConnect criado com sucesso para ${instanceId}`);
    return client;
  } catch (err) {
    console.error('[WPP] ❌ Erro ao iniciar sessão WhatsApp:', err);
    const message = err?.message || 'Erro desconhecido ao iniciar sessão';
    throw new Error(`Falha ao iniciar WPPConnect: ${message}`);
  }
}

/**
 * Fecha a sessão do WhatsApp.
 *
 * @param {any} client - Instância do client WPPConnect
 */
export async function closeWhatsAppSession(client) {
  try {
    if (client) {
      await client.close();
      console.log('[WPP] Sessão fechada com sucesso');
    }
  } catch (err) {
    console.error('[WPP] Erro ao fechar sessão:', err);
  }
}

/**
 * Obtém o número de telefone da conta conectada.
 *
 * @param {any} client - Instância do client WPPConnect
 * @returns {Promise<string|null>}
 */
export async function getPhoneNumber(client) {
  try {
    const wid = await client.getWid();
    console.log('[WPP] WID obtido:', wid);

    const phoneNumber = wid ? wid.user || wid._serialized.split('@')[0] : null;
    console.log('[WPP] Número extraído:', phoneNumber);

    return phoneNumber;
  } catch (err) {
    console.error('[WPP] Erro ao obter número de telefone (getWid):', err);

    try {
      const hostDevice = await client.getHostDevice();
      console.log('[WPP] Host device:', hostDevice);
      return hostDevice?.id?.user || hostDevice?.wid?.user || null;
    } catch (err2) {
      console.error('[WPP] Erro no método alternativo (getHostDevice):', err2);
      return null;
    }
  }
}
