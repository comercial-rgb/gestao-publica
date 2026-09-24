-- V11 V9.3 — O CRITÉRIO DO ABATIMENTO DO ADIANTAMENTO PASSA A SER DECLARADO PELO ENTE.
--
-- ADITIVA: um tipo novo e UMA coluna nullable. Zero DROP, zero coluna reescrita, zero linha
-- tocada. Nenhum contracheque, nenhum cálculo e nenhum parâmetro já gravado muda — e é assim de
-- propósito: os parâmetros existentes foram cadastrados quando a pergunta não existia, e
-- preenchê-los com 'FECHADO' afirmaria que o ente declarou um critério que ninguém lhe perguntou.
-- O nulo É o fato.
--
-- ⚠️ O TIPO É CRIADO E USADO NO MESMO ARQUIVO, e isso é permitido: a restrição do Postgres que
-- obrigou a V11 V9.1 a partir em dois arquivos é sobre USAR VALOR NOVO de um enum EXISTENTE na
-- mesma transação que o adicionou (ALTER TYPE ... ADD VALUE). Criar um tipo novo e referenciá-lo
-- em seguida é o que a própria 20261011091000 já faz com "BaseDosAvosDoAdiantamento".
--
-- ⚠️ O CENSO DE TABELAS DO PAPEL DE RUNTIME NÃO MUDA. `ParametroDoDecimoTerceiro` é append-only:
-- o GRANT SELECT, INSERT que ela já tem basta, e nenhum caminho deste sistema dá UPDATE nela.

-- ════════════════════════════════════════════════════════════════════════════
-- O ESTADO MÍNIMO — três valores, e a lista curta é decisão declarada
-- ════════════════════════════════════════════════════════════════════════════
--
-- 'EMPENHADO' e 'LIQUIDADO' NÃO entram. Os dois existem no M05 e são legíveis; ficam de fora por
-- serem atos da DESPESA do ente, que nada dizem sobre o servidor ter recebido. Um ente que os
-- declarasse condicionaria o abatimento a um fato que não responde à pergunta da norma
-- ("compensada a importância que o empregado houver RECEBIDO" — Lei 4.749/1965, art. 1º; Decreto
-- 57.155/1965, art. 3º, § 3º). A ausência está escrita para ser decisão visível, não esquecimento.
CREATE TYPE "EstadoMinimoDoAdiantamento" AS ENUM ('FECHADO', 'CERTIFICADO', 'PAGO');

ALTER TABLE "ParametroDoDecimoTerceiro"
    ADD COLUMN "estadoMinimoDoAdiantamentoParaAbater" "EstadoMinimoDoAdiantamento";

COMMENT ON COLUMN "ParametroDoDecimoTerceiro"."estadoMinimoDoAdiantamentoParaAbater" IS
    'V11 V9.3. NULO = criterio NAO declarado pelo ente: o calculo do 13o segue disponivel como SIMULACAO explicitamente identificada e a APROPRIACAO da folha que aplicou abatimento fica BLOQUEADA (ABATIMENTO-SEM-CRITERIO-DECLARADO). Ver modules/m33-folha/MODULO.md.';
