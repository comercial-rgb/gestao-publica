import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal } from "../../packages/contracts/index.js";
import {
  conferirReferenciaNormativa,
  zCadastrarParametroDoDecimoTerceiroInput,
  ParametroDoDecimoTerceiroAusenteError,
  type CadastrarParametroDoDecimoTerceiroInput,
  type ParametroLidoDoDecimoTerceiro,
} from "./decimo-terceiro.js";

/**
 * ═══ M33 — O PARÂMETRO DO 13º: CADASTRO E LEITURA (V11 V9.1) ═══
 *
 * Este arquivo NÃO calcula nada e não importa nada de `servico.ts` — a direção é sempre
 * `servico.ts → aqui`, para que o cálculo possa delegar sem que dois módulos se citem em ciclo.
 *
 * ⚠️ APPEND-ONLY, ZERO UPDATE. Corrigir o parâmetro é cadastrar a versão seguinte do mesmo
 * exercício; a vigente é a de maior `versao`. Nenhuma coluna é atualizada em lugar nenhum deste
 * arquivo, e é por isso que o censo de tabelas do papel de runtime não precisou mudar: o
 * `GRANT SELECT, INSERT` que toda tabela nova recebe basta.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** As naturezas que podem compor a base do 13º — e o motivo de cada ausência está abaixo. */
const NATUREZAS_ADMITIDAS_NA_BASE = ["VENCIMENTO_BASE", "GRATIFICACOES_DO_VINCULO", "PERCENTUAL_DO_VENCIMENTO"] as const;

export class RubricaNaoAdmitidaNaBaseError extends Error {
  constructor(codigo: string, natureza: string) {
    super(
      `RUBRICA-NAO-ADMITIDA-NA-BASE: a rubrica ${codigo} é de natureza ${natureza} e não pode compor ` +
        `a base do 13º. Compor o 13º com valor informado ou com fórmula exigiria a MÉDIA das ` +
        `variáveis do ano (TR 5.12.82), que este sistema não calcula — e somar o lançamento de um ` +
        `mês só seria pior que recusar: pagaria 13º sobre a hora extra de dezembro como se fosse a ` +
        `do ano inteiro. Use vencimento-base, gratificações do vínculo ou percentual do vencimento. ` +
        `Nada foi gravado.`
    );
    this.name = "RubricaNaoAdmitidaNaBaseError";
  }
}

export class RubricaDoDecimoTerceiroInvalidaError extends Error {
  constructor(papel: string, codigo: string, motivo: string) {
    super(`RUBRICA-DO-13-INVALIDA: a rubrica ${codigo}, indicada como ${papel}, ${motivo}. Nada foi gravado.`);
    this.name = "RubricaDoDecimoTerceiroInvalidaError";
  }
}

/**
 * CADASTRA A VERSÃO SEGUINTE DO PARÂMETRO DO 13º DE UM EXERCÍCIO.
 *
 * ⚠️ TODAS AS PRÉ-CONDIÇÕES SÃO CONFERIDAS ANTES DE QUALQUER GRAVAÇÃO, e isso é regra aprendida
 * neste repositório, não zelo: gravar o parâmetro e só então descobrir que uma rubrica da base é
 * de valor informado deixaria uma versão inválida ocupando o número — e a versão seguinte, que é
 * a correção, nasceria acima de um registro que ninguém consegue apagar (nada aqui apaga).
 */
