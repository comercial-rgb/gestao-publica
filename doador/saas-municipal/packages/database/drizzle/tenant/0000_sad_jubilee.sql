CREATE TYPE "public"."entidade_tipo" AS ENUM('prefeitura', 'camara', 'fundo', 'autarquia', 'fundacao', 'empresa_publica', 'sociedade_economia_mista', 'consorcio', 'outro');--> statement-breakpoint
CREATE TYPE "public"."pessoa_tipo" AS ENUM('PF', 'PJ');--> statement-breakpoint
CREATE TYPE "public"."texto_juridico_tipo" AS ENUM('lei', 'lei_complementar', 'decreto', 'portaria', 'instrucao_normativa', 'resolucao', 'edital', 'contrato', 'convenio', 'outro');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'pending', 'suspended');--> statement-breakpoint
CREATE TABLE "anexos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" varchar(60) NOT NULL,
	"resource_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"size" integer NOT NULL,
	"s3_key" varchar(500) NOT NULL,
	"checksum" varchar(64),
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"nome" varchar(200) NOT NULL,
	"tipo" "entidade_tipo" NOT NULL,
	"cnpj" varchar(14),
	"responsavel_pessoa_id" uuid,
	"responsavel_cargo" varchar(100),
	"parent_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entidades_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "entidades_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "estruturas_organizacionais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entidade_id" uuid NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"nome" varchar(200) NOT NULL,
	"nivel" integer DEFAULT 1 NOT NULL,
	"parent_id" uuid,
	"responsavel_pessoa_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"module" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "pessoa_tipo" NOT NULL,
	"documento" varchar(14) NOT NULL,
	"nome" varchar(200) NOT NULL,
	"nome_fantasia" varchar(200),
	"rg" varchar(20),
	"data_nascimento" date,
	"sexo" varchar(1),
	"estado_civil" varchar(20),
	"inscricao_estadual" varchar(30),
	"inscricao_municipal" varchar(30),
	"email" varchar(200),
	"telefone" varchar(20),
	"cep" varchar(8),
	"logradouro" varchar(200),
	"numero" varchar(20),
	"complemento" varchar(100),
	"bairro" varchar(100),
	"cidade" varchar(100),
	"uf" varchar(2),
	"observacoes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "pessoas_documento_unique" UNIQUE("documento")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(60) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"resource" varchar(100),
	"resource_id" varchar(100),
	"before" jsonb,
	"after" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "textos_juridicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" texto_juridico_tipo NOT NULL,
	"numero" varchar(50) NOT NULL,
	"ano" integer NOT NULL,
	"ementa" text NOT NULL,
	"conteudo" text,
	"data_publicacao" date NOT NULL,
	"data_vigencia_inicio" date,
	"data_vigencia_fim" date,
	"entidade_id" uuid,
	"revogado_por" uuid,
	"revogado_em" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(200) NOT NULL,
	"name" varchar(200) NOT NULL,
	"cpf" varchar(11),
	"password_hash" text,
	"gov_br_subject" varchar(100),
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"entidade_id" uuid,
	"last_login_at" timestamp with time zone,
	"two_factor_secret" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_cpf_unique" UNIQUE("cpf"),
	CONSTRAINT "users_gov_br_subject_unique" UNIQUE("gov_br_subject")
);
--> statement-breakpoint
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entidades" ADD CONSTRAINT "entidades_responsavel_pessoa_id_pessoas_id_fk" FOREIGN KEY ("responsavel_pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estruturas_organizacionais" ADD CONSTRAINT "estruturas_organizacionais_entidade_id_entidades_id_fk" FOREIGN KEY ("entidade_id") REFERENCES "public"."entidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estruturas_organizacionais" ADD CONSTRAINT "estruturas_organizacionais_responsavel_pessoa_id_pessoas_id_fk" FOREIGN KEY ("responsavel_pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textos_juridicos" ADD CONSTRAINT "textos_juridicos_entidade_id_entidades_id_fk" FOREIGN KEY ("entidade_id") REFERENCES "public"."entidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textos_juridicos" ADD CONSTRAINT "textos_juridicos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_entidade_id_entidades_id_fk" FOREIGN KEY ("entidade_id") REFERENCES "public"."entidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anexos_resource_idx" ON "anexos" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "estruturas_org_entidade_idx" ON "estruturas_organizacionais" USING btree ("entidade_id");--> statement-breakpoint
CREATE INDEX "estruturas_org_parent_idx" ON "estruturas_organizacionais" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "permissions_module_idx" ON "permissions" USING btree ("module");--> statement-breakpoint
CREATE UNIQUE INDEX "pessoas_documento_idx" ON "pessoas" USING btree ("documento");--> statement-breakpoint
CREATE INDEX "pessoas_nome_idx" ON "pessoas" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "pessoas_tipo_idx" ON "pessoas" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "pessoas_created_at_idx" ON "pessoas" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tenant_audit_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenant_audit_resource_idx" ON "audit_log" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX "tenant_audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "textos_juridicos_tipo_ano_idx" ON "textos_juridicos" USING btree ("tipo","ano");--> statement-breakpoint
CREATE UNIQUE INDEX "textos_juridicos_numero_ano_idx" ON "textos_juridicos" USING btree ("tipo","numero","ano");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");