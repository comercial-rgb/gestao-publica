-- V11 V9 — A ENTIDADE CONTÁBIL E A TITULARIDADE DA RECEITA (`RECEITA-SEM-ENTIDADE-ARRECADADORA`)
--
-- A arrecadação não registrava QUEM arrecadou. O edital chama isso de "entidade" e a define na
-- 5.10.1.3: mais de uma unidade na mesma base, com CONTABILIZAÇÃO DISTINTA, consolidável. Não é
-- órgão nem unidade orçamentária — essas são a estrutura da DESPESA, e a receita é do ente
-- (art. 167, IV), nunca da Secretaria de Saúde.
--
-- ADITIVA, ZERO DROP. Quatro tabelas novas, um tipo novo e UMA coluna NULLABLE em
-- `ReceitaArrecadada`. Sem backfill e sem default, de propósito: a guia que já existe não sabe de
-- quem é, e inventar por rateio, por órgão da despesa ou por suposição fabricaria justamente o
-- número que se quer poder conferir. O legado permanece NÃO ATRIBUÍDO e aparece assim na consulta.
CREATE TYPE "TipoDeAtoDeclarado" AS ENUM (
    'LEI', 'LEI_COMPLEMENTAR', 'DECRETO', 'PORTARIA', 'RESOLUCAO', 'INSTRUCAO_NORMATIVA',
    'OFICIO', 'CONTRATO'
);

-- ── A IDENTIDADE ────────────────────────────────────────────────────────────────────────────
CREATE TABLE "EntidadeContabil" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "EntidadeContabil_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntidadeContabil_codigo_key" ON "EntidadeContabil"("codigo");

ALTER TABLE "EntidadeContabil" ADD CONSTRAINT "ck_entidade_contabil_codigo_nao_vazio"
    CHECK (btrim("codigo") <> '');

