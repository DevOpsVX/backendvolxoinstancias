# Guia Rápido: Como Aplicar a Migration

## ⚠️ IMPORTANTE: Execute ANTES de fazer deploy do código

A migration precisa ser aplicada no banco de dados **ANTES** de fazer deploy do código atualizado.

---

## Método 1: Via Supabase Dashboard (Recomendado)

### Passo 1: Acessar o SQL Editor
1. Acesse https://supabase.com/dashboard
2. Selecione seu projeto
3. No menu lateral, clique em **"SQL Editor"**

### Passo 2: Executar a Migration
1. Clique em **"New query"**
2. Cole o seguinte SQL:

```sql
-- Adiciona coluna location_provider_id para armazenar o Provider ID da Location no GHL
-- Este ID é diferente do Developer Provider ID e é essencial para enviar mensagens inbound
ALTER TABLE public.installations 
ADD COLUMN IF NOT EXISTS location_provider_id text;

-- Cria índice para busca rápida por location_provider_id
CREATE INDEX IF NOT EXISTS idx_installations_location_provider_id 
ON public.installations(location_provider_id);

-- Adiciona comentário explicativo
COMMENT ON COLUMN public.installations.location_provider_id IS 
'ID do Conversation Provider da Location no GHL (obtido via API /conversations/providers). Diferente do Developer Provider ID.';
```

3. Clique em **"Run"** (ou pressione Ctrl+Enter)
4. Verifique se apareceu **"Success. No rows returned"**

### Passo 3: Verificar a Coluna
Execute este SQL para confirmar que a coluna foi criada:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'installations' 
AND column_name = 'location_provider_id';
```

Deve retornar:
```
column_name            | data_type
-----------------------+-----------
location_provider_id   | text
```

---

## Método 2: Via Manus MCP (Alternativo)

Se preferir usar o Manus MCP:

```bash
manus-mcp-cli tool call apply_migration \
  --server supabase \
  --input '{
    "project_id": "zeamvbuigbqoipfbvxuv",
    "name": "add_location_provider_id",
    "query": "ALTER TABLE public.installations ADD COLUMN IF NOT EXISTS location_provider_id text; CREATE INDEX IF NOT EXISTS idx_installations_location_provider_id ON public.installations(location_provider_id);"
  }'
```

---

## Método 3: Via Supabase CLI (Para Desenvolvedores)

Se você tem o Supabase CLI instalado:

```bash
# 1. Conectar ao projeto
supabase link --project-ref zeamvbuigbqoipfbvxuv

# 2. Aplicar migration
supabase db push --file migration_add_location_provider_id.sql
```

---

## ✅ Verificação Pós-Migration

Após aplicar a migration, verifique se tudo está OK:

### 1. Verificar Estrutura da Tabela
```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'installations'
ORDER BY ordinal_position;
```

Deve incluir a coluna `location_provider_id` do tipo `text`.

### 2. Verificar Índices
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'installations';
```

Deve incluir o índice `idx_installations_location_provider_id`.

---

## 🚀 Próximo Passo

Após aplicar a migration com sucesso:

1. ✅ Migration aplicada
2. ⏭️ **Agora você pode fazer deploy do código atualizado**
3. ⏭️ Reiniciar o servidor (se necessário)
4. ⏭️ Testar as correções

---

## ❌ Rollback (Se Necessário)

Se precisar reverter a migration:

```sql
-- Remove o índice
DROP INDEX IF EXISTS idx_installations_location_provider_id;

-- Remove a coluna
ALTER TABLE public.installations 
DROP COLUMN IF EXISTS location_provider_id;
```

---

## 📞 Problemas?

Se encontrar erros ao aplicar a migration:

1. **Erro: "permission denied"**
   - Verifique se você tem permissões de admin no Supabase
   - Tente via Dashboard (Método 1)

2. **Erro: "relation installations does not exist"**
   - Verifique se está no projeto correto
   - Verifique se a tabela `installations` existe

3. **Erro: "column already exists"**
   - Não é um problema! A migration usa `IF NOT EXISTS`
   - Significa que a coluna já foi criada anteriormente

---

**Criado por**: Manus AI  
**Data**: 09/01/2026
