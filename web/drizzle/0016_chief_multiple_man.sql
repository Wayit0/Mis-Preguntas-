ALTER TABLE "borradores_importacion" ADD COLUMN "origen" text DEFAULT 'importar' NOT NULL;--> statement-breakpoint
ALTER TABLE "preguntas" ADD COLUMN "origen" text DEFAULT 'manual' NOT NULL;