-- ── OS ATRIBUTOS, VERSIONADOS ───────────────────────────────────────────────────────────────
-- ⚠️ IDENTIDADE ESTÁVEL × ATRIBUTOS VERSIONADOS, o padrão de `Pessoa` e de `VersaoDoImovel`. Um
-- cadastro só-insert repetiria o defeito que a V8.12 encontrou no calendário: a entidade
-- cadastrada errado não teria volta, porque o papel de runtime não tem UPDATE aqui — e a única
-- saída seria afrouxar o grant.
CREATE TABLE "VersaoDaEntidadeContabil" (
    "id" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" VARCHAR(14),
    "tipoManad" VARCHAR(2) NOT NULL,
    "atoTipo" "TipoDeAtoDeclarado" NOT NULL,
    "atoNumero" TEXT NOT NULL,
    "atoAno" INTEGER NOT NULL,
    "atoDispositivo" TEXT NOT NULL,
    "atoCitacao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "VersaoDaEntidadeContabil_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VersaoDaEntidadeContabil_entidadeId_versao_key"
    ON "VersaoDaEntidadeContabil"("entidadeId", "versao");

ALTER TABLE "VersaoDaEntidadeContabil" ADD CONSTRAINT "VersaoDaEntidadeContabil_entidadeId_fkey"
    FOREIGN KEY ("entidadeId") REFERENCES "EntidadeContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VersaoDaEntidadeContabil" ADD CONSTRAINT "ck_versao_entidade_versao_positiva"
    CHECK ("versao" >= 1);
ALTER TABLE "VersaoDaEntidadeContabil" ADD CONSTRAINT "ck_versao_entidade_nome_nao_vazio"
    CHECK (btrim("nome") <> '');
-- ⚠️ O CNPJ É DÍGITO OU NADA. Nulo significa "esta entidade não tem CNPJ próprio" — um fundo
-- pode operar sob o CNPJ do ente. String vazia significaria a mesma coisa por outro caminho, e
-- duas formas de dizer "não tem" divergem no dia em que só uma for tratada.
ALTER TABLE "VersaoDaEntidadeContabil" ADD CONSTRAINT "ck_versao_entidade_cnpj_so_digitos"
    CHECK ("cnpj" IS NULL OR "cnpj" ~ '^[0-9]{14}$');
ALTER TABLE "VersaoDaEntidadeContabil" ADD CONSTRAINT "ck_versao_entidade_tipo_manad_forma"
    CHECK ("tipoManad" ~ '^[0-9]{2}$');
-- Piso de FORMA do ato, não a conferência dele — ver o bloco da `DeclaracaoDeTitularDaConta`.
ALTER TABLE "VersaoDaEntidadeContabil" ADD CONSTRAINT "ck_versao_entidade_ato_preenchido"
    CHECK (btrim("atoNumero") <> '' AND btrim("atoDispositivo") <> '' AND btrim("atoCitacao") <> '');
ALTER TABLE "VersaoDaEntidadeContabil" ADD CONSTRAINT "ck_versao_entidade_ato_ano_forma"
    CHECK ("atoAno" BETWEEN 1000 AND 9999);

-- ── A DECISÃO DO ENTE: DE QUEM É ESTA CONTA ─────────────────────────────────────────────────
CREATE TABLE "DeclaracaoDeTitularDaConta" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "atoTipo" "TipoDeAtoDeclarado" NOT NULL,
    "atoNumero" TEXT NOT NULL,
    "atoAno" INTEGER NOT NULL,
    "atoDispositivo" TEXT NOT NULL,
    "atoCitacao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "DeclaracaoDeTitularDaConta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeclaracaoDeTitularDaConta_contaBancariaId_versao_key"
    ON "DeclaracaoDeTitularDaConta"("contaBancariaId", "versao");
CREATE INDEX "DeclaracaoDeTitularDaConta_contaBancariaId_versao_idx"
    ON "DeclaracaoDeTitularDaConta"("contaBancariaId", "versao");
CREATE INDEX "DeclaracaoDeTitularDaConta_entidadeId_idx"
    ON "DeclaracaoDeTitularDaConta"("entidadeId");

ALTER TABLE "DeclaracaoDeTitularDaConta" ADD CONSTRAINT "DeclaracaoDeTitularDaConta_contaBancariaId_fkey"
    FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeclaracaoDeTitularDaConta" ADD CONSTRAINT "DeclaracaoDeTitularDaConta_entidadeId_fkey"
    FOREIGN KEY ("entidadeId") REFERENCES "EntidadeContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeclaracaoDeTitularDaConta" ADD CONSTRAINT "ck_declaracao_titular_versao_positiva"
    CHECK ("versao" >= 1);

-- ⚠️ ESTES CHECKS SÃO PISO DE FORMA, E **NÃO** SÃO A CONFERÊNCIA DO FUNDAMENTO. Um
-- `length >= 20` é satisfeito por vinte caracteres quaisquer — "porque sim" tem dez, e isso foi
-- medido na V8.3 com essas palavras. A conferência de verdade é de COERÊNCIA e mora no servidor
-- (`modules/m01-core-contabil/ato-declarado.ts`): ano não futuro contra a data civil do ente,
-- número com dígito, dispositivo com forma de dispositivo, citação que não é a repetição do
-- rótulo, e APLICABILIDADE — o ato citado tem de mencionar a entidade ou a conta. O banco só
-- garante que nenhum dos campos chegue vazio ou com ano impossível.
ALTER TABLE "DeclaracaoDeTitularDaConta" ADD CONSTRAINT "ck_declaracao_titular_ato_preenchido"
    CHECK (btrim("atoNumero") <> '' AND btrim("atoDispositivo") <> '' AND btrim("atoCitacao") <> '');
ALTER TABLE "DeclaracaoDeTitularDaConta" ADD CONSTRAINT "ck_declaracao_titular_ato_ano_forma"
    CHECK ("atoAno" BETWEEN 1000 AND 9999);

-- ── A RETIFICAÇÃO DO LEGADO ─────────────────────────────────────────────────────────────────
-- ⚠️ ESPELHO DE `AtribuicaoDeContaDaArrecadacao`, e pelo mesmo motivo: o fato não se corrige com
-- UPDATE. UMA atribuição por guia — duas concorrentes caem na constraint, e a segunda é recusada
-- nomeando o que aconteceu.
CREATE TABLE "AtribuicaoDeEntidadeDaArrecadacao" (
    "id" TEXT NOT NULL,
    "receitaArrecadadaId" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "atoTipo" "TipoDeAtoDeclarado" NOT NULL,
    "atoNumero" TEXT NOT NULL,
    "atoAno" INTEGER NOT NULL,
    "atoDispositivo" TEXT NOT NULL,
    "atoCitacao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    CONSTRAINT "AtribuicaoDeEntidadeDaArrecadacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtribuicaoDeEntidadeDaArrecadacao_receitaArrecadadaId_key"
    ON "AtribuicaoDeEntidadeDaArrecadacao"("receitaArrecadadaId");
CREATE INDEX "AtribuicaoDeEntidadeDaArrecadacao_entidadeId_idx"
    ON "AtribuicaoDeEntidadeDaArrecadacao"("entidadeId");

ALTER TABLE "AtribuicaoDeEntidadeDaArrecadacao" ADD CONSTRAINT "AtribuicaoDeEntidadeDaArrecadacao_receitaArrecadadaId_fkey"
    FOREIGN KEY ("receitaArrecadadaId") REFERENCES "ReceitaArrecadada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AtribuicaoDeEntidadeDaArrecadacao" ADD CONSTRAINT "AtribuicaoDeEntidadeDaArrecadacao_entidadeId_fkey"
    FOREIGN KEY ("entidadeId") REFERENCES "EntidadeContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AtribuicaoDeEntidadeDaArrecadacao" ADD CONSTRAINT "ck_atribuicao_entidade_motivo_nao_vazio"
    CHECK (btrim("motivo") <> '');
ALTER TABLE "AtribuicaoDeEntidadeDaArrecadacao" ADD CONSTRAINT "ck_atribuicao_entidade_ato_preenchido"
    CHECK (btrim("atoNumero") <> '' AND btrim("atoDispositivo") <> '' AND btrim("atoCitacao") <> '');
ALTER TABLE "AtribuicaoDeEntidadeDaArrecadacao" ADD CONSTRAINT "ck_atribuicao_entidade_ato_ano_forma"
    CHECK ("atoAno" BETWEEN 1000 AND 9999);

-- ── O CARIMBO NO FATO ───────────────────────────────────────────────────────────────────────
-- ⚠️ COLUNA, e não um join pela declaração vigente — e a diferença é a que separa um FATO de uma
-- DECISÃO. A declaração muda (a conta troca de dono, e trocar de dono é fato NOVO, não correção
-- do velho); a coluna guarda o que era verdade NO INSTANTE em que o dinheiro entrou. Resolver
-- por join reescreveria a história das guias antigas toda vez que alguém declarasse um titular
-- novo — e é por isso, também, que a ANULAÇÃO herda a coluna da guia original.
ALTER TABLE "ReceitaArrecadada" ADD COLUMN "entidadeTitularId" TEXT;

ALTER TABLE "ReceitaArrecadada" ADD CONSTRAINT "ReceitaArrecadada_entidadeTitularId_fkey"
    FOREIGN KEY ("entidadeTitularId") REFERENCES "EntidadeContabil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ReceitaArrecadada_exercicio_entidadeTitularId_idx"
    ON "ReceitaArrecadada"("exercicio", "entidadeTitularId");
