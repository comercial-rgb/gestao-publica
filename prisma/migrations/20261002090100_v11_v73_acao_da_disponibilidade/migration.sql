-- V11 V7.3 — a ação nova do censo, em migration PRÓPRIA.
--
-- ⚠️ ARQUIVO SEPARADO, E ISSO É EXIGÊNCIA DO POSTGRES, não organização. Um valor novo de enum só
-- pode ser USADO depois que a transação que o adicionou tiver COMMITADO. No mesmo arquivo que a
-- estrutura, a primeira gravação que o citasse morreria com "unsafe use of new value".
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO';
