ALTER TABLE "borradores_tarea" ADD COLUMN "dibujos" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "entregas" ADD COLUMN "dibujos" jsonb DEFAULT '{}'::jsonb NOT NULL;