# Use Node.js 22 (versão mais recente e compatível com o projeto)
FROM node:22-slim

# Instalar dependências do Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências do Node.js
RUN npm install

# Copiar código da aplicação
COPY . .

# Configurar Puppeteer para usar Chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Criar diretório de cache e instalar Chrome via Puppeteer como backup
RUN mkdir -p $PUPPETEER_CACHE_DIR && \
    npx puppeteer browsers install chrome || echo 'Puppeteer install failed, using system chromium'

# Expor porta (Render usa variável PORT)
EXPOSE 10000

# Comando para iniciar o servidor
CMD ["npm", "start"]
