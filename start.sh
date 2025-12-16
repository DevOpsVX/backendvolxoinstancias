#!/bin/bash

echo "========================================="
echo "🚀 Iniciando Backend Volxo Instâncias"
echo "========================================="

# Detectar ambiente automaticamente
if [ -d "/app" ] && [ -w "/app" ]; then
    # Ambiente Docker
    BASE_DIR="/app"
    echo "🐳 Ambiente: Docker"
else
    # Ambiente Render nativo
    BASE_DIR="/opt/render/project/src"
    echo "☁️  Ambiente: Render (Node.js nativo)"
fi

echo "📁 Diretório base: $BASE_DIR"

# Configurar cache do Puppeteer
export PUPPETEER_CACHE_DIR="${BASE_DIR}/.puppeteer-cache"
echo "📦 Cache do Puppeteer: $PUPPETEER_CACHE_DIR"

# Função para verificar se Chrome é executável
check_chrome() {
    local chrome_path="$1"
    if [ -f "$chrome_path" ] && [ -x "$chrome_path" ]; then
        return 0
    fi
    return 1
}

echo "🔍 Verificando instalação do Chrome..."

# Caminhos possíveis do Chrome (adaptados ao ambiente)
CHROME_PATHS=(
    "${BASE_DIR}/.puppeteer-cache/chrome/linux-*/chrome-linux64/chrome"
    "${BASE_DIR}/puppeteer-cache/chrome/linux-*/chrome-linux64/chrome"
    "/usr/bin/chromium"
    "/usr/bin/chromium-browser"
    "/usr/bin/google-chrome"
    "/usr/bin/google-chrome-stable"
)

CHROME_FOUND=false

# Procurar Chrome nos caminhos possíveis
for path_pattern in "${CHROME_PATHS[@]}"; do
    for path in $path_pattern; do
        if check_chrome "$path"; then
            echo "✅ Chrome encontrado em: $path"
            export PUPPETEER_EXECUTABLE_PATH="$path"
            CHROME_FOUND=true
            break 2
        fi
    done
done

# Se não encontrou, tentar instalar
if [ "$CHROME_FOUND" = false ]; then
    echo "⚠️  Chrome não encontrado. Instalando..."
    
    # Criar diretório de cache
    mkdir -p "$PUPPETEER_CACHE_DIR"
    
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
    echo "✅ Chrome configurado!"
    echo "📍 Caminho: $PUPPETEER_EXECUTABLE_PATH"
else
    echo "========================================="
    echo "❌ ERRO: Chrome não pôde ser instalado"
    echo "========================================="
    echo "⚠️  O servidor será iniciado, mas a geração de QR Code pode falhar."
    echo "⚠️  Verifique os logs para mais detalhes."
fi

echo "🚀 Iniciando servidor Node.js..."
echo "========================================="

# Iniciar servidor
exec node server.js
