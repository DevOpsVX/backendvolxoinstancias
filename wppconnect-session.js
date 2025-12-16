// wppconnect-session.js
import wppconnect from '@wppconnect-team/wppconnect';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Diretório padrão de cache no Render
const DEFAULT_CACHE_DIR = '/opt/render/.cache/puppeteer';

function getCacheDir() {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || DEFAULT_CACHE_DIR;
  console.log(`[WPP] 📁 Usando cache Puppeteer em: ${cacheDir}`);
  return cacheDir;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Garante que o Chrome/Chromium do Puppeteer está instalado
 * e retorna o executablePath válido.
 */
function getChromiumExecutable() {
  const cacheDir = getCacheDir();
  ensureDir(cacheDir);

  // PRIORIDADE 1: Usar Chromium do sistema (instalado via apt-get no Docker)
  const systemChromiumPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ];

  console.log('[WPP] 🔍 Verificando Chromium do sistema...');
  for (const chromePath of systemChromiumPaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`[WPP] ✅ Chromium do sistema encontrado: ${chromePath}`);
      return chromePath;
    }
  }

  console.log('[WPP] ⚠️ Chromium do sistema não encontrado, tentando Puppeteer...');
  
  // PRIORIDADE 2: Usar Puppeteer executablePath
  let exePath = '';
  try {
    exePath = puppeteer.executablePath();
    console.log(`[WPP] Puppeteer executável sugerido: ${exePath}`);
  } catch (err) {
    console.log('[WPP] puppeteer.executablePath() lançou erro:', err.message);
  }

  // Se o caminho sugerido existe, usa ele
  if (exePath && fs.existsSync(exePath)) {
    console.log(`[WPP] ✅ Chromium do Puppeteer já existe em: ${exePath}`);
    return exePath;
  }

  console.log('[WPP] ⚙️ Chromium não encontrado. Instalando via `npx puppeteer browsers install chrome`...');

  try {
    execSync('npx puppeteer browsers install chrome', {
      stdio: 'inherit',
      env: {
        ...process.env,
        PUPPETEER_CACHE_DIR: cacheDir
      }
    });
  } catch (err) {
    console.error('[WPP] ❌ Falha ao instalar Chrome via Puppeteer:', err.message);
    throw new Error('Não foi possível instalar o Chrome com puppeteer.');
  }

  // Depois da instalação, tenta de novo
  try {
    exePath = puppeteer.executablePath();
    console.log(`[WPP] 🔁 Novo executablePath depois da instalação: ${exePath}`);
  } catch (err) {
    console.error('[WPP] ❌ puppeteer.executablePath() falhou após instalação:', err.message);
    throw new Error('Não foi possível obter o caminho do Chrome após instalação.');
  }

  if (!exePath || !fs.existsSync(exePath)) {
    console.error('[WPP] ❌ Mesmo após instalação, executablePath não existe:', exePath);
    throw new Error('Chrome não encontrado mesmo após instalação.');
  }

  console.log(`[WPP] ✅ Chromium encontrado após instalação.`);
  console.log(`[WPP] 🚀 Usando executablePath: ${exePath}`);
  return exePath;
}

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
    const executablePath = getChromiumExecutable();

    console.log('[WPP] Criando cliente WPPConnect...');
    const client = await wppconnect.create({
      session: instanceId,

      // Captura QR code (base64) e envia pro callback
      catchQR: async (base64Qr, asciiQR, attempts, urlCode) => {
        try {
          console.log(`[WPP] ✅ QR CODE GERADO! (tentativa ${attempts})`);
          console.log(`[WPP] Tamanho do QR base64: ${base64Qr ? base64Qr.length : 0}`);

          if (typeof onQRCode === 'function') {
            await onQRCode(base64Qr);
          }
        } catch (err) {
          console.error('[WPP] ❌ Erro no callback onQRCode:', err);
        }
      },

      // Status da sessão
      statusFind: (statusSession, session) => {
        console.log(`[WPP] Status da sessão ${session}: ${statusSession}`);

        if (typeof onStatusChange === 'function') {
          try {
            onStatusChange(statusSession);
          } catch (err) {
            console.error('[WPP] ❌ Erro no callback onStatusChange:', err);
          }
        }

        if (statusSession === 'inChat' || statusSession === 'isLogged') {
          console.log('[WPP] ✅ WhatsApp conectado com sucesso!');
          if (typeof onReady === 'function') {
            try {
              onReady(client);
            } catch (err) {
              console.error('[WPP] ❌ Erro no callback onReady:', err);
            }
          }
        }

        if (statusSession === 'qrReadError') {
          console.warn('[WPP] ❌ Erro ao ler QR Code (qrReadError)');
        }

        if (statusSession === 'autocloseCalled' || statusSession === 'browserClose') {
          console.warn('[WPP] ⚠️ Sessão fechada automaticamente ou browser fechado.');
        }
      },

      // Configurações gerais
      logQR: false,           // não imprime QR no terminal
      disableWelcome: true,   // sem mensagem de boas-vindas
      updatesLog: false,

      // IMPORTANTE: não fechar automaticamente pra dar tempo do usuário ler o QR
      autoClose: 0,           // 0 = sem auto close
      waitForLogin: true,
      createPathFileToken: true,

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
          '--single-process'
        ]
      }
    });

    console.log(`[WPP] Cliente WPPConnect criado com sucesso para ${instanceId}`);
    return client;
  } catch (err) {
    console.error('[WPP] ❌ Erro ao iniciar sessão WhatsApp:', err);
    const message = err && err.message ? err.message : 'Erro desconhecido ao iniciar sessão';
    throw new Error(`Falha ao iniciar WPPConnect: ${message}`);
  }
}

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

export async function getPhoneNumber(client) {
  try {
    const wid = await client.getWid();
    console.log('[WPP] WID obtido:', wid);

    const phoneNumber = wid ? (wid.user || (wid._serialized ? wid._serialized.split('@')[0] : null)) : null;
    console.log('[WPP] Número extraído:', phoneNumber);

    return phoneNumber;
  } catch (err) {
    console.error('[WPP] Erro ao obter número de telefone:', err);

    try {
      const hostDevice = await client.getHostDevice();
      console.log('[WPP] Host device:', hostDevice);
      return hostDevice?.id?.user || hostDevice?.wid?.user || null;
    } catch (err2) {
      console.error('[WPP] Erro no método alternativo getHostDevice:', err2);
      return null;
    }
  }
}
