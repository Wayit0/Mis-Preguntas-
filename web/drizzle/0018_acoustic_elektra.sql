ALTER TABLE "preguntas" ADD COLUMN "adoptada_de_id" integer;--> statement-breakpoint
ALTER TABLE "preguntas" ADD CONSTRAINT "preguntas_user_adoptada_de" UNIQUE("user_id","adoptada_de_id");