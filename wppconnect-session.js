// wppconnect-session.js

import wppconnect from '@wppconnect-team/wppconnect';
import puppeteer from 'puppeteer';

/**
 * Inicia uma sessão do WhatsApp usando WPPConnect.
 */
export async function startWhatsAppSession(
  instanceId,
  onQRCode,
  onStatusChange,
  onReady
) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);

  // Pega o caminho EXATO do Chrome baixado no postinstall
  const executablePath = puppeteer.executablePath();
  console.log(`[WPP] 🔍 executablePath: ${executablePath}`);

  try {
    console.log('[WPP] Criando cliente WPPConnect...');

    const client = await wppconnect.create({
      session: instanceId,

      // 👇 Caminho REAL do Chrome/Chromium
      browserPathExecutable: executablePath,

      // Obrigatórios para o Render
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],

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
        console.log(`[WPP] ✅ QR CODE GERADO (tentativa ${attempts})`);
        if (onQRCode) onQRCode(base64Qr);
      },

      statusFind: (statusSession, session) => {
        console.log(`[WPP] Status da sessão ${session}: ${statusSession}`);

        if (onStatusChange) onStatusChange(statusSession);

        if (statusSession === 'inChat') {
          console.log('[WPP] 🎉 WhatsApp conectado com sucesso!');
          if (onReady) onReady(client);
        }
      },

      logQR: false,
      disableWelcome: true,
      updatesLog: false,
      autoClose: 180000,
      waitForLogin: true,
      createPathFileToken: true
    });

    console.log(`[WPP] Cliente WPPConnect criado com sucesso: ${instanceId}`);
    return client;

  } catch (err) {
    console.error('[WPP] ❌ ERRO AO INICIAR SESSÃO:', err);
    throw new Error(`Falha ao iniciar WPPConnect: ${err?.message}`);
  }
}

/**
 * Fecha sessão
 */
export async function closeWhatsAppSession(client) {
  try {
    if (client) {
      await client.close();
      console.log('[WPP] Sessão encerrada com sucesso');
    }
  } catch (err) {
    console.error('[WPP] Erro ao fechar sessão:', err);
  }
}

/**
 * Obtém número do WhatsApp
 */
export async function getPhoneNumber(client) {
  try {
    const wid = await client.getWid();
    console.log('[WPP] WID:', wid);

    return wid ? wid.user || wid._serialized.split('@')[0] : null;

  } catch (err) {
    console.error('[WPP] Erro ao obter número com getWid:', err);

    try {
      const hostDevice = await client.getHostDevice();
      console.log('[WPP] Host device:', hostDevice);
      return hostDevice?.id?.user || hostDevice?.wid?.user || null;
    } catch (err2) {
      console.error('[WPP] Erro no método alternativo:', err2);
      return null;
    }
  }
}