export async function cadastrarParametroDoDecimoTerceiro(
  prisma: PrismaClient,
  input: CadastrarParametroDoDecimoTerceiroInput
): Promise<{ readonly parametroId: string; readonly versao: number }> {
  const d = zCadastrarParametroDoDecimoTerceiroInput.parse(input);

  // ⚠️ A COERÊNCIA DO ATO SE CONFERE PELA DATA CIVIL DO ENTE, e `new Date()` aqui é o instante;
  // quem o converte em ano é `anoCivil`, no domínio puro, com o fuso do ente e não com UTC.
  conferirReferenciaNormativa(
    { esfera: d.atoEsfera, tipo: d.atoTipo, numero: d.atoNumero, ano: d.atoAno, dispositivo: d.atoDispositivo, ementa: d.atoEmenta },
    new Date()
  );

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarParametroDoDecimoTerceiro, "ENTE");

    const papeis: readonly { readonly papel: string; readonly id: string; readonly tipoExigido: "PROVENTO" | "DESCONTO"; readonly naturezaExigida?: string }[] = [
      { papel: "rubrica do 13º", id: d.rubricaDoDecimoTerceiroId, tipoExigido: "PROVENTO" },
      { papel: "rubrica do adiantamento", id: d.rubricaDoAdiantamentoId, tipoExigido: "PROVENTO" },
      { papel: "rubrica do abatimento", id: d.rubricaDoAbatimentoId, tipoExigido: "DESCONTO", naturezaExigida: "ABATIMENTO_DO_ADIANTAMENTO_DO_13" },
    ];
    for (const p of papeis) {
      const r = await tx.rubrica.findUnique({ where: { id: p.id }, select: { codigo: true, tipo: true, natureza: true } });
      if (r === null) throw new RubricaDoDecimoTerceiroInvalidaError(p.papel, p.id, "não existe");
      if (r.tipo !== p.tipoExigido) {
        throw new RubricaDoDecimoTerceiroInvalidaError(p.papel, r.codigo, `é ${r.tipo} e precisa ser ${p.tipoExigido}`);
      }
      if (p.naturezaExigida !== undefined && r.natureza !== p.naturezaExigida) {
        throw new RubricaDoDecimoTerceiroInvalidaError(
          p.papel, r.codigo,
          `é de natureza ${r.natureza} e precisa ser ${p.naturezaExigida} — é essa natureza que faz o motor ` +
            `buscar o valor na folha de adiantamento, e nenhuma outra o faz`
        );
      }
    }

    const daBase = await tx.rubrica.findMany({
      where: { id: { in: d.rubricasDaBase } },
      select: { id: true, codigo: true, natureza: true, tipo: true },
    });
    if (daBase.length !== new Set(d.rubricasDaBase).size) {
      throw new RubricaDoDecimoTerceiroInvalidaError("rubrica da base", d.rubricasDaBase.join(", "), "inclui identificador que não corresponde a rubrica nenhuma");
    }
    for (const r of daBase) {
      if (r.tipo !== "PROVENTO") throw new RubricaDoDecimoTerceiroInvalidaError("rubrica da base", r.codigo, `é ${r.tipo}; a base do 13º soma PROVENTOS`);
      if (!(NATUREZAS_ADMITIDAS_NA_BASE as readonly string[]).includes(r.natureza)) {
        throw new RubricaNaoAdmitidaNaBaseError(r.codigo, r.natureza);
      }
    }

    const ultima = await tx.parametroDoDecimoTerceiro.findFirst({
      where: { exercicio: d.exercicio },
      select: { versao: true },
      orderBy: { versao: "desc" },
    });
    const versao = (ultima?.versao ?? 0) + 1;

    const criado = await tx.parametroDoDecimoTerceiro.create({
      data: {
        exercicio: d.exercicio,
        versao,
        diasMinimosDoAvo: d.diasMinimosDoAvo,
        avosNoExercicio: d.avosNoExercicio,
        percentualDaPrimeiraParcela: d.percentualDaPrimeiraParcela.toFixed(4),
        baseDosAvosDoAdiantamento: d.baseDosAvosDoAdiantamento,
        decimoTerceiroSofreContribuicao: d.decimoTerceiroSofreContribuicao,
        decimoTerceiroSofreIrrf: d.decimoTerceiroSofreIrrf,
        rubricaDoDecimoTerceiroId: d.rubricaDoDecimoTerceiroId,
        rubricaDoAdiantamentoId: d.rubricaDoAdiantamentoId,
        rubricaDoAbatimentoId: d.rubricaDoAbatimentoId,
        atoEsfera: d.atoEsfera,
        atoTipo: d.atoTipo,
        atoNumero: d.atoNumero,
        atoAno: d.atoAno,
        atoDispositivo: d.atoDispositivo,
        atoEmenta: d.atoEmenta,
        criadoPor: d.criadoPor,
        rubricasDaBase: { create: daBase.map((r) => ({ rubricaId: r.id, criadoPor: d.criadoPor })) },
      },
      select: { id: true, versao: true },
    });
    return { parametroId: criado.id, versao: criado.versao };
  });
}

