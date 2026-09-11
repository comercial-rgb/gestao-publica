CREATE TABLE "esocial_eventos_pendentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo_evento" text NOT NULL,
	"id_evento" text NOT NULL,
	"folha_id" uuid,
	"vinculo_id" uuid,
	"competencia" date,
	"xml" text NOT NULL,
	"hash_sha256" varchar(64) NOT NULL,
	"status" text DEFAULT 'TO_SEND' NOT NULL,
	"ambiente" text DEFAULT 'TESTE' NOT NULL,
	"numero_recibo" text,
	"mensagem_erro" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_em" timestamp with time zone,
	"worker_id" text,
	CONSTRAINT "chk_eep_status" CHECK ("esocial_eventos_pendentes"."status" IN ('TO_SEND', 'SENDING', 'SENT_OK', 'SENT_ERROR', 'RETIFICAR', 'CANCELADO')),
	CONSTRAINT "chk_eep_tipo_evento" CHECK ("esocial_eventos_pendentes"."tipo_evento" IN ('S-1200', 'S-1202', 'S-1210', 'S-1295', 'S-1299')),
	CONSTRAINT "chk_eep_tentativas" CHECK ("esocial_eventos_pendentes"."tentativas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vinculo_rubricas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vinculo_id" uuid NOT NULL,
	"rubrica_id" uuid NOT NULL,
	"valor_base" numeric(15, 2),
	"parametros" jsonb,
	"ordem_calculo" integer DEFAULT 100 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"origem" text DEFAULT 'VINCULO_OVERRIDE' NOT NULL,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "chk_vr_valor_base" CHECK ("vinculo_rubricas"."valor_base" IS NULL OR "vinculo_rubricas"."valor_base" >= 0),
	CONSTRAINT "chk_vr_vigencia" CHECK ("vinculo_rubricas"."vigencia_fim" IS NULL OR "vinculo_rubricas"."vigencia_fim" > "vinculo_rubricas"."vigencia_inicio"),
	CONSTRAINT "chk_vr_origem" CHECK ("vinculo_rubricas"."origem" IN ('CARGO_DEFAULT', 'VINCULO_OVERRIDE', 'ACORDO_JUDICIAL'))
);
--> statement-breakpoint
ALTER TABLE "esocial_eventos_pendentes" ADD CONSTRAINT "esocial_eventos_pendentes_folha_id_folhas_id_fk" FOREIGN KEY ("folha_id") REFERENCES "public"."folhas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esocial_eventos_pendentes" ADD CONSTRAINT "esocial_eventos_pendentes_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_rubricas" ADD CONSTRAINT "vinculo_rubricas_vinculo_id_vinculos_funcionais_id_fk" FOREIGN KEY ("vinculo_id") REFERENCES "public"."vinculos_funcionais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_rubricas" ADD CONSTRAINT "vinculo_rubricas_rubrica_id_rubricas_id_fk" FOREIGN KEY ("rubrica_id") REFERENCES "public"."rubricas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_rubricas" ADD CONSTRAINT "vinculo_rubricas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_eep_id_evento" ON "esocial_eventos_pendentes" USING btree ("id_evento");--> statement-breakpoint
CREATE INDEX "idx_eep_status" ON "esocial_eventos_pendentes" USING btree ("status","gerado_em");--> statement-breakpoint
CREATE INDEX "idx_eep_folha_vinculo" ON "esocial_eventos_pendentes" USING btree ("folha_id","vinculo_id");--> statement-breakpoint
CREATE INDEX "idx_eep_competencia" ON "esocial_eventos_pendentes" USING btree ("competencia");--> statement-breakpoint
CREATE INDEX "idx_vr_vinculo_ativa" ON "vinculo_rubricas" USING btree ("vinculo_id","ativa") WHERE "vinculo_rubricas"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_vr_rubrica" ON "vinculo_rubricas" USING btree ("rubrica_id") WHERE "vinculo_rubricas"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vr_vinculo_rubrica_vigencia" ON "vinculo_rubricas" USING btree ("vinculo_id","rubrica_id","vigencia_inicio") WHERE "vinculo_rubricas"."deleted_at" IS NULL;