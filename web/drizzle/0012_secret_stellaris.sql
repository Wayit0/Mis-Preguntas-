CREATE TABLE "carpetas" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"parent_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preguntas" ADD COLUMN "carpeta_id" integer;--> statement-breakpoint
ALTER TABLE "pruebas" ADD COLUMN "carpeta_id" integer;--> statement-breakpoint
ALTER TABLE "textos" ADD COLUMN "carpeta_id" integer;