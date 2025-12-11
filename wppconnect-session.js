// wppconnect-session.ts

import wppconnect from '@wppconnect-team/wppconnect';
import puppeteer from 'puppeteer';

export async function startWhatsAppSession(
  instanceId: string,
  onQRCode?: (base64Qr: string) => void,
  onStatusChange?: (status: string) => void,
  onReady?: (client: any) => void,
) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);

  // 1. Descobrir o executável que o Puppeteer baixou
  console.log('[WPP] 🔍 Obtendo executablePath via Puppeteer...');
  const executablePath = puppeteer.executablePath();
  console.log(`[WPP] ✅ executablePath resolvido: ${executablePath}`);

  try {
    console.log('[WPP] Criando cliente WPPConnect...');

    const client = await wppconnect.create({
      session: instanceId,

      // 🔴 ESSA LINHA É A MAIS IMPORTANTE
      browserPathExecutable: executablePath,

      // Argumentos obrigatórios para rodar no Render (sem sandbox)
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],

      // Garante que o puppeteer-extra dentro do wppconnect também use esse executável
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
          '--disable-gpu',
        ],
      },

      catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
        console.log(`[WPP] ✅ QR CODE GERADO! (tentativa ${attempts})`);
        console.log(`[WPP] QR Code length: ${base64Qr?.length}`);

        if (onQRCode) onQRCode(base64Qr);
      },

      statusFind: (statusSession, session) => {
        console.log(`[WPP] Status da sessão ${session}: ${statusSession}`);

        if (onStatusChange) onStatusChange(statusSession);

        if (statusSession === 'inChat') {
          console.log('[WPP] ✅ WhatsApp conectado com sucesso!');
          if (onReady) onReady(client);
        }
      },

      logQR: false,
      disableWelcome: true,
      updatesLog: false,
      autoClose: 180000,
      waitForLogin: true,
      createPathFileToken: true,
    });

    console.log(`[WPP] Cliente WPPConnect criado com sucesso para ${instanceId}`);
    return client;
  } catch (err: any) {
    console.error('[WPP] ❌ Erro ao iniciar sessão WhatsApp:', err);
    throw new Error(`Falha ao iniciar WPPConnect: ${err?.message || 'Erro desconhecido'}`);
  }
}

export async function closeWhatsAppSession(client: any) {
  try {
    if (client) {
      await client.close();
      console.log('[WPP] Sessão fechada com sucesso');
    }
  } catch (err) {
    console.error('[WPP] Erro ao fechar sessão:', err);
  }
}

export async function getPhoneNumber(client: any) {
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
