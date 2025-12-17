-- Adiciona coluna location_id para armazenar o ID da location do GHL
ALTER TABLE public.installations 
ADD COLUMN IF NOT EXISTS location_id text;

-- Adiciona colunas para armazenar QR code (se não existirem)
ALTER TABLE public.installations 
ADD COLUMN IF NOT EXISTS qr_code text;

ALTER TABLE public.installations 
ADD COLUMN IF NOT EXISTS qr_code_updated_at timestamptz;

-- Cria índice para busca rápida por location_id
CREATE INDEX IF NOT EXISTS idx_installations_location_id 
ON public.installations(location_id);

-- Cria índice para busca rápida por instance_id
CREATE INDEX IF NOT EXISTS idx_installations_instance_id 
ON public.installations(instance_id);
