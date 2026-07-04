ALTER TABLE "preguntas" ADD COLUMN "colegio_id" integer;--> statement-breakpoint
ALTER TABLE "pruebas" ADD COLUMN "colegio_id" integer;--> statement-breakpoint
ALTER TABLE "textos" ADD COLUMN "colegio_id" integer;--> statement-breakpoint
UPDATE "preguntas" SET "colegio_id" = "usuarios"."colegio_id" FROM "usuarios" WHERE "usuarios"."id" = "preguntas"."user_id" AND "preguntas"."colegio_id" IS NULL;--> statement-breakpoint
UPDATE "textos" SET "colegio_id" = "usuarios"."colegio_id" FROM "usuarios" WHERE "usuarios"."id" = "textos"."user_id" AND "textos"."colegio_id" IS NULL;--> statement-breakpoint
UPDATE "pruebas" SET "colegio_id" = "usuarios"."colegio_id" FROM "usuarios" WHERE "usuarios"."id" = "pruebas"."user_id" AND "pruebas"."colegio_id" IS NULL;
