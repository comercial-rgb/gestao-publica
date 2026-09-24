-- V11 V9.4 (TR 5.12.50) — A FUNCAO COMO ENTIDADE, E O CENTRO DE CUSTO QUE JA EXISTIA.
--
-- ADITIVA: uma tabela nova, duas colunas NULAVEIS, duas FKs, dois indices e quatro CHECK. Zero
-- DROP, zero RENAME, zero UPDATE de linha existente. Todo vinculo ja gravado continua valido: as
-- duas colunas nascem NULAS e os quatro CHECK sao verdadeiros para NULO.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ O CENTRO DE CUSTO NAO GANHOU TABELA, E A AUSENCIA E A DECISAO
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- O levantamento veio ANTES do desenho, e achou o cadastro pronto: o `Setor` do M21 e, no texto
-- do proprio schema, "o centro de custo administrativo por onde o processo tramita"
-- (`m21-protocolo.prisma`). Tres modulos ja o usam NESSE papel:
--
--   · M10 almoxarifado — "TR 5.18.10: centro de custo (setor) que consumiu. O `Setor` do M21 e o
--     cadastro que ja existe; criar um 'departamento' paralelo seria a segunda verdade";
--   · M11 compras — "TR 5.17.54: controlar as solicitacoes por centro de custo (...) o setor e o
--     eixo de acesso, e e o mesmo do M21";
--   · M10 patrimonio — localizacao fisica e termo patrimonial por setor.
--
-- Uma tabela de centro de custo so da folha seria a QUARTA estrutura sobre o mesmo organograma,
-- depois de `Lotacao` (RH), `Setor` (custo) e `UnidadeOrcamentaria` (orcamento) — e a despesa de
-- PESSOAL deixaria de somar com a de MATERIAL no mesmo eixo, que e exatamente para o que serve um
-- centro de custo. O que faltava nunca foi o cadastro: era o VINCULO, com vigencia.
--
-- ⚠️ E `Setor.unidadeOrcId` E OBRIGATORIO (`m21-protocolo.prisma`), enquanto `Lotacao.unidadeOrcId`
-- e OPCIONAL e o proprio schema declara que "a maioria das folhas do organograma" nao tem. Para
-- apropriar despesa de pessoal, portanto, o `Setor` e melhor amarrado que a lotacao — nao e so o
-- cadastro que ja existia, e o que ja chega ao orcamento.

-- ----------------------------------------------------------------------------
-- A FUNCAO — esta SIM precisou nascer
-- ----------------------------------------------------------------------------
-- Ate aqui havia dois candidatos concorrentes e nenhum era uma funcao:
--   · `TipoCargo.FUNCAO_GRATIFICADA` — ESPECIE DE CARGO, atributo de `Cargo.tipo`. Responde "que
--     natureza tem este posto", nao "que atribuicao esta pessoa exerce";
--   · `HistoricoVinculo.gratificacaoDescricao` — texto livre, e o docblock dele diz o que ele e:
--     parcela ADICIONAL ao salario. E DINHEIRO, nao atribuicao. "Dir. Escola" e "Diretor de
--     Escola" sao duas funcoes para qualquer filtro.
-- Os dois continuam existindo de proposito; o que muda e a atribuicao ganhar identidade propria.
CREATE TABLE "Funcao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "denominacao" TEXT NOT NULL,
    "leiAutorizativa" TEXT NOT NULL,
    "dataPublicacaoLei" TIMESTAMP(3) NOT NULL,
    "dataExtincao" TIMESTAMP(3),
    "leiExtincao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Funcao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Funcao_codigo_key" ON "Funcao"("codigo");
-- Declarado tambem como `@@index([dataExtincao])` no schema: indice que o schema nao declara a
-- deriva remove em silencio.
CREATE INDEX "Funcao_dataExtincao_idx" ON "Funcao"("dataExtincao");

-- ----------------------------------------------------------------------------
-- AS DUAS COLUNAS NO EVENTO — a vigencia mora aqui, nao no cadastro
-- ----------------------------------------------------------------------------
-- Mesma divisao de `Cargo` e `Lotacao`: o cadastro diz o que EXISTE, o evento diz o que VALE em
-- cada data. `funcaoVigenteEm` e `centroDeCustoVigenteEm` derivam daqui, como `cargoVigenteEm`.
ALTER TABLE "HistoricoVinculo" ADD COLUMN "funcaoId" TEXT;
ALTER TABLE "HistoricoVinculo" ADD COLUMN "centroDeCustoId" TEXT;

