CREATE TABLE "colegios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"logo" text,
	"join_code" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "colegios_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "invitaciones_colegio" (
	"id" serial PRIMARY KEY NOT NULL,
	"colegio_id" integer NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "invitaciones_colegio_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "role" text DEFAULT 'teacher' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "colegio_id" integer;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "banned" boolean;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "ban_expires" timestamp;--> statement-breakpoint
ALTER TABLE "invitaciones_colegio" ADD CONSTRAINT "invitaciones_colegio_colegio_id_colegios_id_fk" FOREIGN KEY ("colegio_id") REFERENCES "public"."colegios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_colegio_id_colegios_id_fk" FOREIGN KEY ("colegio_id") REFERENCES "public"."colegios"("id") ON DELETE no action ON UPDATE no action;