-- ENT05 — a contagem de inventário de um material SEM lote é única por inventário.
--
-- ⚠️ POR QUE O @@unique DO PRISMA NÃO BASTA. O modelo declara
-- `@@unique([inventarioId, materialId, loteId])`, e no Postgres um índice único NÃO
-- restringe linhas em que alguma coluna é NULL: dois NULL são considerados DISTINTOS.
-- Como `loteId` é nulo para todo material que não controla lote — que é a maioria do
-- almoxarifado —, aquele índice não impede NADA no caso comum.
--
-- O efeito, se ficasse assim: a mesma comissão contaria o mesmo material duas vezes no
-- mesmo inventário, as duas linhas coexistiriam, e a divergência (contado menos a
-- posição calculada) sairia somando as duas contagens — acusando uma sobra que não
-- existe, e mandando lançar um ajuste contábil sobre ela.
--
-- Índice único PARCIAL (o Prisma não representa índices parciais e os ignora no diff).
CREATE UNIQUE INDEX uq_contagem_de_inventario_sem_lote
  ON "ContagemDeInventario" ("inventarioId", "materialId")
  WHERE "loteId" IS NULL;
