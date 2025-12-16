# Use Node.js 22 LTS
FROM node:22-slim

# Instalar dependências necessárias para Chromium/Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
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
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências do Node.js
RUN npm ci --only=production

# IMPORTANTE: Instalar Chrome via Puppeteer ANTES de copiar o código
# Cache DENTRO do projeto para ir junto no deploy do Render
ENV PUPPETEER_CACHE_DIR=/app/.puppeteer-cache
RUN mkdir -p $PUPPETEER_CACHE_DIR && \
    echo "📦 Instalando Chrome via Puppeteer..." && \
    npx puppeteer browsers install chrome && \
    echo "✅ Chrome instalado via Puppeteer" && \
    echo "📁 Verificando instalação:" && \
    find /app -name "chrome" -type f 2>/dev/null | head -5 && \
    ls -la $PUPPETEER_CACHE_DIR || echo "⚠️  Cache dir não encontrado"

# Copiar código da aplicação
COPY . .

# Expor porta (Render usa variável PORT)
EXPOSE 10000

# Copiar script de inicialização
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Comando para iniciar o servidor via script
CMD ["/app/start.sh"]
