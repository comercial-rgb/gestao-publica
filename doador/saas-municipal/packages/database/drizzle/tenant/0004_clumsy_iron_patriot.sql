CREATE TYPE "public"."credito_origem" AS ENUM('superavit_financeiro', 'excesso_arrecadacao', 'anulacao_dotacao', 'operacao_credito', 'reserva_contingencia');--> statement-breakpoint
CREATE TYPE "public"."credito_status" AS ENUM('em_elaboracao', 'aprovado', 'aplicado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."credito_tipo" AS ENUM('suplementar', 'especial', 'extraordinario');--> statement-breakpoint
CREATE TYPE "public"."fonte_tipo" AS ENUM('stn', 'local');--> statement-breakpoint
CREATE TYPE "public"."lei_orcamentaria_status" AS ENUM('em_elaboracao', 'em_tramitacao', 'sancionada', 'em_execucao', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."lei_orcamentaria_tipo" AS ENUM('ppa', 'loa');--> statement-breakpoint
CREATE TYPE "public"."modalidade_tipo" AS ENUM('stn', 'local');--> statement-breakpoint
CREATE TABLE "acoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programa_id" uuid NOT NULL,
	"codigo" varchar(10) NOT NULL,
	"nome" varchar(300) NOT NULL,
	"tipo" integer NOT NULL,
	"descricao" text,
	"unidade_medida" varchar(50),
	"produto" varchar(200),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creditos_dotacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credito_id" uuid NOT NULL,
	"dotacao_id" uuid NOT NULL,
	"sinal" integer NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creditos_orcamentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercicio_id" uuid NOT NULL,
	"lei_orcamentaria_id" uuid NOT NULL,
	"numero" varchar(50) NOT NULL,
	"tipo" "credito_tipo" NOT NULL,
	"origem" "credito_origem" NOT NULL,
	"valor" numeric(18, 2) NOT NULL,
	"data_decreto" date NOT NULL,
	"data_publicacao" date,
	"justificativa" text NOT NULL,
	"texto_juridico_id" uuid,
	"status" "credito_status" DEFAULT 'em_elaboracao' NOT NULL,
	"aplicado_em" timestamp with time zone,
	"aplicado_por_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "dotacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lei_orcamentaria_id" uuid NOT NULL,
	"exercicio_id" uuid NOT NULL,
	"classificacao_completa" varchar(50) NOT NULL,
	"entidade_id" uuid NOT NULL,
	"orgao_codigo" varchar(2) NOT NULL,
	"unidade_codigo" varchar(2) NOT NULL,
	"funcao_codigo" varchar(2) NOT NULL,
	"subfuncao_codigo" varchar(3) NOT NULL,
	"programa_id" uuid NOT NULL,
	"acao_id" uuid NOT NULL,
	"natureza_categoria" varchar(1) NOT NULL,
	"natureza_grupo" varchar(1) NOT NULL,
	"modalidade_aplicacao_id" uuid NOT NULL,
	"natureza_elemento" varchar(2) NOT NULL,
	"natureza_subelemento" varchar(2),
	"fonte_recurso_id" uuid NOT NULL,
	"indicador_resultado_primario" varchar(1),
	"valor_inicial" numeric(18, 2) NOT NULL,
	"valor_atualizado" numeric(18, 2) NOT NULL,
	"valor_reservado" numeric(18, 2) DEFAULT '0' NOT NULL,
	"valor_empenhado" numeric(18, 2) DEFAULT '0' NOT NULL,
	"valor_liquidado" numeric(18, 2) DEFAULT '0' NOT NULL,
	"valor_pago" numeric(18, 2) DEFAULT '0' NOT NULL,
	"identificador_msc" varchar(50),
	"informacao_complementar" jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "dotacoes_historico_valor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dotacao_id" uuid NOT NULL,
	"credito_id" uuid,
	"valor_anterior" numeric(18, 2) NOT NULL,
	"valor_novo" numeric(18, 2) NOT NULL,
	"delta" numeric(18, 2) NOT NULL,
	"motivo" varchar(300) NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"registrado_por_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "fontes_recurso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"descricao" varchar(300) NOT NULL,
	"grupo" varchar(5),
	"categoria" varchar(50),
	"tipo" "fonte_tipo" DEFAULT 'stn' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fontes_recurso_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "leis_orcamentarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "lei_orcamentaria_tipo" NOT NULL,
	"numero" varchar(50) NOT NULL,
	"descricao" varchar(300) NOT NULL,
	"ano_inicio" integer NOT NULL,
	"ano_fim" integer NOT NULL,
	"data_sancao" date,
	"data_publicacao" date,
	"valor_total" numeric(18, 2),
	"status" "lei_orcamentaria_status" DEFAULT 'em_elaboracao' NOT NULL,
	"observacoes" text,
	"texto_juridico_id" uuid,
	"ppa_vigente_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "modalidades_aplicacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(2) NOT NULL,
	"descricao" varchar(200) NOT NULL,
	"tipo" "modalidade_tipo" DEFAULT 'stn' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modalidades_aplicacao_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "programas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ppa_id" uuid NOT NULL,
	"codigo" varchar(10) NOT NULL,
	"nome" varchar(300) NOT NULL,
	"objetivo" text,
	"publico_alvo" varchar(300),
	"horizonte_temporal" varchar(50),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acoes" ADD CONSTRAINT "acoes_programa_id_programas_id_fk" FOREIGN KEY ("programa_id") REFERENCES "public"."programas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_dotacoes" ADD CONSTRAINT "creditos_dotacoes_credito_id_creditos_orcamentarios_id_fk" FOREIGN KEY ("credito_id") REFERENCES "public"."creditos_orcamentarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_dotacoes" ADD CONSTRAINT "creditos_dotacoes_dotacao_id_dotacoes_id_fk" FOREIGN KEY ("dotacao_id") REFERENCES "public"."dotacoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_orcamentarios" ADD CONSTRAINT "creditos_orcamentarios_exercicio_id_exercicios_id_fk" FOREIGN KEY ("exercicio_id") REFERENCES "public"."exercicios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_orcamentarios" ADD CONSTRAINT "creditos_orcamentarios_lei_orcamentaria_id_leis_orcamentarias_id_fk" FOREIGN KEY ("lei_orcamentaria_id") REFERENCES "public"."leis_orcamentarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_orcamentarios" ADD CONSTRAINT "creditos_orcamentarios_texto_juridico_id_textos_juridicos_id_fk" FOREIGN KEY ("texto_juridico_id") REFERENCES "public"."textos_juridicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_orcamentarios" ADD CONSTRAINT "creditos_orcamentarios_aplicado_por_user_id_users_id_fk" FOREIGN KEY ("aplicado_por_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_orcamentarios" ADD CONSTRAINT "creditos_orcamentarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes" ADD CONSTRAINT "dotacoes_lei_orcamentaria_id_leis_orcamentarias_id_fk" FOREIGN KEY ("lei_orcamentaria_id") REFERENCES "public"."leis_orcamentarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes" ADD CONSTRAINT "dotacoes_exercicio_id_exercicios_id_fk" FOREIGN KEY ("exercicio_id") REFERENCES "public"."exercicios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes" ADD CONSTRAINT "dotacoes_entidade_id_entidades_id_fk" FOREIGN KEY ("entidade_id") REFERENCES "public"."entidades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes" ADD CONSTRAINT "dotacoes_programa_id_programas_id_fk" FOREIGN KEY ("programa_id") REFERENCES "public"."programas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes" ADD CONSTRAINT "dotacoes_acao_id_acoes_id_fk" FOREIGN KEY ("acao_id") REFERENCES "public"."acoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes" ADD CONSTRAINT "dotacoes_modalidade_aplicacao_id_modalidades_aplicacao_id_fk" FOREIGN KEY ("modalidade_aplicacao_id") REFERENCES "public"."modalidades_aplicacao"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes" ADD CONSTRAINT "dotacoes_fonte_recurso_id_fontes_recurso_id_fk" FOREIGN KEY ("fonte_recurso_id") REFERENCES "public"."fontes_recurso"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes" ADD CONSTRAINT "dotacoes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes_historico_valor" ADD CONSTRAINT "dotacoes_historico_valor_dotacao_id_dotacoes_id_fk" FOREIGN KEY ("dotacao_id") REFERENCES "public"."dotacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes_historico_valor" ADD CONSTRAINT "dotacoes_historico_valor_credito_id_creditos_orcamentarios_id_fk" FOREIGN KEY ("credito_id") REFERENCES "public"."creditos_orcamentarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotacoes_historico_valor" ADD CONSTRAINT "dotacoes_historico_valor_registrado_por_user_id_users_id_fk" FOREIGN KEY ("registrado_por_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leis_orcamentarias" ADD CONSTRAINT "leis_orcamentarias_texto_juridico_id_textos_juridicos_id_fk" FOREIGN KEY ("texto_juridico_id") REFERENCES "public"."textos_juridicos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leis_orcamentarias" ADD CONSTRAINT "leis_orcamentarias_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programas" ADD CONSTRAINT "programas_ppa_id_leis_orcamentarias_id_fk" FOREIGN KEY ("ppa_id") REFERENCES "public"."leis_orcamentarias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acoes_prog_codigo_idx" ON "acoes" USING btree ("programa_id","codigo");--> statement-breakpoint
CREATE INDEX "creditos_dot_credito_idx" ON "creditos_dotacoes" USING btree ("credito_id");--> statement-breakpoint
CREATE INDEX "creditos_dot_dotacao_idx" ON "creditos_dotacoes" USING btree ("dotacao_id");--> statement-breakpoint
CREATE INDEX "creditos_exerc_status_idx" ON "creditos_orcamentarios" USING btree ("exercicio_id","status");--> statement-breakpoint
CREATE INDEX "creditos_numero_idx" ON "creditos_orcamentarios" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "dotacoes_lei_class_idx" ON "dotacoes" USING btree ("lei_orcamentaria_id","classificacao_completa");--> statement-breakpoint
CREATE INDEX "dotacoes_exercicio_idx" ON "dotacoes" USING btree ("exercicio_id");--> statement-breakpoint
CREATE INDEX "dotacoes_entidade_idx" ON "dotacoes" USING btree ("entidade_id");--> statement-breakpoint
CREATE INDEX "dotacoes_programa_idx" ON "dotacoes" USING btree ("programa_id");--> statement-breakpoint
CREATE INDEX "dotacoes_acao_idx" ON "dotacoes" USING btree ("acao_id");--> statement-breakpoint
CREATE INDEX "dotacoes_funcao_idx" ON "dotacoes" USING btree ("funcao_codigo","subfuncao_codigo");--> statement-breakpoint
CREATE INDEX "dotacoes_fonte_idx" ON "dotacoes" USING btree ("fonte_recurso_id");--> statement-breakpoint
CREATE INDEX "dot_hist_dotacao_idx" ON "dotacoes_historico_valor" USING btree ("dotacao_id","registrado_em");--> statement-breakpoint
CREATE INDEX "dot_hist_credito_idx" ON "dotacoes_historico_valor" USING btree ("credito_id");--> statement-breakpoint
CREATE INDEX "leis_orc_tipo_ano_idx" ON "leis_orcamentarias" USING btree ("tipo","ano_inicio");--> statement-breakpoint
CREATE INDEX "leis_orc_status_idx" ON "leis_orcamentarias" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "programas_ppa_codigo_idx" ON "programas" USING btree ("ppa_id","codigo");