// wppconnect-visible-browser.js
// Função para abrir o navegador Chrome VISÍVEL com QR Code do WhatsApp
import wppconnect from '@wppconnect-team/wppconnect';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';

// Diretório padrão de cache no Render
const DEFAULT_CACHE_DIR = '/opt/render/.cache/puppeteer';

function getCacheDir() {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || DEFAULT_CACHE_DIR;
  console.log(`[WPP-VISIBLE] 📁 Usando cache Puppeteer em: ${cacheDir}`);
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

  console.log('[WPP-VISIBLE] 🔍 Tentando resolver executablePath via puppeteer.executablePath()...');
  let exePath = '';

  try {
    exePath = puppeteer.executablePath();
    console.log(`[WPP-VISIBLE] Puppeteer executável sugerido: ${exePath}`);
  } catch (err) {
    console.log('[WPP-VISIBLE] puppeteer.executablePath() lançou erro:', err.message);
  }

  // Se o caminho sugerido existe, usa ele
  if (exePath && fs.existsSync(exePath)) {
    console.log(`[WPP-VISIBLE] ✅ Chromium já existe em: ${exePath}`);
    return exePath;
  }

  console.log('[WPP-VISIBLE] ⚙️ Chromium não encontrado. Instalando via `npx puppeteer browsers install chrome`...');

  try {
    execSync('npx puppeteer browsers install chrome', {
      stdio: 'inherit',
      env: {
        ...process.env,
        PUPPETEER_CACHE_DIR: cacheDir
      }
    });
  } catch (err) {
    console.error('[WPP-VISIBLE] ❌ Falha ao instalar Chrome via Puppeteer:', err.message);
    throw new Error('Não foi possível instalar o Chrome com puppeteer.');
  }

  // Depois da instalação, tenta de novo
  try {
    exePath = puppeteer.executablePath();
    console.log(`[WPP-VISIBLE] 🔁 Novo executablePath depois da instalação: ${exePath}`);
  } catch (err) {
    console.error('[WPP-VISIBLE] ❌ puppeteer.executablePath() falhou após instalação:', err.message);
    throw new Error('Não foi possível obter o caminho do Chrome após instalação.');
  }

  if (!exePath || !fs.existsSync(exePath)) {
    console.error('[WPP-VISIBLE] ❌ Mesmo após instalação, executablePath não existe:', exePath);
    throw new Error('Chrome não encontrado mesmo após instalação.');
  }

  console.log(`[WPP-VISIBLE] ✅ Chromium encontrado após instalação.`);
  console.log(`[WPP-VISIBLE] 🚀 Usando executablePath: ${exePath}`);
  return exePath;
}

/**
 * Inicia sessão do WhatsApp com WPPConnect em modo VISÍVEL (navegador aberto)
 * Para usar em ambiente de desenvolvimento local onde você pode ver o navegador
 * 
 * @param {string} instanceId - ID da instância
 * @param {(base64Qr: string) => void} onQRCode - Callback quando QR Code é gerado
 * @param {(status: string) => void} onStatusChange - Callback de mudança de status
 * @param {(client: any) => void} onReady - Callback quando WhatsApp está pronto
 * @returns {Promise<any>} Cliente WPPConnect
 */
