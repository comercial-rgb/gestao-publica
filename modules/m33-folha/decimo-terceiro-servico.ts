import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal, emProsa } from "../../packages/contracts/index.js";
import {
  conferirReferenciaNormativa,
  zCadastrarParametroDoDecimoTerceiroInput,
  ParametroDoDecimoTerceiroAusenteError,
  type CadastrarParametroDoDecimoTerceiroInput,
  type EstadoMinimoDoAdiantamento,
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
        `variáveis do ano, que este sistema não calcula — e somar o lançamento de um ` +
        `mês só seria pior que recusar: pagaria 13º sobre a hora extra de dezembro como se fosse a ` +
        `do ano inteiro. Use vencimento-base, gratificações do vínculo ou percentual do vencimento. ` +
        `Nada foi gravado.`
    );
    this.name = "RubricaNaoAdmitidaNaBaseError";
  }
}

/**
 * ═══ V11 V9.3 — O CRITÉRIO "PAGO" SÓ SE OFERECE ONDE O FATO EXISTE ═══
 *
 * ⚠️ ESTE ERRO É ESTRUTURAL, NÃO NORMATIVO, e a diferença é o que o torna legítimo. Ele não diz
 * que o ente não pode exigir pagamento — diz que ESTE sistema não saberia responder à pergunta
 * "este servidor recebeu?" com o cadastro que o ente tem hoje.
 *
 * O motivo é concreto: a cadeia que liga um servidor a um `Pagamento` é
 * `Contracheque → grupo da rubrica → EmpenhoDaFolha → Empenho → Liquidacao → Pagamento`, e o
 * `EmpenhoDaFolha` só carrega `vinculoId` quando o grupo empenha POR SERVIDOR. Com
 * `porServidor = false` existe UM empenho para o grupo inteiro, com credor declarado — e "quanto
 * saiu para a matrícula 22222222222" não é representável em lugar nenhum do banco.
 *
 * ⚠️ E A RECUSA É NO CADASTRO, NÃO NO CÁLCULO. Aceitar aqui para falhar em dezembro deixaria o
 * ente com um parâmetro inválido ocupando o número da versão (nada aqui apaga) e a descoberta
 * aconteceria no pior momento possível. É a mesma razão pela qual o grupo apontado para ficha de
 * material é recusado no cadastro do grupo, e não na liquidação com metade dos empenhos feitos.
 */
