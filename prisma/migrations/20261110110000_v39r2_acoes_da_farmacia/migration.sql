-- V39-R2 (R2-030/031, M37) — as acoes da dispensacao e do ajuste (perda ou sobra) da farmacia.
--
-- Migration propria: `ALTER TYPE ... ADD VALUE` nao pode ser usado na mesma transacao em que e criado, e o Prisma roda
-- cada migration numa transacao (o mesmo motivo da 20261110070000_v39r2_acoes_do_resultado_da_licitacao). Aditiva.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'DISPENSAR_MEDICAMENTO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'REGISTRAR_AJUSTE_DA_FARMACIA';
