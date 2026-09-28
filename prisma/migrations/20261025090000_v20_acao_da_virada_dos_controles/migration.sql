-- V20 — a acao que declara o DESTINO de cada conta de controle na virada.
--
-- Migration PROPRIA, e nao junto de tabela nenhuma: `ALTER TYPE ... ADD VALUE` nao pode ser usado na
-- mesma transacao em que o tipo e alterado, e o Prisma roda cada migration numa transacao. Licao da
-- V15, pratica desde a V16.
--
-- ⚠️ NENHUMA TABELA NOVA. `ContaNaVirada` existe desde a V15 (contaId unico, destino, justificativa
-- obrigatoria) e nunca teve escritor fora de arquivo de teste — medido: quatro ocorrencias de
-- `contaNaVirada.create`, todas em `.test.ts`. O que faltava nao era estrutura: era a acao que
-- autoriza escrever nela, e a borda que a alcanca.
--
-- ⚠️ E ELA E SEPARADA DE `ENCERRAR_CONTROLES_ORCAMENTARIOS`, que ja existia. Dizer que a dotacao
-- CADUCA (Constituicao, artigo 167, inciso II) e ato normativo do ente; enterrar o orcamento e ato de
-- execucao, feito uma vez por ano. Fundir daria a quem executa o poder de reescrever a regua pela
-- qual o proprio encerramento dele e medido.

ALTER TYPE "AcaoDoSistema" ADD VALUE 'PARAMETRIZAR_VIRADA_DOS_CONTROLES';
