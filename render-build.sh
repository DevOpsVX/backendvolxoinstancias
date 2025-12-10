#!/bin/bash

echo "🚀 Iniciando build para Render..."

# Instalar dependências do Node.js
echo "📦 Instalando dependências npm..."
npm install

# Instalar Chromium para WPPConnect
echo "🌐 Instalando Chromium para WPPConnect..."
npx puppeteer browsers install chrome

echo "✅ Build concluído com sucesso!"
