ALTER TABLE public.materias_geradas
ADD COLUMN IF NOT EXISTS transcription_id uuid REFERENCES public.ic_transcriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_materias_geradas_transcription
ON public.materias_geradas(transcription_id);