export async function startWhatsAppSessionVisible(instanceId, onQRCode, onStatusChange, onReady) {
  console.log(`[WPP-VISIBLE] 🌐 Iniciando sessão WhatsApp VISÍVEL para instância: ${instanceId}`);
  console.log(`[WPP-VISIBLE] ⚠️ ATENÇÃO: O navegador Chrome será aberto em uma janela visível!`);

  try {
    const executablePath = getChromiumExecutable();

    console.log('[WPP-VISIBLE] Criando cliente WPPConnect com navegador VISÍVEL...');
    const client = await wppconnect.create({
      session: instanceId,

      // Captura QR code (base64) e envia pro callback
      catchQR: async (base64Qr, asciiQR, attempts, urlCode) => {
        try {
          console.log(`[WPP-VISIBLE] ✅ QR CODE GERADO! (tentativa ${attempts})`);
          console.log(`[WPP-VISIBLE] 📱 Escaneie o QR Code na janela do navegador Chrome que foi aberta!`);
          console.log(`[WPP-VISIBLE] Tamanho do QR base64: ${base64Qr ? base64Qr.length : 0}`);

          if (typeof onQRCode === 'function') {
            await onQRCode(base64Qr);
          }
        } catch (err) {
          console.error('[WPP-VISIBLE] ❌ Erro no callback onQRCode:', err);
        }
      },

      // Status da sessão
      statusFind: (statusSession, session) => {
        console.log(`[WPP-VISIBLE] Status da sessão ${session}: ${statusSession}`);

        if (typeof onStatusChange === 'function') {
          try {
            onStatusChange(statusSession);
          } catch (err) {
            console.error('[WPP-VISIBLE] ❌ Erro no callback onStatusChange:', err);
          }
        }

        if (statusSession === 'inChat' || statusSession === 'isLogged') {
          console.log('[WPP-VISIBLE] ✅ WhatsApp conectado com sucesso!');
          console.log('[WPP-VISIBLE] 🎉 Você pode fechar a janela do navegador agora.');
          if (typeof onReady === 'function') {
            try {
              onReady(client);
            } catch (err) {
              console.error('[WPP-VISIBLE] ❌ Erro no callback onReady:', err);
            }
          }
        }

        if (statusSession === 'qrReadError') {
          console.warn('[WPP-VISIBLE] ❌ Erro ao ler QR Code (qrReadError)');
        }

        if (statusSession === 'autocloseCalled' || statusSession === 'browserClose') {
          console.warn('[WPP-VISIBLE] ⚠️ Sessão fechada automaticamente ou browser fechado.');
        }
      },

      // Configurações gerais
      logQR: true,            // Imprime QR no terminal também
      disableWelcome: true,   // sem mensagem de boas-vindas
      updatesLog: true,       // Mostra logs de atualização

      // IMPORTANTE: não fechar automaticamente pra dar tempo do usuário ler o QR
      autoClose: 0,           // 0 = sem auto close
      waitForLogin: true,
      createPathFileToken: true,

      puppeteerOptions: {
        executablePath,
        headless: false,      // 🔥 NAVEGADOR VISÍVEL! 🔥
        devtools: false,      // Abre DevTools se quiser debugar
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          // Remove --single-process para permitir navegador visível
          '--window-size=1280,720',  // Tamanho da janela
          '--window-position=0,0'    // Posição da janela
        ]
      }
    });

    console.log(`[WPP-VISIBLE] ✅ Cliente WPPConnect criado com sucesso para ${instanceId}`);
    console.log(`[WPP-VISIBLE] 👀 Verifique a janela do navegador Chrome que foi aberta!`);
    return client;
  } catch (err) {
    console.error('[WPP-VISIBLE] ❌ Erro ao iniciar sessão WhatsApp visível:', err);
    const message = err && err.message ? err.message : 'Erro desconhecido ao iniciar sessão';
    throw new Error(`Falha ao iniciar WPPConnect visível: ${message}`);
  }
}

/**
 * Fecha a sessão do WhatsApp
 * @param {any} client - Cliente WPPConnect
 */
export async function closeWhatsAppSessionVisible(client) {
  try {
    if (client) {
      await client.close();
      console.log('[WPP-VISIBLE] Sessão fechada com sucesso');
    }
  } catch (err) {
    console.error('[WPP-VISIBLE] Erro ao fechar sessão:', err);
  }
}

/**
 * Obtém o número de telefone conectado
 * @param {any} client - Cliente WPPConnect
 * @returns {Promise<string|null>} Número de telefone
 */
export async function getPhoneNumberVisible(client) {
  try {
    const wid = await client.getWid();
    console.log('[WPP-VISIBLE] WID obtido:', wid);

    const phoneNumber = wid ? (wid.user || (wid._serialized ? wid._serialized.split('@')[0] : null)) : null;
    console.log('[WPP-VISIBLE] Número extraído:', phoneNumber);

    return phoneNumber;
  } catch (err) {
    console.error('[WPP-VISIBLE] Erro ao obter número de telefone:', err);

    try {
      const hostDevice = await client.getHostDevice();
      console.log('[WPP-VISIBLE] Host device:', hostDevice);
      return hostDevice?.id?.user || hostDevice?.wid?.user || null;
    } catch (err2) {
      console.error('[WPP-VISIBLE] Erro no método alternativo getHostDevice:', err2);
      return null;
    }
  }
}
