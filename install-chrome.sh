#!/bin/bash

echo "🔧 Instalando Chrome para WPPConnect..."

# Define o diretório de cache
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# Cria o diretório se não existir
mkdir -p $PUPPETEER_CACHE_DIR

echo "📁 Diretório de cache: $PUPPETEER_CACHE_DIR"

# Instala o Chrome
echo "⬇️ Baixando e instalando Chrome..."
npx puppeteer browsers install chrome

# Verifica se foi instalado
if [ $? -eq 0 ]; then
  echo "✅ Chrome instalado com sucesso!"
  echo "📂 Listando conteúdo do cache:"
  ls -la $PUPPETEER_CACHE_DIR/chrome/ || echo "Diretório chrome não encontrado"
else
  echo "❌ Falha ao instalar Chrome"
  exit 1
fi
