CREATE TABLE "usos_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"accion" text NOT NULL,
	"modelo" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"costo_micro_usd" integer DEFAULT 0 NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
