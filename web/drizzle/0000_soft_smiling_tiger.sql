CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "colaboraciones" (
	"from_user_id" integer NOT NULL,
	"to_user_id" integer NOT NULL,
	CONSTRAINT "colaboraciones_from_user_id_to_user_id_pk" PRIMARY KEY("from_user_id","to_user_id")
);
--> statement-breakpoint
CREATE TABLE "preguntas" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"asignatura" text NOT NULL,
	"materia" text,
	"contenido" text,
	"nivel" text,
	"pregunta" text NOT NULL,
	"A" text,
	"B" text,
	"C" text,
	"D" text,
	"E" text,
	"correcta" text,
	"explicacion" text,
	"compartida" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"imagen_pregunta" text,
	"imagen_A" text,
	"imagen_B" text,
	"imagen_C" text,
	"imagen_D" text,
	"imagen_E" text,
	"tipo" text DEFAULT 'seleccion_multiple',
	"texto_id" integer
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "textos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"asignatura" text NOT NULL,
	"titulo" text NOT NULL,
	"contenido" text NOT NULL,
	"compartida" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"email_verified" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"image" text,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;