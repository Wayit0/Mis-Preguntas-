CREATE TABLE "accesos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"metodo" text NOT NULL,
	"exito" boolean NOT NULL,
	"motivo" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
