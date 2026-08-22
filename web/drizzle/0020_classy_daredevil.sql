CREATE TABLE "borradores_tarea" (
	"id" serial PRIMARY KEY NOT NULL,
	"asignacion_id" integer NOT NULL,
	"estudiante_id" integer NOT NULL,
	"respuestas" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "borradores_tarea_asignacion_estudiante" UNIQUE("asignacion_id","estudiante_id")
);
