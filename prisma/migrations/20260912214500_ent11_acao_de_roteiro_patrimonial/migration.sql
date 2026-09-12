-- AlterEnum
--
-- ENT11 — a ação do censo que parametriza o roteiro contábil do patrimônio.
--
-- ADITIVA E DE UM VALOR SÓ: `ALTER TYPE ... ADD VALUE` não remove nem renomeia nada, e um
-- único valor por migration evita a limitação do PostgreSQL <= 11 que a migration do ENT07
-- documenta. Zero DROP.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'PARAMETRIZAR_ROTEIRO_PATRIMONIAL';
