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
