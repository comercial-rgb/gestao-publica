-- Sessão noturna V4 (§8, Fila A) — M16: as dez ações do planejamento plurianual (M02b), conciliadas
-- do siafic-cg c04ad5a. SEPARADA das tabelas: `ALTER TYPE ADD VALUE` em enum existente não convive
-- com o uso do valor na mesma transação (mesma lição das migrations `_acoes_*`).
--
-- ⚠️ DEZ AÇÕES PARA VINTE SERVIÇOS, agrupadas pelos ANEXOS DA LRF — quem monta o Anexo de Metas
-- Fiscais (art. 4º §1º) não é quem monta o de Riscos (art. 4º §3º); quem cadastra a árvore temática
-- do PPA não é quem lança as previsões de receita do quadriênio. Ver `modules/m16-travamento/acoes.ts`.
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_PPA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_ESTRUTURA_PPA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_PROGRAMA_PPA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_RECEITA_PPA';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_LDO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_PRIORIDADE_LDO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_METAS_FISCAIS_LDO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_RISCOS_FISCAIS_LDO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_RENUNCIA_RECEITA_LDO';
ALTER TYPE "AcaoDoSistema" ADD VALUE 'CADASTRAR_ALIENACAO_LDO';
