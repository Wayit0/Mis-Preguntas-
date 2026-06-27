ALTER TABLE "usuarios" ALTER COLUMN "password_hash" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "password_hash" DROP NOT NULL;