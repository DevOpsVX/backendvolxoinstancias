#!/bin/bash

echo "========== INSTALANDO DEPENDÊNCIAS DO CHROMIUM =========="

# Instala dependências necessárias para o Chromium no Ubuntu/Debian
# Estas são as bibliotecas que o Chromium precisa para rodar em headless mode

echo "📦 Instalando bibliotecas do sistema..."

# Atualiza lista de pacotes
apt-get update -y

# Instala dependências do Chromium
apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
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
  lsb-release \
  wget \
  xdg-utils

echo "✅ Dependências do sistema instaladas!"

echo "========== INSTALANDO CHROMIUM VIA PUPPETEER =========="

# Instala o Chromium via Puppeteer
npx puppeteer browsers install chrome

echo "✅ Chromium instalado com sucesso!"

# Lista o executável instalado
echo "📍 Localização do Chromium:"
find ~/.cache/puppeteer -name "chrome" -type f 2>/dev/null || echo "Chromium não encontrado no cache"

echo "========== BUILD CONCLUÍDO =========="
