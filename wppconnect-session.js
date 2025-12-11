// 🔹 Função para iniciar sessão do WhatsApp com WPPConnect
import wppconnect from '@wppconnect-team/wppconnect';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Diretório padrão de cache do Puppeteer no Render
const DEFAULT_CACHE_DIR = '/opt/render/.cache/puppeteer';

function listChromiumCandidates(cacheDir) {
  const possiblePaths = [];

  // 1. Tentar obter via Puppeteer (se já existir localmente)
  try {
    const chromiumPath = puppeteer.executablePath();
    console.log(`[WPP] Puppeteer sugere: ${chromiumPath}`);
    possiblePaths.push(chromiumPath);
  } catch (err) {
    console.log(`[WPP] Puppeteer não retornou caminho:`, err.message);
  }

  // 2. Caminhos presentes no cache configurado
  const chromeDir = path.join(cacheDir, 'chrome');
  if (fs.existsSync(chromeDir)) {
    try {
      const versions = fs.readdirSync(chromeDir);
      console.log(`[WPP] Versões encontradas no cache:`, versions);

      versions.forEach(version => {
        const chromePath = path.join(chromeDir, version, 'chrome-linux64', 'chrome');
        possiblePaths.push(chromePath);
      });
    } catch (err) {
      console.log(`[WPP] Erro ao listar versões:`, err.message);
    }
  }

  // 3. Fallbacks conhecidos
  possiblePaths.push(
    '/opt/render/.cache/puppeteer/chrome/linux-143.0.7499.40/chrome-linux64/chrome',
    '/opt/render/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome'
  );

  return possiblePaths;
}

function ensureChromiumInstalled(cacheDir) {
  console.log(`[WPP] ⚙️ Instalando Chrome via Puppeteer no cache ${cacheDir}...`);
  try {
    execSync('npx puppeteer browsers install chrome', {
      stdio: 'inherit',
      env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir }
    });
    console.log(`[WPP] ✅ Instalação concluída`);
  } catch (err) {
    console.error(`[WPP] ❌ Falha ao instalar Chrome: ${err.message}`);
  }
}

// Função para obter o caminho do Chromium usando Puppeteer
function getChromiumPath() {

  console.log(`[WPP] 🔍 Obtendo caminho do Chromium...`);

  // Usa cache configurado ou padrão do Render
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || DEFAULT_CACHE_DIR;
  console.log(`[WPP] PUPPETEER_CACHE_DIR: ${cacheDir}`);

  const possiblePaths = listChromiumCandidates(cacheDir);
  console.log(`[WPP] Tentando ${possiblePaths.length} possíveis caminhos...`);

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`[WPP] ✅ Chromium encontrado: ${chromePath}`);
      return chromePath;
    } else {
      console.log(`[WPP] ❌ Não existe: ${chromePath}`);
    }
  }

  // Se nenhum foi encontrado, tenta instalar e procurar novamente
  ensureChromiumInstalled(cacheDir);

  const pathsAfterInstall = listChromiumCandidates(cacheDir);
  console.log(`[WPP] Reavaliando ${pathsAfterInstall.length} caminhos após instalação...`);
  for (const chromePath of pathsAfterInstall) {
    if (fs.existsSync(chromePath)) {
      console.log(`[WPP] ✅ Chromium encontrado após instalação: ${chromePath}`);
      return chromePath;
    }
  }

  // Se ainda assim não encontrar, lança erro claro
  throw new Error('Nenhum navegador Chromium/Chrome disponível após tentativa de instalação.');
}

export async function startWhatsAppSession(instanceId, onQRCode, onStatusChange, onReady) {
  console.log(`[WPP] Iniciando sessão WhatsApp para instância: ${instanceId}`);
  
  try {
    console.log(`[WPP] Obtendo caminho do Chromium...`);
    const chromiumPath = getChromiumPath();
    console.log(`[WPP] Chromium path: ${chromiumPath}`);
    
    console.log(`[WPP] Criando cliente WPPConnect...`);
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
      // WPPConnect usa puppeteerOptions.executablePath para apontar para o Chrome/Chromium disponível
      puppeteerOptions: {
        executablePath: chromiumPath,
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
    console.error(`[WPP] Stack trace:`, err.stack);
    console.error(`[WPP] Mensagem de erro:`, err.message);
    
    // Lança erro com mais contexto
    const errorMessage = err.message || 'Erro desconhecido ao iniciar sessão';
    throw new Error(`Falha ao iniciar WPPConnect: ${errorMessage}`);
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
