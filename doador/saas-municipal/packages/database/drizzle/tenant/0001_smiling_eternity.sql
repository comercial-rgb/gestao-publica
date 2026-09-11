CREATE TABLE "tenant_migrations_applied" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"migration_name" varchar(255) NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" varchar(100) DEFAULT 'system',
	CONSTRAINT "tenant_migrations_applied_migration_name_unique" UNIQUE("migration_name")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_migrations_name_idx" ON "tenant_migrations_applied" USING btree ("migration_name");