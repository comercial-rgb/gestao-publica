ALTER TABLE "folhas" ADD COLUMN "reaberta_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "folhas" ADD COLUMN "reaberta_por" uuid;--> statement-breakpoint
ALTER TABLE "folhas" ADD COLUMN "motivo_reabertura" text;--> statement-breakpoint
ALTER TABLE "folhas" ADD COLUMN "cancelada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "folhas" ADD COLUMN "cancelada_por" uuid;--> statement-breakpoint
ALTER TABLE "folhas" ADD COLUMN "motivo_cancelamento" text;--> statement-breakpoint
ALTER TABLE "folhas" ADD CONSTRAINT "folhas_reaberta_por_users_id_fk" FOREIGN KEY ("reaberta_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folhas" ADD CONSTRAINT "folhas_cancelada_por_users_id_fk" FOREIGN KEY ("cancelada_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;