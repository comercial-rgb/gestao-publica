CREATE TYPE "public"."forma_pagamento" AS ENUM('pix', 'boleto', 'debito_automatico', 'cartao_credito', 'cartao_debito', 'dinheiro', 'transferencia', 'cheque', 'compensacao', 'outros');--> statement-breakpoint
CREATE TABLE "pcasp_versoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uf" varchar(2) NOT NULL,
	"ano" integer NOT NULL,
	"fonte" varchar(100) NOT NULL,
	"observacoes" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"importada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receitas_anulacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arrecadacao_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"data_anulacao" date NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"motivo" text NOT NULL,
	"documento_autorizacao" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "receitas_arrecadacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lancamento_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"contribuinte_pessoa_id" uuid,
	"data_arrecadacao" date NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"forma_pagamento" "forma_pagamento" NOT NULL,
	"numero_documento" varchar(100),
	"referencia" varchar(100),
	"conta_bancaria_id" uuid,
	"identificador_msc" varchar(50),
	"informacao_complementar" jsonb,
	"observacoes" text,
	"anulado_em" timestamp with time zone,
	"anulado_por_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "receitas_lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercicio_id" uuid NOT NULL,
	"tipo_receita_id" uuid NOT NULL,
	"valor_previsto_inicial" numeric(18, 2) NOT NULL,
	"valor_atualizado" numeric(18, 2) NOT NULL,
	"memoria_calculo" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "receitas_naturezas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo_completo" varchar(20) NOT NULL,
	"codigo_reduzido" varchar(20) NOT NULL,
	"descricao" varchar(300) NOT NULL,
	"nivel" integer NOT NULL,
	"parent_id" uuid,
	"analitica" boolean DEFAULT false NOT NULL,
	"pcasp_versao_id" uuid,
	"identificador_msc" varchar(50),
	"conta_contabil_correspondente" varchar(30),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receitas_naturezas_codigo_completo_unique" UNIQUE("codigo_completo"),
	CONSTRAINT "receitas_naturezas_codigo_reduzido_unique" UNIQUE("codigo_reduzido")
);
--> statement-breakpoint
CREATE TABLE "receitas_tipos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"natureza_id" uuid NOT NULL,
	"entidade_id" uuid NOT NULL,
	"codigo_interno" varchar(30),
	"descricao_local" varchar(200),
	"fonte_recurso" varchar(10),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receitas_anulacoes" ADD CONSTRAINT "receitas_anulacoes_arrecadacao_id_receitas_arrecadacoes_id_fk" FOREIGN KEY ("arrecadacao_id") REFERENCES "public"."receitas_arrecadacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_anulacoes" ADD CONSTRAINT "receitas_anulacoes_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_anulacoes" ADD CONSTRAINT "receitas_anulacoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_arrecadacoes" ADD CONSTRAINT "receitas_arrecadacoes_lancamento_id_receitas_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."receitas_lancamentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_arrecadacoes" ADD CONSTRAINT "receitas_arrecadacoes_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_arrecadacoes" ADD CONSTRAINT "receitas_arrecadacoes_contribuinte_pessoa_id_pessoas_id_fk" FOREIGN KEY ("contribuinte_pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_arrecadacoes" ADD CONSTRAINT "receitas_arrecadacoes_anulado_por_user_id_users_id_fk" FOREIGN KEY ("anulado_por_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_arrecadacoes" ADD CONSTRAINT "receitas_arrecadacoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_lancamentos" ADD CONSTRAINT "receitas_lancamentos_exercicio_id_exercicios_id_fk" FOREIGN KEY ("exercicio_id") REFERENCES "public"."exercicios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_lancamentos" ADD CONSTRAINT "receitas_lancamentos_tipo_receita_id_receitas_tipos_id_fk" FOREIGN KEY ("tipo_receita_id") REFERENCES "public"."receitas_tipos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_lancamentos" ADD CONSTRAINT "receitas_lancamentos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_naturezas" ADD CONSTRAINT "receitas_naturezas_pcasp_versao_id_pcasp_versoes_id_fk" FOREIGN KEY ("pcasp_versao_id") REFERENCES "public"."pcasp_versoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_tipos" ADD CONSTRAINT "receitas_tipos_natureza_id_receitas_naturezas_id_fk" FOREIGN KEY ("natureza_id") REFERENCES "public"."receitas_naturezas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_tipos" ADD CONSTRAINT "receitas_tipos_entidade_id_entidades_id_fk" FOREIGN KEY ("entidade_id") REFERENCES "public"."entidades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pcasp_versoes_uf_ano_idx" ON "pcasp_versoes" USING btree ("uf","ano");--> statement-breakpoint
CREATE INDEX "receitas_anul_arrec_idx" ON "receitas_anulacoes" USING btree ("arrecadacao_id");--> statement-breakpoint
CREATE INDEX "receitas_anul_mes_idx" ON "receitas_anulacoes" USING btree ("mes_fiscal_id");--> statement-breakpoint
CREATE INDEX "receitas_arrec_lanc_idx" ON "receitas_arrecadacoes" USING btree ("lancamento_id");--> statement-breakpoint
CREATE INDEX "receitas_arrec_mes_idx" ON "receitas_arrecadacoes" USING btree ("mes_fiscal_id");--> statement-breakpoint
CREATE INDEX "receitas_arrec_contrib_idx" ON "receitas_arrecadacoes" USING btree ("contribuinte_pessoa_id");--> statement-breakpoint
CREATE INDEX "receitas_arrec_data_idx" ON "receitas_arrecadacoes" USING btree ("data_arrecadacao");--> statement-breakpoint
CREATE UNIQUE INDEX "receitas_lanc_exerc_tipo_idx" ON "receitas_lancamentos" USING btree ("exercicio_id","tipo_receita_id");--> statement-breakpoint
CREATE INDEX "receitas_lanc_exercicio_idx" ON "receitas_lancamentos" USING btree ("exercicio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receitas_nat_codigo_idx" ON "receitas_naturezas" USING btree ("codigo_completo");--> statement-breakpoint
CREATE UNIQUE INDEX "receitas_nat_codred_idx" ON "receitas_naturezas" USING btree ("codigo_reduzido");--> statement-breakpoint
CREATE INDEX "receitas_nat_nivel_idx" ON "receitas_naturezas" USING btree ("nivel");--> statement-breakpoint
CREATE INDEX "receitas_nat_parent_idx" ON "receitas_naturezas" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "receitas_nat_analitica_idx" ON "receitas_naturezas" USING btree ("analitica");--> statement-breakpoint
CREATE UNIQUE INDEX "receitas_tipos_nat_ent_idx" ON "receitas_tipos" USING btree ("natureza_id","entidade_id");--> statement-breakpoint
CREATE INDEX "receitas_tipos_entidade_idx" ON "receitas_tipos" USING btree ("entidade_id");