/** O que a leitura devolve: o parâmetro vigente mais as três rubricas e a base, já resolvidos. */
export interface ParametroDoExercicio {
  readonly parametro: ParametroLidoDoDecimoTerceiro;
  readonly rubricaDoDecimoTerceiroId: string;
  readonly rubricaDoAdiantamentoId: string;
  readonly rubricaDoAbatimentoId: string;
  readonly rubricasDaBase: readonly string[];
}

/**
 * O PARÂMETRO VIGENTE DO EXERCÍCIO — a versão de maior número. Recusa nomeando o exercício quando
 * não há nenhuma: um 13º calculado sem parâmetro seria um 13º calculado com os números de quem
 * escreveu o motor.
 */
export async function parametroVigenteDoExercicio(tx: Tx, exercicio: number): Promise<ParametroDoExercicio> {
  const p = await tx.parametroDoDecimoTerceiro.findFirst({
    where: { exercicio },
    orderBy: { versao: "desc" },
    select: {
      id: true, exercicio: true, versao: true, diasMinimosDoAvo: true, avosNoExercicio: true,
      percentualDaPrimeiraParcela: true, baseDosAvosDoAdiantamento: true,
      decimoTerceiroSofreContribuicao: true, decimoTerceiroSofreIrrf: true,
      rubricaDoDecimoTerceiroId: true, rubricaDoAdiantamentoId: true, rubricaDoAbatimentoId: true,
      atoEsfera: true, atoTipo: true, atoNumero: true, atoAno: true, atoDispositivo: true, atoEmenta: true,
      rubricasDaBase: { select: { rubricaId: true } },
    },
  });
  if (p === null) throw new ParametroDoDecimoTerceiroAusenteError(exercicio);
  return {
    parametro: {
      id: p.id,
      exercicio: p.exercicio,
      versao: p.versao,
      diasMinimosDoAvo: p.diasMinimosDoAvo,
      avosNoExercicio: p.avosNoExercicio,
      percentualDaPrimeiraParcela: new Decimal(p.percentualDaPrimeiraParcela),
      baseDosAvosDoAdiantamento: p.baseDosAvosDoAdiantamento as ParametroLidoDoDecimoTerceiro["baseDosAvosDoAdiantamento"],
      decimoTerceiroSofreContribuicao: p.decimoTerceiroSofreContribuicao,
      decimoTerceiroSofreIrrf: p.decimoTerceiroSofreIrrf,
      ato: {
        esfera: p.atoEsfera as ParametroLidoDoDecimoTerceiro["ato"]["esfera"],
        tipo: p.atoTipo as ParametroLidoDoDecimoTerceiro["ato"]["tipo"],
        numero: p.atoNumero,
        ano: p.atoAno,
        dispositivo: p.atoDispositivo,
        ementa: p.atoEmenta,
      },
    },
    rubricaDoDecimoTerceiroId: p.rubricaDoDecimoTerceiroId,
    rubricaDoAdiantamentoId: p.rubricaDoAdiantamentoId,
    rubricaDoAbatimentoId: p.rubricaDoAbatimentoId,
    rubricasDaBase: p.rubricasDaBase.map((r) => r.rubricaId),
  };
}
