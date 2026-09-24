-- V11 V9.5 (TR 5.12.50) — A SELECAO NO CALCULO E O FATO DE ABRANGENCIA.
--
-- ADITIVA: dois tipos NOVOS, uma coluna com DEFAULT, uma tabela nova, duas FKs, tres indices e um
-- CHECK. Zero DROP, zero RENAME, zero UPDATE de linha existente. Todo calculo ja gravado continua
-- valido e passa a declarar `TODOS_OS_ELEGIVEIS`, que e exatamente o que ele fez.
--
-- ⚠️ ESTES `CREATE TYPE` PODEM CONVIVER COM O USO NA MESMA TRANSACAO, e a migration anterior
-- (`20261017090000`) esta separada por outro motivo: la e `ALTER TYPE ... ADD VALUE` num enum que
-- JA EXISTE, e um valor acrescentado nao pode ser usado na transacao que o acrescentou. Tipo novo
-- nao tem essa restricao. A separacao segue o motivo, nao o habito.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ POR QUE A ABRANGENCIA NASCE JUNTO COM A SELECAO, E NAO DEPOIS
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- `calcularFolha` prometia "todos os vinculos vivos na competencia" e mantinha a promessa POR
-- CONSTRUCAO: o `findMany` dos vinculos nao tinha `where` nenhum. A selecao remove essa construcao
-- — e uma promessa mantida por construcao some junto com a construcao.
--
-- Sem o registro de abrangencia, uma folha PARCIAL fecha com o total batendo, o empenho batendo e
-- a liquidacao batendo: nenhuma etapa adiante acusa. E a forma exata de defeito que este modulo ja
-- pagou tres vezes. Por isso as duas coisas sao UM commit e UMA migration: o estado intermediario
-- — selecao sem abrangencia — e precisamente o estado perigoso.

CREATE TYPE "ModoDeSelecaoDoCalculo" AS ENUM ('TODOS_OS_ELEGIVEIS', 'EXPLICITA');

-- ⚠️ CADA VALOR ABAIXO ERA UM `continue` MUDO OU UMA AUSENCIA SILENCIOSA. Os dois do meio sao
-- literalmente as duas linhas que o motor mensal usava para descartar vinculo sem deixar rastro.
-- ⚠️ TRES VALORES, E A LISTA ENCOLHEU POR MEDICAO. Dois foram tentados e descartados pelo que o
-- banco disse: `NAO_SELECIONADO` (derivavel do modo mais os considerados; gravar uma linha por
-- vinculo nao pedido seria ruido que esconde o que importa) e `VINCULO_INEXISTENTE` (IMPOSSIVEL:
-- a FK desta tabela aponta para `Vinculo`, e a tentativa estourou `AbrangenciaDoCalculo_vinculoId_
-- fkey`). A revalidacao passou a RECUSAR o calculo, que e mais forte que registrar.
CREATE TYPE "MotivoDaExclusaoDoCalculo" AS ENUM (
  'ADMITIDO_APOS_A_COMPETENCIA',
  'DESLIGADO_ANTES_DA_COMPETENCIA',
  'SEM_DIFERENCA_A_PAGAR'
);

-- ⚠️ O DEFAULT E O QUE TORNA ESTA MIGRATION ADITIVA. Todo calculo ja gravado processou todos os
-- elegiveis; a coluna passa a DIZER isso dele, em vez de deixar um nulo que alguem leria como
-- "nao se sabe". E o default tambem e o comportamento seguro para quem chamar o servico sem
-- declarar selecao: o padrao e calcular todos, nunca recortar por omissao.
ALTER TABLE "CalculoDaFolha"
  ADD COLUMN "modoDeSelecao" "ModoDeSelecaoDoCalculo" NOT NULL DEFAULT 'TODOS_OS_ELEGIVEIS';

CREATE TABLE "AbrangenciaDoCalculo" (
    "id" TEXT NOT NULL,
    "calculoId" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "calculado" BOOLEAN NOT NULL,
    "motivo" "MotivoDaExclusaoDoCalculo",

    CONSTRAINT "AbrangenciaDoCalculo_pkey" PRIMARY KEY ("id")
);

-- ⚠️ UMA LINHA POR VINCULO POR CALCULO. E ela que impede o mesmo vinculo de aparecer nos DOIS
-- lados (calculado E excluido) — o que faria a contagem do cálculo mentir sem nada acusar.
CREATE UNIQUE INDEX "AbrangenciaDoCalculo_calculoId_vinculoId_key"
  ON "AbrangenciaDoCalculo"("calculoId", "vinculoId");
CREATE INDEX "AbrangenciaDoCalculo_vinculoId_idx" ON "AbrangenciaDoCalculo"("vinculoId");
-- Serve a pergunta que o fechamento faz: "quem foi CALCULADO nos calculos vivos desta folha?"
CREATE INDEX "AbrangenciaDoCalculo_calculoId_calculado_idx"
  ON "AbrangenciaDoCalculo"("calculoId", "calculado");

ALTER TABLE "AbrangenciaDoCalculo" ADD CONSTRAINT "AbrangenciaDoCalculo_calculoId_fkey"
  FOREIGN KEY ("calculoId") REFERENCES "CalculoDaFolha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbrangenciaDoCalculo" ADD CONSTRAINT "AbrangenciaDoCalculo_vinculoId_fkey"
  FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ BICONDICIONAL, na disciplina de `ck_historico_vinculo_funcao` e `ck_historico_vinculo_
-- gratificacao`: quem foi CALCULADO nao tem motivo de exclusao, e quem NAO foi calculado tem
-- OBRIGATORIAMENTE um. E a forma que afirma a PROPRIEDADE em vez de enumerar um exemplar — um
-- motivo novo no enum continua barrado de aparecer em linha calculada, e uma exclusao sem motivo
-- nao grava.
--
-- ⚠️ E E ELE QUE IMPEDE A EXCLUSAO MUDA, que e o defeito que esta migration existe para fechar.
-- Sem o CHECK, gravar `calculado = false, motivo = NULL` seria possivel — e seria exatamente o
-- `continue` mudo de volta, agora com uma linha no banco para parecer que ha registro.
ALTER TABLE "AbrangenciaDoCalculo"
  ADD CONSTRAINT "ck_abrangencia_motivo_bicondicional"
  CHECK ( "calculado" = ("motivo" IS NULL) );
