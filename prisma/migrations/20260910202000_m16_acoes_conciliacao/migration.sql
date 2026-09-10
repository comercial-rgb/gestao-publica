-- M16 — as quatro acoes da conciliacao como objeto discreto (ENT03a). Aditivo.
--
-- ABRIR e ENCERRAR sao SEPARADAS: encerrar e o ato que o controle interno le como
-- "isto foi conferido", e quem opera a conciliacao no dia a dia nao e
-- necessariamente quem assina o fechamento (TR 6.4).
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'ABRIR_CONCILIACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'ENCERRAR_CONCILIACAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'REGISTRAR_PENDENCIA_MANUAL';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'JUSTIFICAR_PENDENCIA';
