CREATE TABLE "inss_tabelas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"teto_contribuicao" numeric(15, 2) NOT NULL,
	"desconto_maximo" numeric(15, 2) NOT NULL,
	"oficial" boolean DEFAULT true NOT NULL,
	"fundamentacao_legal" text NOT NULL,
	"observacoes" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chk_inss_vigencia" CHECK ("inss_tabelas"."vigencia_fim" IS NULL OR "inss_tabelas"."vigencia_fim" > "inss_tabelas"."vigencia_inicio"),
	CONSTRAINT "chk_inss_teto_positivo" CHECK ("inss_tabelas"."teto_contribuicao" > 0),
	CONSTRAINT "chk_inss_desconto_max_positivo" CHECK ("inss_tabelas"."desconto_maximo" > 0)
);
--> statement-breakpoint
CREATE TABLE "inss_tabelas_faixas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tabela_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"faixa_inicio" numeric(15, 2) NOT NULL,
	"faixa_fim" numeric(15, 2) NOT NULL,
	"aliquota" numeric(6, 4) NOT NULL,
	"parcela_deduzir" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inss_faixa_positiva" CHECK ("inss_tabelas_faixas"."faixa_inicio" >= 0 AND "inss_tabelas_faixas"."faixa_fim" > "inss_tabelas_faixas"."faixa_inicio"),
	CONSTRAINT "chk_inss_aliquota_valida" CHECK ("inss_tabelas_faixas"."aliquota" > 0 AND "inss_tabelas_faixas"."aliquota" <= 1),
	CONSTRAINT "chk_inss_ordem_positiva" CHECK ("inss_tabelas_faixas"."ordem" >= 1)
);
--> statement-breakpoint
CREATE TABLE "irrf_tabelas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"deducao_por_dependente" numeric(15, 2) NOT NULL,
	"desconto_simplificado" numeric(15, 2) NOT NULL,
	"isencao_maior_65_anos" numeric(15, 2) NOT NULL,
	"redutor_base" numeric(15, 2),
	"redutor_fator" numeric(10, 8),
	"redutor_renda_maxima" numeric(15, 2),
	"oficial" boolean DEFAULT true NOT NULL,
	"fundamentacao_legal" text NOT NULL,
	"observacoes" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chk_irrf_vigencia" CHECK ("irrf_tabelas"."vigencia_fim" IS NULL OR "irrf_tabelas"."vigencia_fim" > "irrf_tabelas"."vigencia_inicio"),
	CONSTRAINT "chk_irrf_deducao_positiva" CHECK ("irrf_tabelas"."deducao_por_dependente" > 0),
	CONSTRAINT "chk_irrf_desconto_simplificado" CHECK ("irrf_tabelas"."desconto_simplificado" > 0),
	CONSTRAINT "chk_irrf_redutor_consistente" CHECK (("irrf_tabelas"."redutor_base" IS NULL AND "irrf_tabelas"."redutor_fator" IS NULL AND "irrf_tabelas"."redutor_renda_maxima" IS NULL)
       OR ("irrf_tabelas"."redutor_base" IS NOT NULL AND "irrf_tabelas"."redutor_fator" IS NOT NULL AND "irrf_tabelas"."redutor_renda_maxima" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "irrf_tabelas_faixas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tabela_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"base_inicio" numeric(15, 2) NOT NULL,
	"base_fim" numeric(15, 2),
	"aliquota" numeric(6, 4) NOT NULL,
	"parcela_deduzir" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_irrf_base_positiva" CHECK ("irrf_tabelas_faixas"."base_inicio" >= 0),
	CONSTRAINT "chk_irrf_aliquota_valida" CHECK ("irrf_tabelas_faixas"."aliquota" >= 0 AND "irrf_tabelas_faixas"."aliquota" <= 1),
	CONSTRAINT "chk_irrf_ordem_positiva" CHECK ("irrf_tabelas_faixas"."ordem" >= 1)
);
--> statement-breakpoint
CREATE TABLE "salario_familia_tabelas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"renda_maxima" numeric(15, 2) NOT NULL,
	"valor_por_filho" numeric(15, 2) NOT NULL,
	"idade_maxima_filho" integer DEFAULT 14 NOT NULL,
	"oficial" boolean DEFAULT true NOT NULL,
	"fundamentacao_legal" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "chk_sf_vigencia" CHECK ("salario_familia_tabelas"."vigencia_fim" IS NULL OR "salario_familia_tabelas"."vigencia_fim" > "salario_familia_tabelas"."vigencia_inicio"),
	CONSTRAINT "chk_sf_valores_positivos" CHECK ("salario_familia_tabelas"."renda_maxima" > 0 AND "salario_familia_tabelas"."valor_por_filho" > 0),
	CONSTRAINT "chk_sf_idade" CHECK ("salario_familia_tabelas"."idade_maxima_filho" >= 1 AND "salario_familia_tabelas"."idade_maxima_filho" <= 21)
);
--> statement-breakpoint
ALTER TABLE "inss_tabelas_faixas" ADD CONSTRAINT "inss_tabelas_faixas_tabela_id_inss_tabelas_id_fk" FOREIGN KEY ("tabela_id") REFERENCES "public"."inss_tabelas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irrf_tabelas_faixas" ADD CONSTRAINT "irrf_tabelas_faixas_tabela_id_irrf_tabelas_id_fk" FOREIGN KEY ("tabela_id") REFERENCES "public"."irrf_tabelas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inss_tabelas_vigencia" ON "inss_tabelas" USING btree ("vigencia_inicio","vigencia_fim") WHERE "inss_tabelas"."deleted_at" IS NULL AND "inss_tabelas"."ativa" = true;--> statement-breakpoint
CREATE INDEX "idx_inss_faixas_tabela" ON "inss_tabelas_faixas" USING btree ("tabela_id","ordem");--> statement-breakpoint
CREATE INDEX "idx_irrf_tabelas_vigencia" ON "irrf_tabelas" USING btree ("vigencia_inicio","vigencia_fim") WHERE "irrf_tabelas"."deleted_at" IS NULL AND "irrf_tabelas"."ativa" = true;--> statement-breakpoint
CREATE INDEX "idx_irrf_faixas_tabela" ON "irrf_tabelas_faixas" USING btree ("tabela_id","ordem");--> statement-breakpoint
CREATE INDEX "idx_salario_familia_vigencia" ON "salario_familia_tabelas" USING btree ("vigencia_inicio","vigencia_fim") WHERE "salario_familia_tabelas"."deleted_at" IS NULL AND "salario_familia_tabelas"."ativa" = true;