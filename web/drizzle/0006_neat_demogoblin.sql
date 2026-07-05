ALTER TABLE "colegios" ADD COLUMN "dominio" text;--> statement-breakpoint
ALTER TABLE "colegios" ADD CONSTRAINT "colegios_dominio_unique" UNIQUE("dominio");