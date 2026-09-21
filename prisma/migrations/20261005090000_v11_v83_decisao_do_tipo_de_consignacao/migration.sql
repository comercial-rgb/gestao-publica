-- V11 V8.3 — A DECISÃO DO ENTE SOBRE O TIPO DE CONSIGNAÇÃO (pendência CONSIGNACAO-CONTA-SINTETICA)
--
-- Aditiva: uma tabela nova, nenhum DROP, nenhuma coluna alterada.
--
-- ⚠️ POR QUE UM FATO, E NÃO UM `UPDATE` NAS COLUNAS DE `TipoConsignacao`: escolher em que conta do
-- PCASP o INSS retido vira dívida é CLASSIFICAÇÃO CONTÁBIL do ente. Ela muda, e a pergunta "desde
-- quando ia para esta conta?" precisa de resposta — um razão de cinco anos atrás foi escriturado
-- contra a decisão daquela época. Além disso, o papel de runtime NÃO tem `UPDATE` em
-- `TipoConsignacao`, e afrouxar o grant para caber um desenho é o oposto da regra da casa.
CREATE TABLE "DecisaoDoTipoDeConsignacao" (
    "id" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "contaPassivoId" TEXT,
    "fundamento" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "DecisaoDoTipoDeConsignacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DecisaoDoTipoDeConsignacao_tipoId_criadoEm_idx"
    ON "DecisaoDoTipoDeConsignacao"("tipoId", "criadoEm");

ALTER TABLE "DecisaoDoTipoDeConsignacao" ADD CONSTRAINT "DecisaoDoTipoDeConsignacao_tipoId_fkey"
    FOREIGN KEY ("tipoId") REFERENCES "TipoConsignacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisaoDoTipoDeConsignacao" ADD CONSTRAINT "DecisaoDoTipoDeConsignacao_contaPassivoId_fkey"
    FOREIGN KEY ("contaPassivoId") REFERENCES "ContaPcasp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⚠️ ATIVO EXIGE CONTA. Um tipo ativo sem passivo decidido seria oferecido na tela e recusado
-- pela retenção no meio de um pagamento — o pior momento possível para descobrir uma parametrização
-- que falta. Desativar é a única forma de existir sem conta.
ALTER TABLE "DecisaoDoTipoDeConsignacao" ADD CONSTRAINT "ck_decisao_ativo_exige_conta" CHECK (
    ("ativo" = false) OR ("contaPassivoId" IS NOT NULL)
);

-- ⚠️ FUNDAMENTO NÃO É OPCIONAL NEM VAZIO. Uma escolha contábil sem justificativa é uma conta
-- inventada com aparência de decisão — e é isso que a pendência existia para impedir.
-- ⚠️ VINTE, E O NÚMERO FOI MEDIDO: com dez, "porque sim" passava — exatamente o que um piso de
-- fundamento existe para barrar.
ALTER TABLE "DecisaoDoTipoDeConsignacao" ADD CONSTRAINT "ck_decisao_fundamento_nao_vazio" CHECK (
    length(btrim("fundamento")) >= 20
);
