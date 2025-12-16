# ✅ Checklist Completo - Configuração do Render

## 🔍 Problema Identificado

O erro mostra que o Puppeteer está tentando usar caminho antigo:
```
Browser was not found at the configured executablePath
(/opt/render/.cache/puppeteer/.../chrome)
```

**Causas possíveis:**
1. ❌ Variável `PUPPETEER_EXECUTABLE_PATH` setada no Render (caminho antigo)
2. ❌ `start.sh` não está sendo executado
3. ❌ Deploy sem rebuild limpo (usando cache antigo)

---

## ✅ CHECKLIST OBRIGATÓRIO

### 1️⃣ Verificar Variáveis de Ambiente no Render

**Onde:** Render Dashboard → Seu Service → Environment

**O que verificar:**

| Variável | Valor Correto | Ação |
|----------|---------------|------|
| `PUPPETEER_CACHE_DIR` | `/app/.puppeteer-cache` | ✅ Deve existir |
| `PUPPETEER_EXECUTABLE_PATH` | **NÃO DEVE EXISTIR** | ❌ **APAGAR se existir** |

**⚠️ IMPORTANTE:**
- Se `PUPPETEER_EXECUTABLE_PATH` existir no Render, **APAGUE**!
- O código usa: `process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath()`
- Se a env var existir, ela sempre ganha e força o caminho errado

**Como corrigir:**
1. Acesse Render → Environment
2. Procure por `PUPPETEER_EXECUTABLE_PATH`
3. Se existir, clique em **Delete**
4. Salve as mudanças

---

### 2️⃣ Verificar Start Command

**Onde:** Render Dashboard → Seu Service → Settings → Start Command

**Valor CORRETO:**
```bash
bash start.sh
```

**ou:**
```bash
./start.sh
```

**❌ ERRADO:**
```bash
node server.js
npm start
```

**Por quê?**
- Se Start Command for `node server.js`, o `start.sh` **nunca roda**
- O `start.sh` é responsável por definir `PUPPETEER_EXECUTABLE_PATH`
- Sem ele, o caminho fica errado

**Como corrigir:**
1. Acesse Render → Settings
2. Procure por "Start Command"
3. Mude para: `bash start.sh`
4. Salve

---

### 3️⃣ Verificar Build Command

**Onde:** Render Dashboard → Seu Service → Settings → Build Command

**Valor CORRETO (se usando Docker):**
```
(deixe vazio ou use o padrão do Render para Docker)
```

**Valor CORRETO (se NÃO usando Docker):**
```bash
npm install
```

**Por quê?**
- Com Docker, o Render usa o Dockerfile automaticamente
- O `postinstall` no package.json já instala o Chrome

---

### 4️⃣ Fazer Deploy Limpo

**OBRIGATÓRIO para aplicar mudanças!**

**Como fazer:**

1. **Opção 1: Clear Build Cache (Recomendado)**
   - Render Dashboard → Seu Service
   - Clique em "Manual Deploy"
   - Marque "Clear build cache"
   - Clique em "Deploy"

2. **Opção 2: Forçar Rebuild**
   - Faça qualquer mudança mínima no Dockerfile
   - Commit e push
   - Render fará rebuild completo

**⚠️ IMPORTANTE:**
- Sem rebuild limpo, o Render pode usar imagem antiga
- Cache antigo pode ter o caminho errado

---

### 5️⃣ Validação no Render Shell

**Onde:** Render Dashboard → Seu Service → Shell

**Execute estes comandos:**

```bash
# 1. Verificar variáveis de ambiente
echo "PUPPETEER_CACHE_DIR: $PUPPETEER_CACHE_DIR"
echo "PUPPETEER_EXECUTABLE_PATH: $PUPPETEER_EXECUTABLE_PATH"

# 2. Verificar executablePath do Puppeteer
node -e "const p=require('puppeteer'); console.log('puppeteer.executablePath():', p.executablePath())"

# 3. Verificar se Chrome existe
ls -la /app/.puppeteer-cache/chrome || echo "❌ Chrome não encontrado"

# 4. Verificar se start.sh existe e tem permissão
ls -la /app/start.sh
```

**Resultados ESPERADOS:**

