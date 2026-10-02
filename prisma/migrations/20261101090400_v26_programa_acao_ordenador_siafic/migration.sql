-- V26 — o cadastro que o SAGRES pede: a declaração do programa e da ação (§4.2, §4.3), o ordenador de despesa
-- designado por ato e vigência (§4.36 e o cpfOrdenador do §4.8) e o responsável pelo sistema (§4.48).
-- Aditiva: três enums e cinco tabelas novas.

CREATE TYPE "EscopoDoOrdenador" AS ENUM ('ENTE', 'UNIDADE_ORCAMENTARIA');
CREATE TYPE "TipoDoAtoDoOrdenador" AS ENUM ('NOMEACAO', 'DELEGACAO', 'SUBSTITUICAO');
CREATE TYPE "ModalidadeDeManutencaoDoSiafic" AS ENUM ('TERCEIRIZADA', 'PROPRIA');

CREATE TABLE "DeclaracaoDoPrograma" (
    "id" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "descricao" VARCHAR(70) NOT NULL,
    "objetivo" VARCHAR(150) NOT NULL,
    "tipoObjetivoMilenio" VARCHAR(2) NOT NULL,
    "fundamento" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DeclaracaoDoPrograma_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeclaracaoDaAcao" (
    "id" TEXT NOT NULL,
    "acaoId" TEXT NOT NULL,
    "descricao" VARCHAR(70) NOT NULL,
    "descMeta" VARCHAR(150),
    "unidadeMedida" VARCHAR(50),
    "fundamento" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DeclaracaoDaAcao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignacaoDeOrdenador" (
    "id" TEXT NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "nome" VARCHAR(50) NOT NULL,
    "escopo" "EscopoDoOrdenador" NOT NULL,
    "unidadeOrcId" TEXT,
    "tipoDoAto" "TipoDoAtoDoOrdenador" NOT NULL,
    "ato" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DesignacaoDeOrdenador_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EncerramentoDaDesignacaoDeOrdenador" (
    "id" TEXT NOT NULL,
    "designacaoId" TEXT NOT NULL,
    "vigenteAte" TIMESTAMP(3) NOT NULL,
    "ato" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "EncerramentoDaDesignacaoDeOrdenador_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeclaracaoDoResponsavelSiafic" (
    "id" TEXT NOT NULL,
    "modalidade" "ModalidadeDeManutencaoDoSiafic" NOT NULL,
    "cnpjEmpresa" VARCHAR(14) NOT NULL,
    "nomeEmpresa" VARCHAR(80) NOT NULL,
    "telefoneEmpresa" VARCHAR(11),
    "emailEmpresa" VARCHAR(30) NOT NULL,
    "denominacaoSiafic" VARCHAR(30) NOT NULL,
    "cpfResponsavelTecnico" VARCHAR(11) NOT NULL,
    "nomeResponsavelTecnico" VARCHAR(60) NOT NULL,
    "emailResponsavelTecnico" VARCHAR(30) NOT NULL,
    "telefoneResponsavelTecnico" VARCHAR(11),
    "fundamento" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "DeclaracaoDoResponsavelSiafic_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeclaracaoDoPrograma_programaId_vigenteDesde_idx" ON "DeclaracaoDoPrograma"("programaId", "vigenteDesde");
CREATE INDEX "DeclaracaoDaAcao_acaoId_vigenteDesde_idx" ON "DeclaracaoDaAcao"("acaoId", "vigenteDesde");
CREATE INDEX "DesignacaoDeOrdenador_unidadeOrcId_vigenteDesde_idx" ON "DesignacaoDeOrdenador"("unidadeOrcId", "vigenteDesde");
CREATE INDEX "DesignacaoDeOrdenador_cpf_idx" ON "DesignacaoDeOrdenador"("cpf");
CREATE UNIQUE INDEX "EncerramentoDaDesignacaoDeOrdenador_designacaoId_key" ON "EncerramentoDaDesignacaoDeOrdenador"("designacaoId");
CREATE INDEX "DeclaracaoDoResponsavelSiafic_vigenteDesde_idx" ON "DeclaracaoDoResponsavelSiafic"("vigenteDesde");
ALTER TABLE "DeclaracaoDoPrograma" ADD CONSTRAINT "DeclaracaoDoPrograma_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeclaracaoDaAcao" ADD CONSTRAINT "DeclaracaoDaAcao_acaoId_fkey" FOREIGN KEY ("acaoId") REFERENCES "Acao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignacaoDeOrdenador" ADD CONSTRAINT "DesignacaoDeOrdenador_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EncerramentoDaDesignacaoDeOrdenador" ADD CONSTRAINT "EncerramentoDaDesignacaoDeOrdenador_designacaoId_fkey" FOREIGN KEY ("designacaoId") REFERENCES "DesignacaoDeOrdenador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeclaracaoDoPrograma" ADD CONSTRAINT "DeclaracaoDoPrograma_ods_check" CHECK ("tipoObjetivoMilenio" ~ '^(0[1-9]|1[0-7]|99)$');
ALTER TABLE "DeclaracaoDoPrograma" ADD CONSTRAINT "DeclaracaoDoPrograma_fundamento_check" CHECK (length(btrim("fundamento")) >= 10);
ALTER TABLE "DeclaracaoDaAcao" ADD CONSTRAINT "DeclaracaoDaAcao_fundamento_check" CHECK (length(btrim("fundamento")) >= 10);
ALTER TABLE "DesignacaoDeOrdenador" ADD CONSTRAINT "DesignacaoDeOrdenador_cpf_check" CHECK ("cpf" ~ '^[0-9]{11}$');
ALTER TABLE "DesignacaoDeOrdenador" ADD CONSTRAINT "DesignacaoDeOrdenador_escopo_check" CHECK (("escopo" = 'ENTE') = ("unidadeOrcId" IS NULL));
ALTER TABLE "DeclaracaoDoResponsavelSiafic" ADD CONSTRAINT "DeclaracaoDoResponsavelSiafic_docs_check" CHECK ("cnpjEmpresa" ~ '^[0-9]{14}$' AND "cpfResponsavelTecnico" ~ '^[0-9]{11}$');
