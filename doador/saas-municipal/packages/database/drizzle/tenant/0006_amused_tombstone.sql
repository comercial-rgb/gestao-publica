CREATE TYPE "public"."ferias_tipo" AS ENUM('gozo', 'gozo_com_abono', 'pecunia', 'indenizatorias');--> statement-breakpoint
CREATE TYPE "public"."folha_status" AS ENUM('em_elaboracao', 'calculando', 'calculada', 'em_revisao', 'aprovada', 'encerrada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."folha_tipo" AS ENUM('mensal', 'decimo_terceiro_primeira', 'decimo_terceiro_segunda', 'decimo_terceiro_integral', 'ferias', 'rescisao', 'complementar');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pendente', 'processando', 'concluido', 'falhou', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."lancamento_origem" AS ENUM('automatico', 'manual', 'importado', 'judicial');--> statement-breakpoint
CREATE TYPE "public"."regime_juridico" AS ENUM('estatutario', 'clt', 'temporario_lei', 'comissionado', 'eletivo');--> statement-breakpoint
CREATE TYPE "public"."regime_previdenciario" AS ENUM('rpps', 'rgps', 'isento');--> statement-breakpoint
CREATE TYPE "public"."rescisao_motivo" AS ENUM('exoneracao_pedido', 'exoneracao_oficio', 'demissao_justa_causa', 'aposentadoria_voluntaria', 'aposentadoria_compulsoria', 'aposentadoria_invalidez', 'falecimento', 'fim_mandato', 'fim_contrato_temporario', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."rubrica_calculo" AS ENUM('fixo', 'percentual_base', 'tabela_progressiva', 'horas', 'dias', 'manual', 'formula_sistema');--> statement-breakpoint
CREATE TYPE "public"."rubrica_tipo" AS ENUM('provento', 'desconto', 'informativo', 'base_calculo');--> statement-breakpoint
CREATE TYPE "public"."vinculo_status" AS ENUM('ativo', 'inativo', 'afastado', 'aposentado', 'exonerado', 'falecido');--> statement-breakpoint
CREATE TYPE "public"."vinculo_tipo" AS ENUM('efetivo', 'comissionado', 'temporario', 'estagiario', 'aposentado', 'pensionista', 'agente_politico', 'cedido');--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"nome" varchar(200) NOT NULL,
	"descricao" text,
	"regime_juridico" "regime_juridico" NOT NULL,
	"classe" varchar(50),
	"escolaridade_minima" varchar(100),
	"carga_horaria_semanal" integer DEFAULT 40 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "cargos_niveis_referencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cargo_id" uuid NOT NULL,
	"nivel" varchar(20) NOT NULL,
	"referencia" varchar(20) NOT NULL,
	"vencimento_base" numeric(14, 2) NOT NULL,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folha_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folha_id" uuid NOT NULL,
	"bull_job_id" varchar(100),
	"tipo" varchar(50) NOT NULL,
	"status" "job_status" DEFAULT 'pendente' NOT NULL,
	"qtd_total" integer DEFAULT 0 NOT NULL,
	"qtd_processado" integer DEFAULT 0 NOT NULL,
	"qtd_erro" integer DEFAULT 0 NOT NULL,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"erro_detalhe" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "folhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" varchar(50) NOT NULL,
	"tipo" "folha_tipo" NOT NULL,
	"status" "folha_status" DEFAULT 'em_elaboracao' NOT NULL,
	"descricao" varchar(300) NOT NULL,
	"exercicio_id" uuid NOT NULL,
	"mes_fiscal_id" uuid NOT NULL,
	"competencia_mes" integer NOT NULL,
	"competencia_ano" integer NOT NULL,
	"data_pagamento" date,
	"total_proventos" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_descontos" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_liquido" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_base_inss" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_base_irrf" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_base_fgts" numeric(18, 2) DEFAULT '0' NOT NULL,
	"qtd_servidores" integer DEFAULT 0 NOT NULL,
	"calculo_iniciado_em" timestamp with time zone,
	"calculo_concluido_em" timestamp with time zone,
	"aprovada_em" timestamp with time zone,
	"aprovada_por_user_id" uuid,
	"encerrada_em" timestamp with time zone,
	"encerrada_por_user_id" uuid,
	"observacoes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "folhas_empenhos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folha_id" uuid NOT NULL,
	"empenho_id" uuid NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "folhas_ferias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folha_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"tipo" "ferias_tipo" NOT NULL,
	"periodo_aquisitivo_inicio" date NOT NULL,
	"periodo_aquisitivo_fim" date NOT NULL,
	"dias_direito" integer DEFAULT 30 NOT NULL,
	"dias_gozados" integer NOT NULL,
	"gozo_inicio" date,
	"gozo_fim" date,
	"dias_abono" integer DEFAULT 0 NOT NULL,
	"adianta_decimo_terceiro" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folhas_lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folha_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"rubrica_id" uuid NOT NULL,
	"origem" "lancamento_origem" DEFAULT 'automatico' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"base_calculo" numeric(14, 2),
	"percentual" numeric(8, 4),
	"quantidade" numeric(8, 2),
	"observacoes" text,
	"documento_referencia" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "folhas_rescisoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folha_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"motivo" "rescisao_motivo" NOT NULL,
	"data_desligamento" date NOT NULL,
	"data_pagamento" date NOT NULL,
	"documento_referencia" varchar(200),
	"saldo_salario" numeric(14, 2) DEFAULT '0' NOT NULL,
	"decimo_terceiro_proporcional" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ferias_proporcionais" numeric(14, 2) DEFAULT '0' NOT NULL,
	"aviso_previo_indenizado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"multa_fgts" numeric(14, 2) DEFAULT '0' NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holerites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folha_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"numero" varchar(50) NOT NULL,
	"total_proventos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_descontos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_liquido" numeric(14, 2) DEFAULT '0' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"visualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rubricas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"nome" varchar(200) NOT NULL,
	"descricao" text,
	"tipo" "rubrica_tipo" NOT NULL,
	"calculo" "rubrica_calculo" NOT NULL,
	"parametros" jsonb,
	"incide_inss" boolean DEFAULT false NOT NULL,
	"incide_irrf" boolean DEFAULT false NOT NULL,
	"incide_fgts" boolean DEFAULT false NOT NULL,
	"incide_decimo_terceiro" boolean DEFAULT false NOT NULL,
	"incide_ferias" boolean DEFAULT false NOT NULL,
	"incide_rpps" boolean DEFAULT false NOT NULL,
	"folha_mensal" boolean DEFAULT true NOT NULL,
	"folha_decimo_terceiro" boolean DEFAULT false NOT NULL,
	"folha_ferias" boolean DEFAULT false NOT NULL,
	"folha_rescisao" boolean DEFAULT false NOT NULL,
	"classificacao_contabil" varchar(30),
	"ativo" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rubricas_vinculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"rubrica_id" uuid NOT NULL,
	"valor" numeric(14, 2),
	"percentual" numeric(8, 4),
	"quantidade" numeric(8, 2),
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"documento_referencia" varchar(200),
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "vinculos_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"tipo_evento" varchar(50) NOT NULL,
	"data_evento" date NOT NULL,
	"status_anterior" "vinculo_status",
	"status_novo" "vinculo_status",
	"cargo_anterior_id" uuid,
	"cargo_novo_id" uuid,
	"documento_referencia" varchar(200),
	"motivo" text NOT NULL,
	"user_id" uuid,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vinculos_funcionais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"matricula" varchar(30) NOT NULL,
	"tipo" "vinculo_tipo" NOT NULL,
	"status" "vinculo_status" DEFAULT 'ativo' NOT NULL,
	"cargo_id" uuid,
	"nivel_referencia_id" uuid,
	"entidade_id" uuid NOT NULL,
	"regime_juridico" "regime_juridico" NOT NULL,
	"regime_previdenciario" "regime_previdenciario" NOT NULL,
	"data_admissao" date NOT NULL,
	"data_exoneracao" date,
	"data_aposentadoria" date,
	"data_falecimento" date,
	"carga_horaria_semanal" integer DEFAULT 40 NOT NULL,
	"local_trabalho" varchar(200),
	"centro_custo_codigo" varchar(30),
	"banco_codigo" varchar(10),
	"agencia" varchar(20),
	"conta_tipo" varchar(20),
	"conta_numero" varchar(30),
	"qtd_dependentes_irrf" integer DEFAULT 0 NOT NULL,
	"qtd_dependentes_salario_familia" integer DEFAULT 0 NOT NULL,
	"observacoes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos_niveis_referencias" ADD CONSTRAINT "cargos_niveis_referencias_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_jobs" ADD CONSTRAINT "folha_jobs_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_jobs" ADD CONSTRAINT "folha_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas" ADD CONSTRAINT "folhas_exercicio_id_exercicios_id_fk" FOREIGN KEY ("exercicio_id") REFERENCES "public"."exercicios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas" ADD CONSTRAINT "folhas_mes_fiscal_id_meses_fiscais_id_fk" FOREIGN KEY ("mes_fiscal_id") REFERENCES "public"."meses_fiscais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas" ADD CONSTRAINT "folhas_aprovada_por_user_id_users_id_fk" FOREIGN KEY ("aprovada_por_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas" ADD CONSTRAINT "folhas_encerrada_por_user_id_users_id_fk" FOREIGN KEY ("encerrada_por_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas" ADD CONSTRAINT "folhas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_empenhos" ADD CONSTRAINT "folhas_empenhos_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_empenhos" ADD CONSTRAINT "folhas_empenhos_empenho_id_empenhos_id_fk" FOREIGN KEY ("empenho_id") REFERENCES "public"."empenhos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_empenhos" ADD CONSTRAINT "folhas_empenhos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_ferias" ADD CONSTRAINT "folhas_ferias_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_ferias" ADD CONSTRAINT "folhas_ferias_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_lancamentos" ADD CONSTRAINT "folhas_lancamentos_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_lancamentos" ADD CONSTRAINT "folhas_lancamentos_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_lancamentos" ADD CONSTRAINT "folhas_lancamentos_rubrica_id_rubricas_id_fk" FOREIGN KEY ("rubrica_id") REFERENCES "public"."rubricas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_lancamentos" ADD CONSTRAINT "folhas_lancamentos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_rescisoes" ADD CONSTRAINT "folhas_rescisoes_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas_rescisoes" ADD CONSTRAINT "folhas_rescisoes_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holerites" ADD CONSTRAINT "holerites_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holerites" ADD CONSTRAINT "holerites_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubricas" ADD CONSTRAINT "rubricas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubricas_vinculos" ADD CONSTRAINT "rubricas_vinculos_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubricas_vinculos" ADD CONSTRAINT "rubricas_vinculos_rubrica_id_rubricas_id_fk" FOREIGN KEY ("rubrica_id") REFERENCES "public"."rubricas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubricas_vinculos" ADD CONSTRAINT "rubricas_vinculos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_eventos" ADD CONSTRAINT "vinculos_eventos_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_eventos" ADD CONSTRAINT "vinculos_eventos_cargo_anterior_id_cargos_id_fk" FOREIGN KEY ("cargo_anterior_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_eventos" ADD CONSTRAINT "vinculos_eventos_cargo_novo_id_cargos_id_fk" FOREIGN KEY ("cargo_novo_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_eventos" ADD CONSTRAINT "vinculos_eventos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_funcionais" ADD CONSTRAINT "vinculos_funcionais_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_funcionais" ADD CONSTRAINT "vinculos_funcionais_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_funcionais" ADD CONSTRAINT "vinculos_funcionais_nivel_referencia_id_cargos_niveis_referencias_id_fk" FOREIGN KEY ("nivel_referencia_id") REFERENCES "public"."cargos_niveis_referencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_funcionais" ADD CONSTRAINT "vinculos_funcionais_entidade_id_entidades_id_fk" FOREIGN KEY ("entidade_id") REFERENCES "public"."entidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_funcionais" ADD CONSTRAINT "vinculos_funcionais_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cargos_codigo_idx" ON "cargos" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "cargos_ativo_idx" ON "cargos" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "cargos_regime_idx" ON "cargos" USING btree ("regime_juridico");--> statement-breakpoint
CREATE UNIQUE INDEX "cargo_niv_ref_idx" ON "cargos_niveis_referencias" USING btree ("cargo_id","nivel","referencia","vigencia_inicio");--> statement-breakpoint
CREATE INDEX "cargo_niv_ref_cargo_idx" ON "cargos_niveis_referencias" USING btree ("cargo_id");--> statement-breakpoint
CREATE INDEX "jobs_folha_idx" ON "folha_jobs" USING btree ("folha_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "folha_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_bull_idx" ON "folha_jobs" USING btree ("bull_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folhas_numero_idx" ON "folhas" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "folhas_status_idx" ON "folhas" USING btree ("status","tipo");--> statement-breakpoint
CREATE INDEX "folhas_competencia_idx" ON "folhas" USING btree ("competencia_ano","competencia_mes");--> statement-breakpoint
CREATE INDEX "folhas_exercicio_idx" ON "folhas" USING btree ("exercicio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folha_emp_idx" ON "folhas_empenhos" USING btree ("folha_id","empenho_id");--> statement-breakpoint
CREATE INDEX "folha_emp_folha_idx" ON "folhas_empenhos" USING btree ("folha_id");--> statement-breakpoint
CREATE INDEX "folha_emp_empenho_idx" ON "folhas_empenhos" USING btree ("empenho_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fer_folha_vinc_idx" ON "folhas_ferias" USING btree ("folha_id","vinculo_id");--> statement-breakpoint
CREATE INDEX "fer_vinculo_idx" ON "folhas_ferias" USING btree ("vinculo_id");--> statement-breakpoint
CREATE INDEX "lanc_folha_vinc_idx" ON "folhas_lancamentos" USING btree ("folha_id","vinculo_id");--> statement-breakpoint
CREATE INDEX "lanc_vinculo_idx" ON "folhas_lancamentos" USING btree ("vinculo_id");--> statement-breakpoint
CREATE INDEX "lanc_rubrica_idx" ON "folhas_lancamentos" USING btree ("rubrica_id");--> statement-breakpoint
CREATE INDEX "lanc_folha_idx" ON "folhas_lancamentos" USING btree ("folha_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resc_folha_vinc_idx" ON "folhas_rescisoes" USING btree ("folha_id","vinculo_id");--> statement-breakpoint
CREATE INDEX "resc_vinculo_idx" ON "folhas_rescisoes" USING btree ("vinculo_id");--> statement-breakpoint
CREATE INDEX "resc_data_idx" ON "folhas_rescisoes" USING btree ("data_desligamento");--> statement-breakpoint
CREATE UNIQUE INDEX "hol_folha_vinc_idx" ON "holerites" USING btree ("folha_id","vinculo_id");--> statement-breakpoint
CREATE INDEX "hol_vinculo_idx" ON "holerites" USING btree ("vinculo_id");--> statement-breakpoint
CREATE INDEX "hol_numero_idx" ON "holerites" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "rubricas_codigo_idx" ON "rubricas" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "rubricas_tipo_idx" ON "rubricas" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "rubricas_ativo_idx" ON "rubricas" USING btree ("ativo","calculo");--> statement-breakpoint
CREATE INDEX "rub_vinc_idx" ON "rubricas_vinculos" USING btree ("vinculo_id","rubrica_id");--> statement-breakpoint
CREATE INDEX "rub_vinc_vigencia_idx" ON "rubricas_vinculos" USING btree ("vigencia_inicio","vigencia_fim");--> statement-breakpoint
CREATE INDEX "vinc_eventos_vinculo_idx" ON "vinculos_eventos" USING btree ("vinculo_id","data_evento");--> statement-breakpoint
CREATE INDEX "vinc_eventos_data_idx" ON "vinculos_eventos" USING btree ("data_evento");--> statement-breakpoint
CREATE UNIQUE INDEX "vinc_matricula_idx" ON "vinculos_funcionais" USING btree ("matricula");--> statement-breakpoint
CREATE INDEX "vinc_pessoa_idx" ON "vinculos_funcionais" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "vinc_status_idx" ON "vinculos_funcionais" USING btree ("status","tipo");--> statement-breakpoint
CREATE INDEX "vinc_cargo_idx" ON "vinculos_funcionais" USING btree ("cargo_id");--> statement-breakpoint
CREATE INDEX "vinc_entidade_idx" ON "vinculos_funcionais" USING btree ("entidade_id");