export class EstadoPagoNaoVerificavelError extends Error {
  constructor(motivo: string, saida: string) {
    super(
      `ESTADO-PAGO-NAO-VERIFICAVEL: o critério "PAGO" exige saber se ESTE servidor recebeu a 1ª ` +
        `parcela, e ${motivo}. Aceitar o critério assim faria o cálculo de dezembro recusar a folha ` +
        `inteira por um fato que o cadastro nunca poderia produzir. ${saida} ` +
        `Enquanto isso, os critérios FECHADO e CERTIFICADO continuam disponíveis e verificáveis. ` +
        `Nada foi gravado.`
    );
    this.name = "EstadoPagoNaoVerificavelError";
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

    /**
     * ⚠️ V11 V9.3 — A VERIFICABILIDADE DO CRITÉRIO "PAGO", CONFERIDA ANTES DE GRAVAR.
     *
     * Roda junto das outras pré-condições, e pela mesma regra aprendida: gravar e só então
     * descobrir que o critério é inverificável deixaria uma versão inválida ocupando o número.
     */
    if (d.estadoMinimoDoAdiantamentoParaAbater === "PAGO") {
      const noGrupo = await tx.rubricaDoGrupoDeEmpenho.findUnique({
        where: { rubricaId: d.rubricaDoAdiantamentoId },
        select: { grupo: { select: { codigo: true, descricao: true, porServidor: true } } },
      });
      const codigoDaRubrica =
        (await tx.rubrica.findUnique({ where: { id: d.rubricaDoAdiantamentoId }, select: { codigo: true } }))?.codigo ??
        d.rubricaDoAdiantamentoId;
      if (noGrupo === null) {
        throw new EstadoPagoNaoVerificavelError(
          `a rubrica do adiantamento (${codigoDaRubrica}) não está em GRUPO DE EMPENHO nenhum — sem ` +
            `empenho não há liquidação nem pagamento a consultar`,
          `Inclua ${codigoDaRubrica} num grupo de empenho que empenhe POR SERVIDOR, em Folha > Grupos de empenho.`
        );
      }
      if (!noGrupo.grupo.porServidor) {
        throw new EstadoPagoNaoVerificavelError(
          `o grupo ${noGrupo.grupo.codigo} (${noGrupo.grupo.descricao}), que empenha a rubrica ` +
            `${codigoDaRubrica}, emite UM empenho para o grupo inteiro com credor declarado ` +
            `(porServidor = false) — "quanto foi pago a cada servidor" não existe como fato no banco`,
          `Para exigir PAGO, o ente precisa empenhar a 1ª parcela POR SERVIDOR (grupo com credor = o CPF ` +
            `de cada um). A ficha, a série e o modo de empenhar de um grupo já empenhado não se trocam — ` +
            `use um grupo próprio para a rubrica do adiantamento.`
        );
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
        estadoMinimoDoAdiantamentoParaAbater: d.estadoMinimoDoAdiantamentoParaAbater,
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
      estadoMinimoDoAdiantamentoParaAbater: true,
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
      estadoMinimoDoAdiantamentoParaAbater: p.estadoMinimoDoAdiantamentoParaAbater as EstadoMinimoDoAdiantamento | null,
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

/**
 * ═══ V11 V9.3 — O CÁLCULO FECHADO ABATEU, E SOB QUE CRITÉRIO? ═══
 *
 * Quem pergunta é a APROPRIAÇÃO, que precisa saber se o que vai empenhar é apuração aprovada ou
 * simulação. A resposta vem da MEMÓRIA do contracheque, e não do parâmetro VIGENTE agora — a
 * diferença é o ponto: o parâmetro é append-only, e nada impede que o ente declare o critério
 * DEPOIS de a folha de dezembro já ter sido calculada sem ele. Ler o vigente diria "declarado" de
 * um cálculo que rodou sem conferir nada, e a efetivação passaria.
 *
 * ⚠️ FALHA FECHADO, e pelo mesmo motivo de `reguaDoParametroNoCalculo`: memória ausente ou
 * ilegível num cálculo QUE ABATEU não vira "segue sem conferir". Vira recusa nomeada. Uma guarda
 * que se desliga sozinha quando não entende o dado é pior que guarda nenhuma, porque parece que
 * está lá.
 *
 * ⚠️ E O CÁLCULO ANTIGO, DE ANTES DESTA RODADA, RESPONDE `null` — que é a verdade: ele rodou
 * quando ninguém perguntava, logo nenhum ato do ente o sustenta. Nada é desfeito (a folha já
 * apropriada continua apropriada); o que se bloqueia é a efetivação que ainda não aconteceu.
 */
export interface CriterioDoAbatimentoNoCalculo {
  /** Há linha de abatimento do adiantamento com valor > 0 neste cálculo. */
  readonly abateu: boolean;
  /** Σ abatida no cálculo, para a mensagem dizer de quanto se trata. */
  readonly totalAbatido: string;
  /** O que o ente declarava quando este cálculo rodou. `null` = não declarava nada. */
  readonly criterioDeclarado: EstadoMinimoDoAdiantamento | null;
}

export async function criterioDoAbatimentoNoCalculo(tx: Tx, calculoId: string): Promise<CriterioDoAbatimentoNoCalculo> {
  const linhas = await tx.linhaDoContracheque.findMany({
    where: { contracheque: { calculoId }, rubrica: { natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13" } },
    select: { valor: true },
  });
  const total = linhas.reduce((acc, l) => acc.plus(new Decimal(l.valor)), new Decimal(0));
  if (total.lte(0)) return { abateu: false, totalAbatido: total.toFixed(2), criterioDeclarado: null };

  const c = await tx.contracheque.findFirst({ where: { calculoId }, select: { memoria: true }, orderBy: { id: "asc" } });
  const recusar = (porque: string): never => {
    throw new Error(
      `CRITERIO-DO-ABATIMENTO-IRRECUPERAVEL: o cálculo abateu ${emProsa(total.toFixed(2))} de adiantamento e ` +
        `não foi possível recuperar sob que critério — ${porque}. Sem isso não dá para dizer se esta ` +
        `folha é apuração aprovada ou simulação, e empenhá-la seria efetivar o que não se sabe. ` +
        `Nada foi gravado.`
    );
  };
  if (c === null) recusar("o cálculo não tem contracheque nenhum");
  const memoria = (c as { readonly memoria: unknown }).memoria;
  if (typeof memoria !== "object" || memoria === null) recusar("a memória do contracheque não é um objeto");
  const par = (memoria as Record<string, unknown>)["parametro"];
  if (typeof par !== "object" || par === null) recusar("a memória não traz o bloco `parametro`");
  const bruto = (par as Record<string, unknown>)["estadoMinimoDoAdiantamentoParaAbater"];
  /**
   * ⚠️ `undefined` E `null` SÃO A MESMA RESPOSTA AQUI, E SÓ AQUI. `undefined` é o cálculo antigo
   * (a chave não existia); `null` é o cálculo novo cujo ente não declarou. Os dois significam
   * "nenhum ato do ente sustenta este abatimento", que é o que a apropriação precisa saber.
   * Qualquer OUTRA coisa — um valor fora da união — é dado corrompido e recusa.
   */
  if (bruto === undefined || bruto === null) return { abateu: true, totalAbatido: total.toFixed(2), criterioDeclarado: null };
  if (bruto !== "FECHADO" && bruto !== "CERTIFICADO" && bruto !== "PAGO") {
    recusar(`a memória traz \`${String(bruto)}\`, que não é um estado que este sistema conheça`);
  }
  return { abateu: true, totalAbatido: total.toFixed(2), criterioDeclarado: bruto as EstadoMinimoDoAdiantamento };
}
