CREATE TABLE "asignaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"curso_id" integer NOT NULL,
	"prueba_id" integer NOT NULL,
	"titulo" text NOT NULL,
	"instrucciones" text,
	"contenido" jsonb NOT NULL,
	"fecha_limite" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"join_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cursos_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "entregas" (
	"id" serial PRIMARY KEY NOT NULL,
	"asignacion_id" integer NOT NULL,
	"estudiante_id" integer NOT NULL,
	"respuestas" jsonb NOT NULL,
	"puntaje" integer NOT NULL,
	"total" integer NOT NULL,
	"enviado_el" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entregas_asignacion_estudiante" UNIQUE("asignacion_id","estudiante_id")
);
--> statement-breakpoint
CREATE TABLE "inscripciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"curso_id" integer NOT NULL,
	"estudiante_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inscripciones_curso_estudiante" UNIQUE("curso_id","estudiante_id")
);
