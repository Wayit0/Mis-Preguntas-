CREATE TABLE "pagos_suscripcion" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"suscripcion_id" integer NOT NULL,
	"mp_payment_id" text NOT NULL,
	"monto_clp" integer DEFAULT 0 NOT NULL,
	"estado" text NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_suscripcion_mp_payment_id_unique" UNIQUE("mp_payment_id")
);
--> statement-breakpoint
CREATE TABLE "suscripciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"origen" text NOT NULL,
	"periodicidad" text,
	"estado" text NOT NULL,
	"mp_preapproval_id" text,
	"trial_termina_el" timestamp,
	"periodo_hasta" timestamp,
	"nota" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "suscripciones_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "suscripciones_mp_preapproval_id_unique" UNIQUE("mp_preapproval_id")
);
--> statement-breakpoint
ALTER TABLE "colegios" ADD COLUMN "licencia_hasta" timestamp;--> statement-breakpoint
ALTER TABLE "colegios" ADD COLUMN "licencia_nota" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "trial_usado_el" timestamp;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;