ALTER TABLE "HistoricoVinculo" ADD CONSTRAINT "HistoricoVinculo_funcaoId_fkey"
  FOREIGN KEY ("funcaoId") REFERENCES "Funcao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HistoricoVinculo" ADD CONSTRAINT "HistoricoVinculo_centroDeCustoId_fkey"
  FOREIGN KEY ("centroDeCustoId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "HistoricoVinculo_funcaoId_idx" ON "HistoricoVinculo"("funcaoId");
CREATE INDEX "HistoricoVinculo_centroDeCustoId_idx" ON "HistoricoVinculo"("centroDeCustoId");

-- ----------------------------------------------------------------------------
-- OS CHECK — e a FORMA deles e a licao de `20261015090100`
-- ----------------------------------------------------------------------------
-- ⚠️ NAO SE ENUMERA UM EXEMPLAR JOGANDO O RESTO NO `<>`. O CHECK do exercicio da folha nasceu
-- assim e, com ele, o tipo novo caia SILENCIOSAMENTE no grupo errado — que e o pior resultado,
-- porque parece funcionar. As duas formas abaixo falham FECHADAS para o proximo tipo de evento:
-- um valor novo que quisesse trazer funcao nao gravaria, e quem estiver construindo descobre no
-- primeiro INSERT, nao numa folha errada em producao.

-- BICONDICIONAL, na mesma disciplina de `ck_historico_vinculo_gratificacao`: a designacao traz
-- funcao, e NENHUM outro tipo a traz — inclusive a DISPENSA, que e o evento que ENCERRA e cujo
-- `funcaoId` preenchido faria "dispensou da funcao X" parecer "designou para X".
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_funcao"
  CHECK (
    ("tipo" = 'DESIGNACAO_FUNCAO') = ("funcaoId" IS NOT NULL)
  );

-- ⚠️ E A DISPENSA SO EXISTE DEPOIS DE UMA DESIGNACAO — mas isso o banco NAO afirma, e dizer
-- porque importa mais que fingir que afirma: a ordem entre eventos datados do mesmo vinculo e
-- propriedade do CONJUNTO, nao da linha, e um CHECK de linha nao a alcanca. Quem a impoe e o caso
-- de uso (`dispensarDeFuncao` recusa quando `funcaoVigenteEm` devolve nulo na data do efeito), e a
-- derivacao fail-closed: uma dispensa orfa deixa `funcaoVigenteEm` nulo, que e o mesmo que nao
-- exercer — nunca uma funcao inventada.

-- O CENTRO DE CUSTO SEGUE O PRECEDENTE DO REGIME PREVIDENCIARIO (`ck_historico_vinculo_regime`),
-- e nao a bicondicional da funcao. A diferenca e deliberada: exigi-lo na ADMISSAO faria o CHECK
-- recusar TODO vinculo que ja existe, e a migration deixaria de ser aditiva. Entao ele PODE vir na
-- admissao (os vinculos novos ja nascem apropriados) e e EXIGIDO no evento que o muda.
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_centro_de_custo"
  CHECK (
    "centroDeCustoId" IS NULL
    OR "tipo" IN ('ADMISSAO', 'MUDANCA_CENTRO_DE_CUSTO')
  );

ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_centro_de_custo_exigido"
  CHECK ("tipo" <> 'MUDANCA_CENTRO_DE_CUSTO' OR "centroDeCustoId" IS NOT NULL);

-- ⚠️ O QUE ESTES CHECK NAO AFIRMAM, DITO EM VOZ ALTA: que todo vinculo TENHA centro de custo.
-- Ele e nulo em todo vinculo anterior a esta migration, e nao ha de onde tira-lo — inventar um
-- setor para o historico seria apropriar despesa passada num centro de custo que ninguem escolheu.
-- Quem consome RECUSA COM MOTIVO quando `centroDeCustoVigenteEm` devolve nulo, em vez de escolher.