```
PUPPETEER_CACHE_DIR: /app/.puppeteer-cache
PUPPETEER_EXECUTABLE_PATH: (vazio ou /app/.puppeteer-cache/.../chrome)
puppeteer.executablePath(): /app/.puppeteer-cache/chrome/linux-143.0.7499.40/chrome-linux64/chrome
drwxr-xr-x ... /app/.puppeteer-cache/chrome/
-rwxr-xr-x ... /app/start.sh
```

**❌ Se aparecer `/opt/render/.cache/puppeteer`:**
- Variável de ambiente está errada no Render
- Ou deploy não foi limpo

---

## 📋 Resumo das Configurações Corretas

### Arquivos do Projeto (já corretos)

✅ **package.json:**
```json
{
  "scripts": {
    "start": "node server.js",
    "postinstall": "npx puppeteer browsers install chrome"
  }
}
```

✅ **Dockerfile:**
```dockerfile
ENV PUPPETEER_CACHE_DIR=/app/.puppeteer-cache
RUN mkdir -p $PUPPETEER_CACHE_DIR && \
    npx puppeteer browsers install chrome
CMD ["/app/start.sh"]
```

✅ **start.sh:**
```bash
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-/app/.puppeteer-cache}"
export PUPPETEER_EXECUTABLE_PATH="$path"  # path encontrado
exec node server.js
```

✅ **render.yaml:**
```yaml
envVars:
  - key: PUPPETEER_CACHE_DIR
    value: /app/.puppeteer-cache
```

### Configurações do Render

| Item | Valor Correto |
|------|---------------|
| **Start Command** | `bash start.sh` |
| **Build Command** | (vazio para Docker) |
| **PUPPETEER_CACHE_DIR** | `/app/.puppeteer-cache` |
| **PUPPETEER_EXECUTABLE_PATH** | **NÃO DEVE EXISTIR** |

---

## 🎯 Ordem de Execução (Passo a Passo)

Siga esta ordem EXATA:

1. ✅ **Apagar `PUPPETEER_EXECUTABLE_PATH`** do Render (se existir)
2. ✅ **Setar `PUPPETEER_CACHE_DIR=/app/.puppeteer-cache`** no Render
3. ✅ **Confirmar Start Command = `bash start.sh`**
4. ✅ **Clear build cache & deploy**
5. ✅ **Aguardar build completo** (~10-15 min)
6. ✅ **Executar comandos de validação** no Shell
7. ✅ **Testar geração de QR Code**

---

## 🔍 Diagnóstico de Problemas

### Se ainda aparecer `/opt/render/.cache/puppeteer`:

**Causa 1: Variável de ambiente não foi removida**
- Solução: Apague `PUPPETEER_EXECUTABLE_PATH` do Render
- Faça deploy limpo

**Causa 2: start.sh não está rodando**
- Solução: Mude Start Command para `bash start.sh`
- Faça deploy limpo

**Causa 3: Deploy não foi limpo**
- Solução: Clear build cache & deploy
- Ou force rebuild mudando algo no Dockerfile

**Causa 4: render.yaml com valor antigo**
- Solução: Já corrigido no último commit
- Faça pull e deploy

---

## 📸 O Que Enviar Para Debug

Se ainda não funcionar, envie prints de:

1. **Render → Environment** (lista de variáveis, sem valores secretos)
2. **Render → Settings** (Start Command e Build Command)
3. **Render → Shell** (resultado dos 4 comandos de validação)
4. **Render → Logs** (logs de build e runtime)

Com isso, posso identificar exatamente onde está o problema.

---

## ✅ Correção Aplicada no Último Commit

**Arquivo:** `render.yaml`

**ANTES (errado):**
```yaml
envVars:
  - key: PUPPETEER_CACHE_DIR
    value: /app/.cache/puppeteer  # ❌ Caminho antigo
```

**DEPOIS (correto):**
```yaml
envVars:
  - key: PUPPETEER_CACHE_DIR
    value: /app/.puppeteer-cache  # ✅ Caminho novo
```

**Ação necessária:**
- Fazer pull do repositório
- Fazer deploy limpo no Render

---

**Status:** ✅ Checklist completo criado  
**Próximo passo:** Seguir os 7 passos na ordem exata
