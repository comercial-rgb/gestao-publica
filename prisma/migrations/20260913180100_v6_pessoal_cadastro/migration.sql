-- V6 P2 — M32 PESSOAL: as tabelas do RH bloco 1 (conciliado do siafic-cg c04ad5a; lá m22-rh).
-- DDL gerada por `prisma migrate diff` sobre o schema local; os CHECKs vieram da origem um a um,
-- MENOS os de CPF/CEP do Servidor (que agora vivem na Pessoa canônica do M19).

-- CreateEnum
CREATE TYPE "SexoServidor" AS ENUM ('MASCULINO', 'FEMININO', 'NAO_INFORMADO');

-- CreateEnum
CREATE TYPE "TipoVinculoRh" AS ENUM ('EFETIVO', 'COMISSIONADO', 'TEMPORARIO', 'ELETIVO', 'APOSENTADO', 'PENSIONISTA', 'ESTAGIARIO');

-- CreateEnum
CREATE TYPE "TipoEventoVinculo" AS ENUM ('ADMISSAO', 'PROMOCAO', 'MUDANCA_CARGO', 'MUDANCA_LOTACAO', 'REAJUSTE_SALARIAL', 'GRATIFICACAO', 'AFASTAMENTO', 'RETORNO_AFASTAMENTO', 'DESLIGAMENTO');

-- CreateEnum
CREATE TYPE "GrauParentesco" AS ENUM ('CONJUGE', 'COMPANHEIRO', 'FILHO', 'ENTEADO', 'TUTELADO', 'PAI', 'MAE', 'IRMAO', 'NETO', 'OUTRO');

-- CreateEnum
CREATE TYPE "FinalidadeDoDependente" AS ENUM ('IMPOSTO_RENDA', 'SALARIO_FAMILIA', 'PLANO_SAUDE', 'PENSAO_ALIMENTICIA');

-- CreateEnum
CREATE TYPE "TipoCargo" AS ENUM ('EFETIVO', 'COMISSAO', 'FUNCAO_GRATIFICADA', 'EMPREGO_PUBLICO', 'TEMPORARIO', 'AGENTE_POLITICO');

-- CreateEnum
CREATE TYPE "TipoAnotacaoServidor" AS ENUM ('ELOGIO', 'ADVERTENCIA', 'SUSPENSAO', 'OCORRENCIA', 'OBSERVACAO');

-- CreateEnum
CREATE TYPE "TipoPortaria" AS ENUM ('NOMEACAO', 'DESIGNACAO', 'SUBSTITUICAO', 'PROMOCAO', 'EXONERACAO', 'DEMISSAO');

-- CreateEnum
CREATE TYPE "TipoDiaCalendario" AS ENUM ('FERIADO_NACIONAL', 'FERIADO_ESTADUAL', 'FERIADO_MUNICIPAL', 'PONTO_FACULTATIVO', 'SEM_EXPEDIENTE', 'EXPEDIENTE_REDUZIDO');

-- CreateEnum
CREATE TYPE "PrazoContratoTrabalho" AS ENUM ('DETERMINADO', 'INDETERMINADO');

-- CreateEnum
CREATE TYPE "ResultadoAvaliacao" AS ENUM ('EM_ANDAMENTO', 'APROVADO', 'REPROVADO', 'PRORROGADO');

