-- V36 (TR 5.10.1.45) — a ordem das datas da multa de trânsito no banco (o serviço já confere; aqui a garantia dura). Aditiva.
ALTER TABLE "MultaDeTransito" ADD CONSTRAINT "MultaDeTransito_notificacao_depois_da_infracao" CHECK ("dataDaNotificacao" >= "dataDaInfracao");
ALTER TABLE "MultaDeTransito" ADD CONSTRAINT "MultaDeTransito_vencimento_depois_da_notificacao" CHECK ("vencimento" IS NULL OR "vencimento" >= "dataDaNotificacao");
