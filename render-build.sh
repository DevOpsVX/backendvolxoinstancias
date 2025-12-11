#!/bin/bash

set -e  # Para na primeira falha

echo "🚀 Iniciando build para Render..."

# Instalar dependências de sistema necessárias para Chromium
echo "📦 Instalando dependências de sistema..."
# Nota: apt-get pode não funcionar no Render sem permissões sudo
# Se falhar, o Render deve ter uma imagem base com essas dependências
if command -v apt-get &> /dev/null; then
  echo "apt-get disponível, instalando dependências..."
  apt-get update || echo "⚠️ Não foi possível atualizar apt-get (pode precisar de sudo)"
  apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget || echo "⚠️ Falha ao instalar algumas dependências (pode precisar de sudo)"
else
  echo "⚠️ apt-get não disponível, assumindo que dependências já estão instaladas"
fi

# Instalar dependências do Node.js
echo "📦 Instalando dependências npm..."
npm install

# Configurar diretório de cache do Puppeteer
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
echo "📁 PUPPETEER_CACHE_DIR: $PUPPETEER_CACHE_DIR"
mkdir -p $PUPPETEER_CACHE_DIR

# Instalar Chromium para WPPConnect
echo "🌐 Instalando Chromium para WPPConnect..."
npx puppeteer browsers install chrome

# Verificar instalação
if [ $? -eq 0 ]; then
  echo "✅ Chrome instalado com sucesso!"
  echo "📂 Listando conteúdo do cache:"
  ls -la $PUPPETEER_CACHE_DIR/chrome/ 2>/dev/null || echo "⚠️ Diretório chrome não encontrado (pode estar em outro local)"
  
  # Tentar encontrar Chrome instalado
  echo "🔍 Procurando executável do Chrome..."
  find $PUPPETEER_CACHE_DIR -name "chrome" -type f 2>/dev/null | head -5 || echo "⚠️ Chrome não encontrado"
else
  echo "❌ Falha ao instalar Chrome"
  exit 1
fi

echo "✅ Build concluído com sucesso!"
echo ""
echo "=== Resumo da Instalação ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "PUPPETEER_CACHE_DIR: $PUPPETEER_CACHE_DIR"
echo "============================="
