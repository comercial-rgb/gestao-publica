CREATE TYPE "public"."empenho_status" AS ENUM('vigente', 'restos_processados', 'restos_nao_processados', 'cancelado', 'cancelado_lrf', 'pago_total');--> statement-breakpoint
CREATE TYPE "public"."empenho_tipo" AS ENUM('ordinario', 'global', 'estimativo');--> statement-breakpoint
CREATE TYPE "public"."liquidacao_status" AS ENUM('vigente', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."ordem_pagamento_status" AS ENUM('aguardando_aprovacao', 'aprovada', 'rejeitada', 'paga_parcial', 'paga_total', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."pagamento_meio" AS ENUM('pix', 'transferencia', 'cheque', 'boleto', 'debito_automatico', 'ordem_bancaria', 'compensacao', 'outros');--> statement-breakpoint
CREATE TYPE "public"."pagamento_status" AS ENUM('vigente', 'estornado');--> statement-breakpoint
CREATE TABLE "empenhos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" varchar(50) NOT NULL,
	"tipo" "empenho_tipo" DEFAULT 'ordinario' NOT NULL,
	"status" "empenho_status" DEFAULT 'vigente' NOT NULL,
	"exercicio_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"dotacao_id" uuid NOT NULL,
	"exercicio_original_id" uuid,
	"agrupador_id" uuid,
	"fornecedor_pessoa_id" uuid NOT NULL,
	"data_empenho" date NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"valor_liquidado" numeric(18, 2) DEFAULT '0' NOT NULL,
	"valor_pago" numeric(18, 2) DEFAULT '0' NOT NULL,
	"valor_anulado" numeric(18, 2) DEFAULT '0' NOT NULL,
	"objeto" text NOT NULL,
	"contrato_referencia" jsonb,
	"identificador_msc" varchar(50),
	"informacao_complementar" jsonb,
	"observacoes" text,
	"cancelado_em" timestamp with time zone,
	"cancelado_por_user_id" uuid,
	"motivo_cancelamento" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "empenhos_agrupadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descricao" varchar(300) NOT NULL,
	"numero_externo" varchar(50),
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "empenhos_anulacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empenho_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"data_anulacao" date NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"motivo" text NOT NULL,
	"documento_autorizacao" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "empenhos_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empenho_id" uuid NOT NULL,
	"status_anterior" "empenho_status",
	"status_novo" "empenho_status" NOT NULL,
	"motivo" varchar(500) NOT NULL,
	"user_id" uuid,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liquidacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" varchar(50) NOT NULL,
	"status" "liquidacao_status" DEFAULT 'vigente' NOT NULL,
	"empenho_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"data_liquidacao" date NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"valor_pago" numeric(18, 2) DEFAULT '0' NOT NULL,
	"documento_comprovante" varchar(100),
	"data_documento" date,
	"observacoes" text,
	"identificador_msc" varchar(50),
	"cancelada_em" timestamp with time zone,
	"cancelada_por_user_id" uuid,
	"motivo_cancelamento" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "liquidacoes_anulacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"liquidacao_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"data_anulacao" date NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"motivo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ordens_pagamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" varchar(50) NOT NULL,
	"status" "ordem_pagamento_status" DEFAULT 'aguardando_aprovacao' NOT NULL,
	"liquidacao_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"valor_pago" numeric(18, 2) DEFAULT '0' NOT NULL,
	"data_emissao" date NOT NULL,
	"data_aprovacao" date,
	"observacoes" text,
	"aprovada_por_user_id" uuid,
	"aprovada_em" timestamp with time zone,
	"rejeitada_por_user_id" uuid,
	"rejeitada_em" timestamp with time zone,
	"motivo_rejeicao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" varchar(50) NOT NULL,
	"status" "pagamento_status" DEFAULT 'vigente' NOT NULL,
	"ordem_pagamento_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"data_pagamento" date NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"meio" "pagamento_meio" NOT NULL,
	"numero_documento" varchar(100),
	"conta_bancaria_id" uuid,
	"observacoes" text,
	"identificador_msc" varchar(50),
	"estornado_em" timestamp with time zone,
	"estornado_por_user_id" uuid,
	"motivo_estorno" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "pagamentos_anulacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pagamento_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"data_estorno" date NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"motivo" text NOT NULL,
	"documento_bancario" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "empenhos" ADD CONSTRAINT "empenhos_exercicio_id_exercicios_id_fk" FOREIGN KEY ("exercicio_id") REFERENCES "public"."exercicios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos" ADD CONSTRAINT "empenhos_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos" ADD CONSTRAINT "empenhos_dotacao_id_dotacoes_id_fk" FOREIGN KEY ("dotacao_id") REFERENCES "public"."dotacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos" ADD CONSTRAINT "empenhos_exercicio_original_id_exercicios_id_fk" FOREIGN KEY ("exercicio_original_id") REFERENCES "public"."exercicios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos" ADD CONSTRAINT "empenhos_agrupador_id_empenhos_agrupadores_id_fk" FOREIGN KEY ("agrupador_id") REFERENCES "public"."empenhos_agrupadores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos" ADD CONSTRAINT "empenhos_fornecedor_pessoa_id_pessoas_id_fk" FOREIGN KEY ("fornecedor_pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos" ADD CONSTRAINT "empenhos_cancelado_por_user_id_users_id_fk" FOREIGN KEY ("cancelado_por_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos" ADD CONSTRAINT "empenhos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos_agrupadores" ADD CONSTRAINT "empenhos_agrupadores_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos_anulacoes" ADD CONSTRAINT "empenhos_anulacoes_empenho_id_empenhos_id_fk" FOREIGN KEY ("empenho_id") REFERENCES "public"."empenhos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos_anulacoes" ADD CONSTRAINT "empenhos_anulacoes_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos_anulacoes" ADD CONSTRAINT "empenhos_anulacoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos_eventos" ADD CONSTRAINT "empenhos_eventos_empenho_id_empenhos_id_fk" FOREIGN KEY ("empenho_id") REFERENCES "public"."empenhos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empenhos_eventos" ADD CONSTRAINT "empenhos_eventos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacoes" ADD CONSTRAINT "liquidacoes_empenho_id_empenhos_id_fk" FOREIGN KEY ("empenho_id") REFERENCES "public"."empenhos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacoes" ADD CONSTRAINT "liquidacoes_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacoes" ADD CONSTRAINT "liquidacoes_cancelada_por_user_id_users_id_fk" FOREIGN KEY ("cancelada_por_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacoes" ADD CONSTRAINT "liquidacoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacoes_anulacoes" ADD CONSTRAINT "liquidacoes_anulacoes_liquidacao_id_liquidacoes_id_fk" FOREIGN KEY ("liquidacao_id") REFERENCES "public"."liquidacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacoes_anulacoes" ADD CONSTRAINT "liquidacoes_anulacoes_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacoes_anulacoes" ADD CONSTRAINT "liquidacoes_anulacoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_pagamento" ADD CONSTRAINT "ordens_pagamento_liquidacao_id_liquidacoes_id_fk" FOREIGN KEY ("liquidacao_id") REFERENCES "public"."liquidacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_pagamento" ADD CONSTRAINT "ordens_pagamento_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_pagamento" ADD CONSTRAINT "ordens_pagamento_aprovada_por_user_id_users_id_fk" FOREIGN KEY ("aprovada_por_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_pagamento" ADD CONSTRAINT "ordens_pagamento_rejeitada_por_user_id_users_id_fk" FOREIGN KEY ("rejeitada_por_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_pagamento" ADD CONSTRAINT "ordens_pagamento_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_ordem_pagamento_id_ordens_pagamento_id_fk" FOREIGN KEY ("ordem_pagamento_id") REFERENCES "public"."ordens_pagamento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_estornado_por_user_id_users_id_fk" FOREIGN KEY ("estornado_por_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_anulacoes" ADD CONSTRAINT "pagamentos_anulacoes_pagamento_id_pagamentos_id_fk" FOREIGN KEY ("pagamento_id") REFERENCES "public"."pagamentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_anulacoes" ADD CONSTRAINT "pagamentos_anulacoes_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_anulacoes" ADD CONSTRAINT "pagamentos_anulacoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "empenhos_numero_idx" ON "empenhos" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "empenhos_exercicio_idx" ON "empenhos" USING btree ("exercicio_id");--> statement-breakpoint
CREATE INDEX "empenhos_dotacao_idx" ON "empenhos" USING btree ("dotacao_id");--> statement-breakpoint
CREATE INDEX "empenhos_fornecedor_idx" ON "empenhos" USING btree ("fornecedor_pessoa_id");--> statement-breakpoint
CREATE INDEX "empenhos_agrupador_idx" ON "empenhos" USING btree ("agrupador_id");--> statement-breakpoint
CREATE INDEX "empenhos_status_idx" ON "empenhos" USING btree ("status","exercicio_id");--> statement-breakpoint
CREATE INDEX "empenhos_mes_idx" ON "empenhos" USING btree ("mes_fiscal_id");--> statement-breakpoint
CREATE INDEX "empenhos_data_idx" ON "empenhos" USING btree ("data_empenho");--> statement-breakpoint
CREATE INDEX "emp_agr_descricao_idx" ON "empenhos_agrupadores" USING btree ("descricao");--> statement-breakpoint
CREATE INDEX "emp_agr_ativo_idx" ON "empenhos_agrupadores" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "emp_anul_empenho_idx" ON "empenhos_anulacoes" USING btree ("empenho_id");--> statement-breakpoint
CREATE INDEX "emp_anul_mes_idx" ON "empenhos_anulacoes" USING btree ("mes_fiscal_id");--> statement-breakpoint
CREATE INDEX "emp_anul_data_idx" ON "empenhos_anulacoes" USING btree ("data_anulacao");--> statement-breakpoint
CREATE INDEX "emp_eventos_empenho_idx" ON "empenhos_eventos" USING btree ("empenho_id","registrado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "liquidacoes_numero_idx" ON "liquidacoes" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "liquidacoes_empenho_idx" ON "liquidacoes" USING btree ("empenho_id");--> statement-breakpoint
CREATE INDEX "liquidacoes_mes_idx" ON "liquidacoes" USING btree ("mes_fiscal_id");--> statement-breakpoint
CREATE INDEX "liquidacoes_data_idx" ON "liquidacoes" USING btree ("data_liquidacao");--> statement-breakpoint
CREATE INDEX "liquidacoes_status_idx" ON "liquidacoes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "liq_anul_liquidacao_idx" ON "liquidacoes_anulacoes" USING btree ("liquidacao_id");--> statement-breakpoint
CREATE INDEX "liq_anul_mes_idx" ON "liquidacoes_anulacoes" USING btree ("mes_fiscal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "op_numero_idx" ON "ordens_pagamento" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "op_liquidacao_idx" ON "ordens_pagamento" USING btree ("liquidacao_id");--> statement-breakpoint
CREATE INDEX "op_status_idx" ON "ordens_pagamento" USING btree ("status");--> statement-breakpoint
CREATE INDEX "op_mes_idx" ON "ordens_pagamento" USING btree ("mes_fiscal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pag_numero_idx" ON "pagamentos" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "pag_op_idx" ON "pagamentos" USING btree ("ordem_pagamento_id");--> statement-breakpoint
CREATE INDEX "pag_mes_idx" ON "pagamentos" USING btree ("mes_fiscal_id");--> statement-breakpoint
CREATE INDEX "pag_data_idx" ON "pagamentos" USING btree ("data_pagamento");--> statement-breakpoint
CREATE INDEX "pag_status_idx" ON "pagamentos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pag_anul_pagamento_idx" ON "pagamentos_anulacoes" USING btree ("pagamento_id");--> statement-breakpoint
CREATE INDEX "pag_anul_mes_idx" ON "pagamentos_anulacoes" USING btree ("mes_fiscal_id");