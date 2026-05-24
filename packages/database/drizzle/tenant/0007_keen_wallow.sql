CREATE TYPE "public"."estrategia_proporcionalidade" AS ENUM('INTEGRAL', 'DIAS_REGISTRADOS', 'DIAS_EFETIVOS_TRABALHADOS', 'DIAS_NOTURNOS_DECLARADOS', 'CUSTOMIZADA_SCRIPT');--> statement-breakpoint
CREATE TYPE "public"."parentesco" AS ENUM('FILHO', 'ENTEADO', 'TUTELADO', 'GUARDA_JUDICIAL', 'CONJUGE', 'COMPANHEIRO', 'PAI_MAE_AGREGADO', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."status_folha_progresso" AS ENUM('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."tipo_consignacao" AS ENUM('EMPRESTIMO', 'CARTAO_CREDITO', 'PLANO_SAUDE', 'PLANO_ODONTOLOGICO', 'PREVIDENCIA_PRIVADA', 'PENSAO_ALIMENTICIA', 'SINDICATO', 'OUTRO_BENEFICIO');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_funcional" AS ENUM('ADMISSAO', 'DEMISSAO', 'FALTA_INJUSTIFICADA', 'FALTA_JUSTIFICADA', 'AFASTAMENTO_INSS', 'AFASTAMENTO_PROPRIO', 'LICENCA_MATERNIDADE', 'LICENCA_PATERNIDADE', 'LICENCA_ADOTANTE', 'FERIAS_GOZO', 'LICENCA_PREMIO', 'LICENCA_NOJO', 'LICENCA_GALA', 'SUSPENSAO_DISCIPLINAR', 'CESSAO_OUTRO_ORGAO', 'AFASTAMENTO_MANDATO');--> statement-breakpoint
CREATE TABLE "consignacoes_ativas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"consignatario_nome" text NOT NULL,
	"consignatario_cnpj" varchar(18),
	"numero_contrato" text NOT NULL,
	"tipo" "tipo_consignacao" NOT NULL,
	"valor_parcela" numeric(15, 2) NOT NULL,
	"parcelas_total" integer NOT NULL,
	"parcelas_pagas" integer DEFAULT 0 NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"autorizacao_url" text,
	"data_autorizacao" date NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "uq_consig_contrato" UNIQUE("consignatario_cnpj","numero_contrato"),
	CONSTRAINT "chk_consig_parcelas" CHECK ("consignacoes_ativas"."parcelas_pagas" >= 0 AND "consignacoes_ativas"."parcelas_pagas" <= "consignacoes_ativas"."parcelas_total" AND "consignacoes_ativas"."parcelas_total" > 0),
	CONSTRAINT "chk_consig_valor" CHECK ("consignacoes_ativas"."valor_parcela" > 0),
	CONSTRAINT "chk_consig_vigencia" CHECK ("consignacoes_ativas"."data_fim" > "consignacoes_ativas"."data_inicio")
);
--> statement-breakpoint
CREATE TABLE "folha_eventos_funcional" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"competencia" date NOT NULL,
	"tipo" "tipo_evento_funcional" NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date,
	"dias_computados" integer NOT NULL,
	"documento_url" text,
	"numero_protocolo" text,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "chk_eventos_dias" CHECK ("folha_eventos_funcional"."dias_computados" >= 1 AND "folha_eventos_funcional"."dias_computados" <= 31),
	CONSTRAINT "chk_eventos_vigencia" CHECK ("folha_eventos_funcional"."data_fim" IS NULL OR "folha_eventos_funcional"."data_fim" >= "folha_eventos_funcional"."data_inicio")
);
--> statement-breakpoint
CREATE TABLE "folha_processamento_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folha_id" uuid NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"competencia" date NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL,
	"duracao_ms" integer NOT NULL,
	"worker_id" text,
	"hash_sha256" varchar(64) NOT NULL,
	CONSTRAINT "chk_proc_log_duracao" CHECK ("folha_processamento_log"."duracao_ms" >= 0),
	CONSTRAINT "chk_proc_log_versao" CHECK ("folha_processamento_log"."versao" >= 1)
);
--> statement-breakpoint
CREATE TABLE "folha_progresso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folha_id" uuid NOT NULL,
	"job_id" text NOT NULL,
	"tipo_job" text NOT NULL,
	"status" "status_folha_progresso" NOT NULL,
	"progresso_percentual" integer DEFAULT 0 NOT NULL,
	"total_itens" integer DEFAULT 0 NOT NULL,
	"itens_processados" integer DEFAULT 0 NOT NULL,
	"itens_com_erro" integer DEFAULT 0 NOT NULL,
	"mensagem_atual" text,
	"erros" jsonb,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone,
	"worker_id" text,
	CONSTRAINT "chk_progresso_pct" CHECK ("folha_progresso"."progresso_percentual" >= 0 AND "folha_progresso"."progresso_percentual" <= 100),
	CONSTRAINT "chk_progresso_contadores" CHECK ("folha_progresso"."itens_processados" >= 0 AND "folha_progresso"."itens_com_erro" >= 0 AND "folha_progresso"."itens_processados" <= "folha_progresso"."total_itens")
);
--> statement-breakpoint
CREATE TABLE "inss_tabelas_custom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"teto_contribuicao" numeric(15, 2) NOT NULL,
	"desconto_maximo" numeric(15, 2) NOT NULL,
	"fundamentacao_legal" text NOT NULL,
	"motivo_override" text NOT NULL,
	"observacoes" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "chk_inss_custom_vigencia" CHECK ("inss_tabelas_custom"."vigencia_fim" IS NULL OR "inss_tabelas_custom"."vigencia_fim" > "inss_tabelas_custom"."vigencia_inicio")
);
--> statement-breakpoint
CREATE TABLE "inss_tabelas_custom_faixas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tabela_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"faixa_inicio" numeric(15, 2) NOT NULL,
	"faixa_fim" numeric(15, 2) NOT NULL,
	"aliquota" numeric(6, 4) NOT NULL,
	"parcela_deduzir" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "irrf_tabelas_custom" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"deducao_por_dependente" numeric(15, 2) NOT NULL,
	"desconto_simplificado" numeric(15, 2) NOT NULL,
	"isencao_maior_65_anos" numeric(15, 2) NOT NULL,
	"redutor_base" numeric(15, 2),
	"redutor_fator" numeric(10, 8),
	"redutor_renda_maxima" numeric(15, 2),
	"fundamentacao_legal" text NOT NULL,
	"motivo_override" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "irrf_tabelas_custom_faixas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tabela_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"base_inicio" numeric(15, 2) NOT NULL,
	"base_fim" numeric(15, 2),
	"aliquota" numeric(6, 4) NOT NULL,
	"parcela_deduzir" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pessoa_dependentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cpf" varchar(14),
	"data_nascimento" date NOT NULL,
	"parentesco" "parentesco" NOT NULL,
	"invalido" boolean DEFAULT false NOT NULL,
	"dependente_ir" boolean DEFAULT false NOT NULL,
	"dependente_salario_familia" boolean DEFAULT false NOT NULL,
	"dependente_plano_saude" boolean DEFAULT false NOT NULL,
	"data_inicio_dependencia" date NOT NULL,
	"data_fim_dependencia" date,
	"documento_url" text,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "chk_dep_vigencia" CHECK ("pessoa_dependentes"."data_fim_dependencia" IS NULL OR "pessoa_dependentes"."data_fim_dependencia" > "pessoa_dependentes"."data_inicio_dependencia")
);
--> statement-breakpoint
CREATE TABLE "rpps_aliquotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"aliquota_servidor" numeric(6, 4) NOT NULL,
	"aliquota_patronal_normal" numeric(6, 4) NOT NULL,
	"aliquota_patronal_suplementar" numeric(6, 4),
	"teto_contribuicao" numeric(15, 2),
	"salario_familia_valor" numeric(15, 2),
	"salario_familia_renda_maxima" numeric(15, 2),
	"fundamentacao_legal" text NOT NULL,
	"observacoes" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "chk_rpps_aliq_servidor" CHECK ("rpps_aliquotas"."aliquota_servidor" >= 0 AND "rpps_aliquotas"."aliquota_servidor" <= 1),
	CONSTRAINT "chk_rpps_aliq_patronal" CHECK ("rpps_aliquotas"."aliquota_patronal_normal" >= 0 AND "rpps_aliquotas"."aliquota_patronal_normal" <= 1),
	CONSTRAINT "chk_rpps_vigencia" CHECK ("rpps_aliquotas"."vigencia_fim" IS NULL OR "rpps_aliquotas"."vigencia_fim" > "rpps_aliquotas"."vigencia_inicio")
);
--> statement-breakpoint
CREATE TABLE "vinculo_dotacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"dotacao_id" uuid NOT NULL,
	"natureza" text NOT NULL,
	"percentual" numeric(5, 4) DEFAULT '1.0000' NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "chk_vd_percentual" CHECK ("vinculo_dotacoes"."percentual" > 0 AND "vinculo_dotacoes"."percentual" <= 1),
	CONSTRAINT "chk_vd_vigencia" CHECK ("vinculo_dotacoes"."vigencia_fim" IS NULL OR "vinculo_dotacoes"."vigencia_fim" > "vinculo_dotacoes"."vigencia_inicio")
);
--> statement-breakpoint
ALTER TABLE "rubricas" ADD COLUMN "estrategia_proporcionalidade" "estrategia_proporcionalidade" DEFAULT 'DIAS_REGISTRADOS' NOT NULL;--> statement-breakpoint
ALTER TABLE "rubricas" ADD COLUMN "codigo_esocial" text;--> statement-breakpoint
ALTER TABLE "rubricas" ADD COLUMN "rubrica_esocial_descricao" text;--> statement-breakpoint
ALTER TABLE "rubricas" ADD COLUMN "permite_retroativo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consignacoes_ativas" ADD CONSTRAINT "consignacoes_ativas_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignacoes_ativas" ADD CONSTRAINT "consignacoes_ativas_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignacoes_ativas" ADD CONSTRAINT "consignacoes_ativas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_eventos_funcional" ADD CONSTRAINT "folha_eventos_funcional_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_eventos_funcional" ADD CONSTRAINT "folha_eventos_funcional_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_processamento_log" ADD CONSTRAINT "folha_processamento_log_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_processamento_log" ADD CONSTRAINT "folha_processamento_log_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_progresso" ADD CONSTRAINT "folha_progresso_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inss_tabelas_custom" ADD CONSTRAINT "inss_tabelas_custom_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inss_tabelas_custom_faixas" ADD CONSTRAINT "inss_tabelas_custom_faixas_tabela_id_inss_tabelas_custom_id_fk" FOREIGN KEY ("tabela_id") REFERENCES "public"."inss_tabelas_custom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irrf_tabelas_custom" ADD CONSTRAINT "irrf_tabelas_custom_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irrf_tabelas_custom_faixas" ADD CONSTRAINT "irrf_tabelas_custom_faixas_tabela_id_irrf_tabelas_custom_id_fk" FOREIGN KEY ("tabela_id") REFERENCES "public"."irrf_tabelas_custom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_dependentes" ADD CONSTRAINT "pessoa_dependentes_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoa_dependentes" ADD CONSTRAINT "pessoa_dependentes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpps_aliquotas" ADD CONSTRAINT "rpps_aliquotas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_dotacoes" ADD CONSTRAINT "vinculo_dotacoes_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_dotacoes" ADD CONSTRAINT "vinculo_dotacoes_dotacao_id_dotacoes_id_fk" FOREIGN KEY ("dotacao_id") REFERENCES "public"."dotacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_dotacoes" ADD CONSTRAINT "vinculo_dotacoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_consig_pessoa_ativa" ON "consignacoes_ativas" USING btree ("pessoa_id","ativa") WHERE "consignacoes_ativas"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_consig_vinculo" ON "consignacoes_ativas" USING btree ("vinculo_id") WHERE "consignacoes_ativas"."deleted_at" IS NULL AND "consignacoes_ativas"."ativa" = true;--> statement-breakpoint
CREATE INDEX "idx_eventos_vinculo_competencia" ON "folha_eventos_funcional" USING btree ("vinculo_id","competencia") WHERE "folha_eventos_funcional"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_eventos_competencia" ON "folha_eventos_funcional" USING btree ("competencia") WHERE "folha_eventos_funcional"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_proc_log_folha_vinculo" ON "folha_processamento_log" USING btree ("folha_id","vinculo_id","versao");--> statement-breakpoint
CREATE INDEX "idx_proc_log_competencia" ON "folha_processamento_log" USING btree ("competencia");--> statement-breakpoint
CREATE INDEX "idx_proc_log_hash" ON "folha_processamento_log" USING btree ("hash_sha256");--> statement-breakpoint
CREATE INDEX "idx_progresso_folha" ON "folha_progresso" USING btree ("folha_id","iniciado_em");--> statement-breakpoint
CREATE INDEX "idx_progresso_job" ON "folha_progresso" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_progresso_status" ON "folha_progresso" USING btree ("status","iniciado_em");--> statement-breakpoint
CREATE INDEX "idx_inss_custom_vigencia" ON "inss_tabelas_custom" USING btree ("vigencia_inicio","vigencia_fim") WHERE "inss_tabelas_custom"."deleted_at" IS NULL AND "inss_tabelas_custom"."ativa" = true;--> statement-breakpoint
CREATE INDEX "idx_inss_custom_faixas_tabela" ON "inss_tabelas_custom_faixas" USING btree ("tabela_id","ordem");--> statement-breakpoint
CREATE INDEX "idx_irrf_custom_vigencia" ON "irrf_tabelas_custom" USING btree ("vigencia_inicio","vigencia_fim") WHERE "irrf_tabelas_custom"."deleted_at" IS NULL AND "irrf_tabelas_custom"."ativa" = true;--> statement-breakpoint
CREATE INDEX "idx_irrf_custom_faixas_tabela" ON "irrf_tabelas_custom_faixas" USING btree ("tabela_id","ordem");--> statement-breakpoint
CREATE INDEX "idx_dependentes_pessoa" ON "pessoa_dependentes" USING btree ("pessoa_id") WHERE "pessoa_dependentes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_dependentes_cpf" ON "pessoa_dependentes" USING btree ("cpf") WHERE "pessoa_dependentes"."deleted_at" IS NULL AND "pessoa_dependentes"."cpf" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_rpps_vigencia" ON "rpps_aliquotas" USING btree ("vigencia_inicio","vigencia_fim") WHERE "rpps_aliquotas"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_vinc_dot_vinculo_natureza" ON "vinculo_dotacoes" USING btree ("vinculo_id","natureza") WHERE "vinculo_dotacoes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_vinc_dot_dotacao" ON "vinculo_dotacoes" USING btree ("dotacao_id") WHERE "vinculo_dotacoes"."deleted_at" IS NULL;