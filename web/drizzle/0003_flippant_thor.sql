CREATE TABLE "pruebas" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"asignatura" text NOT NULL,
	"titulo" text,
	"colegio" text,
	"profesor" text,
	"instrucciones" text,
	"formulas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preguntas_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"textos_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"logo" text,
	"pdf_key" text,
	"pdf_generado_en" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
