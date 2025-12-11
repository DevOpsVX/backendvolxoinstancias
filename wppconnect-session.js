// wppconnect-session.js
import wppconnect from '@wppconnect-team/wppconnect';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DEFAULT_CACHE_DIR = '/opt/render/.cache/puppeteer';

/**
 * Garante que o Chromium/Chrome do Puppeteer está realmente instalado
 * e retorna o executablePath válido.
 */
async function ensureChromiumInstalled() {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || DEFAULT_CACHE_DIR;
  process.env.PUPPETEER_CACHE_DIR = cacheDir;

  console.log(`[WPP] 📁 Usando cache Puppeteer em: ${cacheDir}`);

  // 1. Tenta usar o executablePath atual
  let executablePath = '';
  try {
    executablePath = puppeteer.executablePath();
    console.log(`[WPP] 🔍 Puppeteer executável sugerido: ${executablePath}`);
  } catch (err) {
    console.log('[WPP] ⚠️ puppeteer.executablePath() falhou:', err.message);
  }

  if (executablePath && fs.existsSync(executablePath)) {
    console.log('[WPP] ✅ Chromium encontrado (já instalado).');
    return executablePath;
  }

  // 2. Se não existir, tentamos instalar agora
  console.log('[WPP] ⚙️ Chromium não encontrado. Instalando via `npx puppeteer browsers install chrome`...');
  try {
    execSync('npx puppeteer browsers install chrome', {
      stdio: 'inherit',
      env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir }
    });
  } catch (err) {
    console.error('[WPP] ❌ Falha ao instalar Chrome via Puppeteer:', err.message);
  }

  // 3. Depois da instalação, checamos de novo
  try {
    executablePath = puppeteer.executablePath();
    console.log(`[WPP] 🔁 Novo executablePath depois da instalação: ${executablePath}`);
  } catch (err) {
    console.log('[WPP] ⚠️ puppeteer.executablePath() falhou após instalação:', err.message);
  }

  if (executablePath && fs.existsSync(executablePath)) {
    console.log('[WPP] ✅ Chromium encontrado após instalação.');
    return executablePath;
  }

  // 4. Última tentativa: varrer o diretório de cache manualmente
  const chromeDir = path.join(cacheDir, 'chrome');
  if (fs.existsSync(chromeDir)) {
    const versions = fs.readdirSync(chromeDir);
    console.log('[WPP] 🔎 Versões encontradas no cache:', versions);

    for (const v of versions) {
      const candidate = path.join(chromeDir, v, 'chrome-linux64', 'chrome');
      if (fs.existsSync(candidate)) {
        console.log(`[WPP] ✅ Chromium encontrado manualmente em: ${candidate}`);
        return candidate;
      }
    }
  }

  // 5. Se chegou aqui, não tem navegador mesmo
  throw new Error(
    `Nenhum navegador Chromium/Chrome disponível em ${cacheDir}. Verifique se o comando "npx puppeteer browsers install chrome" está funcionando no ambiente.`
  );
}

/**
 * Inicia uma sessão do WhatsApp usando WPPConnect.
 *
 * @param {string} instanceId
 * @param {(qrBase64: string) => void} [onQRCode]
 * @param {(status: string) => void} [onStatusChange]
 * @param {(client: any) => void} [onReady]
 */
export async function startWhatsAppSession(instanceId, onQRCode, onStatusChange, onReady) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);

  let executablePath;
  try {
    executablePath = await ensureChromiumInstalled();
  } catch (err) {
    console.error('[WPP] ❌ Não foi possível garantir instalação do Chromium:', err.message);
    throw new Error(`Falha ao iniciar WPPConnect: ${err.message}`);
  }

  console.log(`[WPP] 🚀 Usando executablePath: ${executablePath}`);

  try {
    const client = await wppconnect.create({
      session: instanceId,

      // Caminho real do navegador
      browserPathExecutable: executablePath,

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
        console.log(`[WPP] ✅ QR CODE GERADO! (tentativa ${attempts})`);
        if (onQRCode) onQRCode(base64Qr || '');
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

    console.log(`[WPP] Cliente WPPConnect criado com sucesso para ${instanceId}`);
    return client;
  } catch (err) {
    console.error('[WPP] ❌ Erro ao iniciar sessão WhatsApp:', err);
    const msg = err?.message || 'Erro desconhecido ao iniciar sessão';
    throw new Error(`Falha ao iniciar WPPConnect: ${msg}`);
  }
}

/**
 * Fecha a sessão do WhatsApp.
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
 * Obtém o número de telefone do WhatsApp conectado.
 */
export async function getPhoneNumber(client) {
  try {
    const wid = await client.getWid();
    console.log('[WPP] WID obtido:', wid);
    const phoneNumber = wid ? wid.user || wid._serialized.split('@')[0] : null;
    console.log('[WPP] Número extraído:', phoneNumber);
    return phoneNumber;
  } catch (err) {
    console.error('[WPP] Erro ao obter número (getWid):', err);
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