-- CreateTable
CREATE TABLE "Cargo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "denominacao" TEXT NOT NULL,
    "tipo" "TipoCargo" NOT NULL,
    "vagasFixadas" INTEGER NOT NULL,
    "leiAutorizativa" TEXT NOT NULL,
    "dataPublicacaoLei" TIMESTAMP(3) NOT NULL,
    "dataExtincao" TIMESTAMP(3),
    "leiExtincao" TEXT,
    "requisitoIngresso" TEXT,
    "cargaHorariaSemanal" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lotacao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "paiId" TEXT,
    "unidadeOrcId" TEXT,
    "dataExtincao" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Lotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servidor" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "nomeSocial" TEXT,
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "sexo" "SexoServidor" NOT NULL,
    "pisPasep" VARCHAR(11),
    "rgNumero" TEXT,
    "rgOrgaoEmissor" TEXT,
    "rgUf" CHAR(2),
    "rgDataEmissao" TIMESTAMP(3),
    "tituloEleitor" VARCHAR(12),
    "tituloZona" TEXT,
    "tituloSecao" TEXT,
    "ctpsNumero" TEXT,
    "ctpsSerie" TEXT,
    "ctpsUf" CHAR(2),
    "nomeMae" TEXT,
    "nomePai" TEXT,
    "fotoCaminho" TEXT,
    "fotoTipoConteudo" TEXT,
    "fotoHashSha256" VARCHAR(64),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Servidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vinculo" (
    "id" TEXT NOT NULL,
    "servidorId" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "tipo" "TipoVinculoRh" NOT NULL,
    "regimeJuridico" TEXT NOT NULL,
    "dataAdmissao" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Vinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoVinculo" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoEventoVinculo" NOT NULL,
    "cargoId" TEXT,
    "lotacaoId" TEXT,
    "salarioBase" DECIMAL(18,2),
    "gratificacaoDescricao" TEXT,
    "gratificacaoValor" DECIMAL(18,2),
    "motivo" TEXT NOT NULL,
    "portariaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "HistoricoVinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dependente" (
    "id" TEXT NOT NULL,
    "servidorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" VARCHAR(11),
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "grauParentesco" "GrauParentesco" NOT NULL,
    "invalidezPermanente" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Dependente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalidadeDependente" (
    "id" TEXT NOT NULL,
    "dependenteId" TEXT NOT NULL,
    "finalidade" "FinalidadeDoDependente" NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "limiteIdadeAnos" INTEGER,
    "dataBaixa" TIMESTAMP(3),
    "motivoBaixa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "FinalidadeDependente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portaria" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "tipo" "TipoPortaria" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "ementa" TEXT NOT NULL,
    "dataPublicacao" TIMESTAMP(3),
    "veiculoPublicacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Portaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnotacaoServidor" (
    "id" TEXT NOT NULL,
    "servidorId" TEXT NOT NULL,
    "vinculoId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoAnotacaoServidor" NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "portariaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AnotacaoServidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treinamento" (
    "id" TEXT NOT NULL,
    "servidorId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "instituicao" TEXT,
    "cargaHoraria" INTEGER,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataTermino" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "Treinamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarioRh" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoDiaCalendario" NOT NULL,
    "descricao" TEXT NOT NULL,
    "horasExpediente" DECIMAL(4,2),
    "lotacaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "CalendarioRh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoTrabalho" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "prazo" "PrazoContratoTrabalho" NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataTerminoInicial" TIMESTAMP(3),
    "objetoContratacao" TEXT NOT NULL,
    "leiAutorizativa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ContratoTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProrrogacaoContratoTrabalho" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numeroTermo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "dias" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "ProrrogacaoContratoTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaliacaoExperiencia" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "etapa" INTEGER NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "resultado" "ResultadoAvaliacao" NOT NULL,
    "pontuacao" DECIMAL(6,2),
    "parecer" TEXT,
    "avaliadorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,

    CONSTRAINT "AvaliacaoExperiencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cargo_codigo_key" ON "Cargo"("codigo");

-- CreateIndex
CREATE INDEX "Cargo_tipo_idx" ON "Cargo"("tipo");

-- CreateIndex
CREATE INDEX "Cargo_dataExtincao_idx" ON "Cargo"("dataExtincao");

-- CreateIndex
CREATE UNIQUE INDEX "Lotacao_codigo_key" ON "Lotacao"("codigo");

-- CreateIndex
CREATE INDEX "Lotacao_paiId_idx" ON "Lotacao"("paiId");

-- CreateIndex
CREATE INDEX "Lotacao_unidadeOrcId_idx" ON "Lotacao"("unidadeOrcId");

-- CreateIndex
CREATE INDEX "Lotacao_dataExtincao_idx" ON "Lotacao"("dataExtincao");

-- CreateIndex
CREATE UNIQUE INDEX "Servidor_pessoaId_key" ON "Servidor"("pessoaId");

-- CreateIndex
CREATE INDEX "Servidor_dataNascimento_idx" ON "Servidor"("dataNascimento");

-- CreateIndex
CREATE UNIQUE INDEX "Vinculo_matricula_key" ON "Vinculo"("matricula");

-- CreateIndex
CREATE INDEX "Vinculo_servidorId_idx" ON "Vinculo"("servidorId");

-- CreateIndex
CREATE INDEX "Vinculo_tipo_idx" ON "Vinculo"("tipo");

-- CreateIndex
CREATE INDEX "Vinculo_dataAdmissao_idx" ON "Vinculo"("dataAdmissao");

-- CreateIndex
CREATE INDEX "HistoricoVinculo_vinculoId_data_idx" ON "HistoricoVinculo"("vinculoId", "data");

-- CreateIndex
CREATE INDEX "HistoricoVinculo_cargoId_idx" ON "HistoricoVinculo"("cargoId");

-- CreateIndex
CREATE INDEX "HistoricoVinculo_lotacaoId_idx" ON "HistoricoVinculo"("lotacaoId");

-- CreateIndex
CREATE INDEX "HistoricoVinculo_tipo_idx" ON "HistoricoVinculo"("tipo");

-- CreateIndex
CREATE INDEX "Dependente_servidorId_idx" ON "Dependente"("servidorId");

-- CreateIndex
CREATE INDEX "Dependente_dataNascimento_idx" ON "Dependente"("dataNascimento");

-- CreateIndex
CREATE INDEX "FinalidadeDependente_dependenteId_idx" ON "FinalidadeDependente"("dependenteId");

-- CreateIndex
CREATE INDEX "FinalidadeDependente_finalidade_idx" ON "FinalidadeDependente"("finalidade");

-- CreateIndex
CREATE INDEX "Portaria_vinculoId_idx" ON "Portaria"("vinculoId");

-- CreateIndex
CREATE INDEX "Portaria_tipo_idx" ON "Portaria"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Portaria_ano_numero_key" ON "Portaria"("ano", "numero");

-- CreateIndex
CREATE INDEX "AnotacaoServidor_servidorId_data_idx" ON "AnotacaoServidor"("servidorId", "data");

-- CreateIndex
CREATE INDEX "AnotacaoServidor_vinculoId_idx" ON "AnotacaoServidor"("vinculoId");

-- CreateIndex
CREATE INDEX "AnotacaoServidor_tipo_idx" ON "AnotacaoServidor"("tipo");

-- CreateIndex
CREATE INDEX "Treinamento_servidorId_idx" ON "Treinamento"("servidorId");

-- CreateIndex
CREATE INDEX "Treinamento_dataInicio_idx" ON "Treinamento"("dataInicio");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarioRh_data_key" ON "CalendarioRh"("data");

-- CreateIndex
CREATE INDEX "CalendarioRh_tipo_idx" ON "CalendarioRh"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ContratoTrabalho_numero_key" ON "ContratoTrabalho"("numero");

-- CreateIndex
CREATE INDEX "ContratoTrabalho_vinculoId_idx" ON "ContratoTrabalho"("vinculoId");

-- CreateIndex
CREATE INDEX "ProrrogacaoContratoTrabalho_contratoId_idx" ON "ProrrogacaoContratoTrabalho"("contratoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProrrogacaoContratoTrabalho_contratoId_numeroTermo_key" ON "ProrrogacaoContratoTrabalho"("contratoId", "numeroTermo");

-- CreateIndex
CREATE INDEX "AvaliacaoExperiencia_vinculoId_idx" ON "AvaliacaoExperiencia"("vinculoId");

-- CreateIndex
CREATE INDEX "AvaliacaoExperiencia_resultado_idx" ON "AvaliacaoExperiencia"("resultado");

-- CreateIndex
CREATE UNIQUE INDEX "AvaliacaoExperiencia_vinculoId_etapa_key" ON "AvaliacaoExperiencia"("vinculoId", "etapa");

-- AddForeignKey
ALTER TABLE "Lotacao" ADD CONSTRAINT "Lotacao_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "Lotacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lotacao" ADD CONSTRAINT "Lotacao_unidadeOrcId_fkey" FOREIGN KEY ("unidadeOrcId") REFERENCES "UnidadeOrcamentaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servidor" ADD CONSTRAINT "Servidor_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vinculo" ADD CONSTRAINT "Vinculo_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "Servidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoVinculo" ADD CONSTRAINT "HistoricoVinculo_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoVinculo" ADD CONSTRAINT "HistoricoVinculo_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoVinculo" ADD CONSTRAINT "HistoricoVinculo_lotacaoId_fkey" FOREIGN KEY ("lotacaoId") REFERENCES "Lotacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoVinculo" ADD CONSTRAINT "HistoricoVinculo_portariaId_fkey" FOREIGN KEY ("portariaId") REFERENCES "Portaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependente" ADD CONSTRAINT "Dependente_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "Servidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalidadeDependente" ADD CONSTRAINT "FinalidadeDependente_dependenteId_fkey" FOREIGN KEY ("dependenteId") REFERENCES "Dependente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portaria" ADD CONSTRAINT "Portaria_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnotacaoServidor" ADD CONSTRAINT "AnotacaoServidor_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "Servidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnotacaoServidor" ADD CONSTRAINT "AnotacaoServidor_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnotacaoServidor" ADD CONSTRAINT "AnotacaoServidor_portariaId_fkey" FOREIGN KEY ("portariaId") REFERENCES "Portaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treinamento" ADD CONSTRAINT "Treinamento_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "Servidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarioRh" ADD CONSTRAINT "CalendarioRh_lotacaoId_fkey" FOREIGN KEY ("lotacaoId") REFERENCES "Lotacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoTrabalho" ADD CONSTRAINT "ContratoTrabalho_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProrrogacaoContratoTrabalho" ADD CONSTRAINT "ProrrogacaoContratoTrabalho_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "ContratoTrabalho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoExperiencia" ADD CONSTRAINT "AvaliacaoExperiencia_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── CHECKs e índices parciais da origem (20260730000000_rh_cadastro_servidor, 20260730002000_rh_anotacoes_ficha) ──

-- ── DOCUMENTOS: SÓ DÍGITOS (o CPF do servidor e o CEP vivem na Pessoa canônica do M19; aqui só o PIS e o CPF do dependente) ──
ALTER TABLE "Servidor"
  ADD CONSTRAINT "ck_servidor_pis_digitos"
  CHECK ("pisPasep" IS NULL OR "pisPasep" ~ '^[0-9]{11}$');

-- Recém-nascido entra na folha antes de ter CPF — por isso NULO é aceito. O que não se aceita é CPF mal formado.
ALTER TABLE "Dependente"
  ADD CONSTRAINT "ck_dependente_cpf_digitos"
  CHECK ("cpf" IS NULL OR "cpf" ~ '^[0-9]{11}$');

-- ── O HISTÓRICO FUNCIONAL: CADA TIPO TRAZ O QUE PROMETE — são os CHECKs que sustentam as derivações ──
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_admissao_completa"
  CHECK (
    "tipo" <> 'ADMISSAO'
    OR ("cargoId" IS NOT NULL AND "lotacaoId" IS NOT NULL AND "salarioBase" IS NOT NULL)
  );
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_cargo_exigido"
  CHECK ("tipo" NOT IN ('PROMOCAO', 'MUDANCA_CARGO') OR "cargoId" IS NOT NULL);
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_lotacao_exigida"
  CHECK ("tipo" <> 'MUDANCA_LOTACAO' OR "lotacaoId" IS NOT NULL);
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_salario_exigido"
  CHECK ("tipo" NOT IN ('PROMOCAO', 'REAJUSTE_SALARIAL') OR "salarioBase" IS NOT NULL);
-- BICONDICIONAL: a gratificação traz valor E descrição, e nenhum outro tipo os traz.
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_gratificacao"
  CHECK (
    ("tipo" = 'GRATIFICACAO')
    = ("gratificacaoValor" IS NOT NULL AND "gratificacaoDescricao" IS NOT NULL)
  );
ALTER TABLE "HistoricoVinculo"
  ADD CONSTRAINT "ck_historico_vinculo_valores_positivos"
  CHECK (
    ("salarioBase" IS NULL OR "salarioBase" > 0)
    AND ("gratificacaoValor" IS NULL OR "gratificacaoValor" > 0)
  );
-- EXATAMENTE UMA ADMISSÃO E NO MÁXIMO UM DESLIGAMENTO POR VÍNCULO (readmitir é OUTRO vínculo).
CREATE UNIQUE INDEX "uq_historico_vinculo_admissao"
  ON "HistoricoVinculo"("vinculoId") WHERE "tipo" = 'ADMISSAO';
CREATE UNIQUE INDEX "uq_historico_vinculo_desligamento"
  ON "HistoricoVinculo"("vinculoId") WHERE "tipo" = 'DESLIGAMENTO';

-- ── CARGO: VAGAS E EXTINÇÃO ──
ALTER TABLE "Cargo"
  ADD CONSTRAINT "ck_cargo_vagas_nao_negativo"
  CHECK ("vagasFixadas" >= 0);
ALTER TABLE "Cargo"
  ADD CONSTRAINT "ck_cargo_extincao_completa"
  CHECK (("dataExtincao" IS NULL) = ("leiExtincao" IS NULL));
ALTER TABLE "Cargo"
  ADD CONSTRAINT "ck_cargo_carga_horaria_positiva"
  CHECK ("cargaHorariaSemanal" IS NULL OR "cargaHorariaSemanal" > 0);

-- ── LOTAÇÃO: A ÁRVORE NÃO SE FECHA EM SI (ciclo de um nó; ciclos maiores são do serviço) ──
ALTER TABLE "Lotacao"
  ADD CONSTRAINT "ck_lotacao_nao_e_pai_de_si"
  CHECK ("paiId" IS NULL OR "paiId" <> "id");

-- ── ANOTAÇÃO NA FICHA: título e texto não podem ser vazios ──
ALTER TABLE "AnotacaoServidor"
  ADD CONSTRAINT "ck_anotacao_servidor_conteudo"
  CHECK (length(btrim("titulo")) >= 3 AND length(btrim("texto")) >= 10);
