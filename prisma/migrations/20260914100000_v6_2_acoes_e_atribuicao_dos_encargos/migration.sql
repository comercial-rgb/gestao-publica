-- V6.2 — os encargos do empregador sobre a folha (PATRONAL-NA-MEMORIA): quatro ações e a atribuição
-- própria do atesto dos encargos.
--
-- CADASTRAR_ENCARGO_DA_FOLHA cadastra componente e versão de parâmetro; APROVAR_ENCARGO_DA_FOLHA os
-- aprova (outra pessoa — o serviço recusa quem cadastrou); APURAR_ENCARGOS_DA_FOLHA apura sobre o
-- cálculo fechado; CERTIFICAR_ENCARGOS_DA_FOLHA atesta a apuração, e exige designação vigente com a
-- atribuição CERTIFICAR_ENCARGOS_DA_FOLHA — o atesto da folha salarial não é o atesto dos encargos.
-- SEPARADA das tabelas: ALTER TYPE ADD VALUE não convive com o uso do valor na mesma transação.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_ENCARGO_DA_FOLHA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'APROVAR_ENCARGO_DA_FOLHA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'APURAR_ENCARGOS_DA_FOLHA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CERTIFICAR_ENCARGOS_DA_FOLHA';
ALTER TYPE "AtribuicaoNaFolha" ADD VALUE 'CERTIFICAR_ENCARGOS_DA_FOLHA';
