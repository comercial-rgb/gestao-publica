CREATE TYPE "public"."exercicio_status" AS ENUM('aberto', 'em_encerramento', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."mes_fiscal_status" AS ENUM('aberto', 'fechado', 'bloqueado');--> statement-breakpoint
CREATE TABLE "exercicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ano" integer NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"status" "exercicio_status" DEFAULT 'aberto' NOT NULL,
	"encerrado_em" timestamp with time zone,
	"encerrado_por_user_id" uuid,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercicios_ano_unique" UNIQUE("ano")
);
--> statement-breakpoint
CREATE TABLE "meses_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercicio_id" uuid NOT NULL,
	"mes" integer NOT NULL,
	"status" "mes_fiscal_status" DEFAULT 'aberto' NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"fechado_em" timestamp with time zone,
	"fechado_por_user_id" uuid,
	"reaberturas" integer DEFAULT 0 NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercicios" ADD CONSTRAINT "exercicios_encerrado_por_user_id_users_id_fk" FOREIGN KEY ("encerrado_por_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meses_fiscais" ADD CONSTRAINT "meses_fiscais_exercicio_id_exercicios_id_fk" FOREIGN KEY ("exercicio_id") REFERENCES "public"."exercicios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meses_fiscais" ADD CONSTRAINT "meses_fiscais_fechado_por_user_id_users_id_fk" FOREIGN KEY ("fechado_por_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercicios_status_idx" ON "exercicios" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "meses_fiscais_exercicio_mes_idx" ON "meses_fiscais" USING btree ("exercicio_id","mes");--> statement-breakpoint
CREATE INDEX "meses_fiscais_status_idx" ON "meses_fiscais" USING btree ("status");