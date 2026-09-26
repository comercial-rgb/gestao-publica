-- V13 rodada 4 — A CONTA DO PLANO EM QUE O VALE VIRA DIREITO, DECLARADA NO PARAMETRO.
--
-- O usuario decidiu que o adiantamento salarial e operacao PATRIMONIAL e NAO empenha: ele debita
-- um ADIANTAMENTO CONCEDIDO A PESSOAL contra a saida de caixa, e a folha mensal da mesma
-- competencia BAIXA esse direito ao abate-lo. A despesa de pessoal e empenhada UMA vez, na
-- mensal, pelo bruto — a duplicacao deixa de existir por construcao.
--
-- ⚠️ A COLUNA E NULLABLE, E O NULO E O ESTADO REAL DO QUE JA ESTA GRAVADO. O parametro nasceu na
-- V13 rodada 1, antes de esta pergunta existir. MEDIDO antes de escolher: `gestao_publica` tem 0
-- linhas e `gestao_publica_test` tem 1 (resto de corrida de teste) — entao um NOT NULL falharia
-- em um dos dois bancos desta maquina, e falharia em qualquer ente que ja tivesse cadastrado um
-- parametro. Migration ADITIVA, sem backfill e sem inventar conta para linha antiga.
--
-- ⚠️ E O NULO NAO E FROUXIDAO: o Zod do cadastro EXIGE a conta (nenhum parametro novo nasce sem
-- ela) e a LEITURA FALHA FECHADO quando ela e nula. Inventar uma conta para a linha antiga seria
-- afirmar que o ente declarou o que ninguem lhe perguntou — o mesmo motivo que deixou
-- `estadoMinimoDoAdiantamentoParaAbater` nulavel no parametro do 13o.
--
-- ⚠️ ONDE ELA **NAO** FICA, E POR QUE: na V13 rodada 3 a conta era exigida no `contaVariacaoId`
-- do GRUPO DE EMPENHO, porque o vale ainda era empenhado e liquidado. Sem empenho, o grupo nao
-- participa do vale — uma conta declarada num grupo que ninguem usa seria guarda sem alvo, que e
-- pior que guarda ausente. Aqui ela fica no mesmo lugar em que o ente ja declara o percentual, a
-- base e o ato: versionada por competencia, append-only.
--
-- ADITIVA: uma coluna nullable e uma FK. Zero DROP, zero linha reescrita, zero coluna alterada.

ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD COLUMN "contaDoAdiantamentoId" TEXT;

ALTER TABLE "ParametroDoAdiantamentoSalarial" ADD CONSTRAINT "ParametroDoAdiantamentoSalarial_contaDoAdiantamentoId_fkey"
    FOREIGN KEY ("contaDoAdiantamentoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ SEM CHECK DE PREFIXO AQUI, E A AUSENCIA E DELIBERADA. O ramo `1.1.3.1` e propriedade do
-- CODIGO da conta, que vive em `ContaPcasp` — um CHECK nesta tabela nao alcanca a outra, e um
-- trigger para alcanca-la seria regra de negocio escondida no banco. Quem recusa e o servico, no
-- cadastro, e ele recusa tambem conta SINTETICA: o adapter do razao nao aceita partida em
-- sintetica (INVARIANTE 5), e descobrir isso no pagamento seria descobrir tarde.
