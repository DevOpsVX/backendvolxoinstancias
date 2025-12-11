# Use Node.js 18 (versão configurada no render.yaml)
FROM node:18-slim

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

# Instalar Chrome via Puppeteer
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN mkdir -p $PUPPETEER_CACHE_DIR && npx puppeteer browsers install chrome

# Expor porta (Render usa variável PORT)
EXPOSE 10000

# Comando para iniciar o servidor
CMD ["npm", "start"]
