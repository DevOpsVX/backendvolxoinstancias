#!/bin/bash

echo "========================================="
echo "🚀 Iniciando Backend Volxo Instâncias"
echo "========================================="

# Função para verificar se Chrome existe
check_chrome() {
    local chrome_path="$1"
    if [ -f "$chrome_path" ]; then
        echo "✅ Chrome encontrado em: $chrome_path"
        return 0
    fi
    return 1
}

# Verificar se Chrome já está instalado
echo "🔍 Verificando instalação do Chrome..."

# Lista de caminhos possíveis (prioriza cache dentro do projeto)
CHROME_PATHS=(
    "/app/.puppeteer-cache/chrome/linux-*/chrome-linux64/chrome"
    "/app/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome"
    "/opt/render/project/src/.puppeteer-cache/chrome/linux-*/chrome-linux64/chrome"
    "/opt/render/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome"
    "/usr/bin/chromium"
    "/usr/bin/chromium-browser"
    "/usr/bin/google-chrome"
    "/usr/bin/google-chrome-stable"
)

CHROME_FOUND=false
for path_pattern in "${CHROME_PATHS[@]}"; do
    # Expandir glob pattern
    for path in $path_pattern; do
        if check_chrome "$path"; then
            export PUPPETEER_EXECUTABLE_PATH="$path"
            CHROME_FOUND=true
            break 2
        fi
    done
done

# Se não encontrou, tentar instalar
if [ "$CHROME_FOUND" = false ]; then
    echo "⚠️  Chrome não encontrado. Instalando..."
    
    # Definir diretório de cache (dentro do projeto para persistir no deploy)
    export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-/app/.puppeteer-cache}"
    mkdir -p "$PUPPETEER_CACHE_DIR"
    
    echo "📦 Cache do Puppeteer: $PUPPETEER_CACHE_DIR"
    echo "🔽 Baixando Chrome via Puppeteer..."
    
    # Tentar instalar Chrome
    if npx puppeteer browsers install chrome; then
        echo "✅ Chrome instalado com sucesso!"
        
        # Procurar Chrome recém-instalado
        for path_pattern in "${CHROME_PATHS[@]}"; do
            for path in $path_pattern; do
                if check_chrome "$path"; then
                    export PUPPETEER_EXECUTABLE_PATH="$path"
                    CHROME_FOUND=true
                    break 2
                fi
            done
        done
    else
        echo "❌ Falha ao instalar Chrome via Puppeteer"
    fi
fi

# Verificar resultado final
if [ "$CHROME_FOUND" = true ]; then
    echo "========================================="
    echo "✅ Chrome configurado!"
    echo "📍 Path: $PUPPETEER_EXECUTABLE_PATH"
    echo "========================================="
else
    echo "========================================="
    echo "❌ ERRO: Chrome não pôde ser instalado"
    echo "========================================="
    echo "⚠️  O servidor será iniciado, mas a geração de QR Code pode falhar."
    echo "⚠️  Verifique os logs para mais detalhes."
fi

# Iniciar servidor Node.js
echo ""
echo "🚀 Iniciando servidor Node.js..."
echo "========================================="
exec node server.js
