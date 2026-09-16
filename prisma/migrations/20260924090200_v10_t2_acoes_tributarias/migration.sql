-- V10 T2 (N5) — as ações do lançamento tributário e da certidão. Aditiva: seis valores de enum.
--
-- ⚠️ MIGRATION PRÓPRIA, E ELA NASCEU DE UM DEFEITO REAL — vale registrar, porque a próxima
-- pessoa vai repetir. Estes seis valores existiam na primeira versão da migration das tabelas.
-- Ao refazer aquela migration (o lote ganhou natureza e fonte), o SQL foi REGERADO por
-- `prisma migrate diff` contra o banco de DESENVOLVIMENTO — que já tinha os seis valores da
-- aplicação anterior. O diff, corretamente, não viu diferença nenhuma, e os `ALTER TYPE`
-- desapareceram do arquivo sem que nada reclamasse.
--
-- O modo de falha é o pior possível: em dev tudo funciona (os valores estão lá), e o banco de
-- TESTE — que aplica as migrations do zero — quebra em `semearUsuariosDeTeste`, a quilômetros
-- daqui, com "invalid input value for enum". Foi exatamente assim que apareceu.
--
-- A lição: `migrate diff` contra um banco JÁ ALTERADO à mão produz uma migration que descreve
-- o delta daquele banco, não o delta de uma instalação limpa. Os valores de enum ficam num
-- arquivo próprio — como a V9 já fazia em
-- `20260923090100_v9_n4_acao_estornar_recebimento` — para que refazer a migration das tabelas
-- nunca mais possa levá-los junto.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'PREPARAR_LANCAMENTO_TRIBUTARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'CONSTITUIR_CREDITO_TRIBUTARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'RETIFICAR_LANCAMENTO_TRIBUTARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'CANCELAR_LANCAMENTO_TRIBUTARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'SOLICITAR_CERTIDAO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'DECIDIR_CERTIDAO';
