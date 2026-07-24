CREATE TABLE "borradores_importacion" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"asignatura" text NOT NULL,
	"nombre_archivo" text NOT NULL,
	"resultado" jsonb NOT NULL,
	"edicion" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
