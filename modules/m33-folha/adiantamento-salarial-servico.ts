import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal, emProsa, toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { conferirReferenciaNormativa, type EstadoMinimoDoAdiantamento } from "./decimo-terceiro.js";
import { situacaoDaCertificacao, type FatoDaCertificacao } from "./certificacao.js";
import {
  zCadastrarParametroDoAdiantamentoSalarialInput,
  ParametroDoAdiantamentoSalarialAusenteError,
  type BaseDoAdiantamentoSalarial,
  type CadastrarParametroDoAdiantamentoSalarialInput,
  type ParametroLidoDoAdiantamentoSalarial,
  type ProcedenciaDoAbatimentoSalarial,
} from "./adiantamento-salarial.js";

/**
 * ═══ M33 — O PARÂMETRO DO ADIANTAMENTO SALARIAL E O QUE A MENSAL LÊ DELE (V13, TR 5.12.50) ═══
 *
 * Este arquivo NÃO calcula contracheque e não importa nada de `servico.ts` — a direção é sempre
 * `servico.ts → aqui`, para que o cálculo possa delegar sem que dois módulos se citem em ciclo.
 * É a mesma forma de `decimo-terceiro-servico.ts`.
 *
 * ⚠️ APPEND-ONLY, ZERO UPDATE. Corrigir o parâmetro é cadastrar a versão seguinte da mesma
 * competência; a vigente é a de maior `versao`. Nenhuma coluna é atualizada em lugar nenhum deste
 * arquivo, e é por isso que o censo de tabelas mutáveis do papel de runtime
 * (`prisma/papel-runtime.ts`) não precisa mudar: o `GRANT SELECT, INSERT` que toda tabela nova
 * recebe basta, e uma tabela que não pede UPDATE não entra naquele censo.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export class RubricaDoAdiantamentoSalarialInvalidaError extends Error {
  constructor(papel: string, codigo: string, motivo: string) {
    super(`RUBRICA-DO-ADIANTAMENTO-SALARIAL-INVALIDA: a rubrica ${codigo}, indicada como ${papel}, ${motivo}. Nada foi gravado.`);
    this.name = "RubricaDoAdiantamentoSalarialInvalidaError";
  }
}

/**
 * ═══ O CRITÉRIO "PAGO" SÓ SE OFERECE ONDE O FATO EXISTE ═══
 *
 * ⚠️ ESTA RECUSA É ESTRUTURAL, NÃO NORMATIVA, e é o que a torna legítima. Ela não diz que o ente
 * não pode exigir pagamento — diz que ESTE sistema não saberia responder "este servidor recebeu?"
 * com o cadastro que o ente tem hoje.
 *
 * A cadeia que liga um servidor a um `Pagamento` é
 * `Contracheque → grupo da rubrica → EmpenhoDaFolha → Empenho → Liquidacao → Pagamento`, e
 * `EmpenhoDaFolha` só carrega `vinculoId` quando o grupo empenha POR SERVIDOR. Com
 * `porServidor = false` existe UM empenho para o grupo inteiro, com credor declarado, e "quanto
 * saiu para a matrícula tal" não é representável em lugar nenhum do banco.
 *
 * ⚠️ E A RECUSA É NO CADASTRO, NÃO NO CÁLCULO. Aceitar aqui para falhar na mensal deixaria o ente
 * com um parâmetro inválido ocupando o número da versão (nada aqui apaga), e a descoberta
 * aconteceria no pior momento: com o vale já pago e a folha do mês para fechar.
 */
export class EstadoPagoNaoVerificavelNoAdiantamentoSalarialError extends Error {
  constructor(motivo: string, saida: string) {
    super(
      `ESTADO-PAGO-NAO-VERIFICAVEL: o critério "PAGO" exige saber se ESTE servidor recebeu o ` +
        `adiantamento salarial, e ${motivo}. Aceitar o critério assim faria o cálculo da folha mensal ` +
        `recusar a competência inteira por um fato que o cadastro nunca poderia produzir. ${saida} ` +
        `Enquanto isso, FECHADO e CERTIFICADO continuam disponíveis e verificáveis. Nada foi gravado.`
    );
    this.name = "EstadoPagoNaoVerificavelNoAdiantamentoSalarialError";
  }
}

/**
 * CADASTRA A VERSÃO SEGUINTE DO PARÂMETRO DO ADIANTAMENTO SALARIAL DE UMA COMPETÊNCIA.
 *
 * ⚠️ TODAS AS PRÉ-CONDIÇÕES SÃO CONFERIDAS ANTES DE QUALQUER GRAVAÇÃO, e isso é regra aprendida
 * neste repositório, não zelo: gravar o parâmetro e só então descobrir que a rubrica do abatimento
 * tem a natureza errada deixaria uma versão inválida ocupando o número — e a versão seguinte, que
 * é a correção, nasceria acima de um registro que ninguém consegue apagar (nada aqui apaga).
 */
export async function cadastrarParametroDoAdiantamentoSalarial(
  prisma: PrismaClient,
  input: CadastrarParametroDoAdiantamentoSalarialInput
): Promise<{ readonly parametroId: string; readonly versao: number }> {
  const d = zCadastrarParametroDoAdiantamentoSalarialInput.parse(input);

  // ⚠️ A COERÊNCIA DO ATO SE CONFERE PELA DATA CIVIL DO ENTE, e `new Date()` aqui é o instante;
  // quem o converte em ano é `anoCivil`, no domínio puro, com o fuso do ente e não com UTC.
  conferirReferenciaNormativa(
    { esfera: d.atoEsfera, tipo: d.atoTipo, numero: d.atoNumero, ano: d.atoAno, dispositivo: d.atoDispositivo, ementa: d.atoEmenta },
    new Date()
  );

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarParametroDoAdiantamentoSalarial, "ENTE");

    const papeis = [
      { papel: "rubrica do adiantamento", id: d.rubricaDoAdiantamentoId, tipoExigido: "PROVENTO" as const, naturezaExigida: null },
      {
        papel: "rubrica do abatimento",
        id: d.rubricaDoAbatimentoId,
        tipoExigido: "DESCONTO" as const,
        naturezaExigida: "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL" as const,
      },
    ];
    for (const p of papeis) {
      const r = await tx.rubrica.findUnique({ where: { id: p.id }, select: { codigo: true, tipo: true, natureza: true } });
      if (r === null) throw new RubricaDoAdiantamentoSalarialInvalidaError(p.papel, p.id, "não existe");
      if (r.tipo !== p.tipoExigido) {
        throw new RubricaDoAdiantamentoSalarialInvalidaError(p.papel, r.codigo, `é ${r.tipo} e precisa ser ${p.tipoExigido}`);
      }
      if (p.naturezaExigida !== null && r.natureza !== p.naturezaExigida) {
        throw new RubricaDoAdiantamentoSalarialInvalidaError(
          p.papel,
          r.codigo,
          `é de natureza ${r.natureza} e precisa ser ${p.naturezaExigida} — é essa natureza que faz o motor ` +
            `MENSAL buscar o valor na folha de adiantamento salarial da mesma competência, e nenhuma outra o ` +
            `faz. ⚠️ ABATIMENTO_DO_ADIANTAMENTO_DO_13 NÃO SERVE: ela abate na folha de 13º, e usá-la aqui ` +
            `faria o motor mensal descontar do salário do mês metade da gratificação natalina`
        );
      }
      // ⚠️ E A RUBRICA DO ADIANTAMENTO NÃO PODE SER UM ABATIMENTO DE NADA. O CHECK do banco garante
      // que as duas são distintas; isto garante que a de PROVENTO não é, ela própria, a natureza
      // que o motor mensal procura para descontar — o que faria o vale ser pago e abatido pela
      // mesma linha, com líquido zero e os dois lados registrados.
      if (p.naturezaExigida === null && r.natureza.startsWith("ABATIMENTO_")) {
        throw new RubricaDoAdiantamentoSalarialInvalidaError(p.papel, r.codigo, `é de natureza ${r.natureza}, que existe para DESCONTAR e não para pagar`);
      }
    }

    /**
     * ⚠️ A VERIFICABILIDADE DO CRITÉRIO "PAGO", CONFERIDA ANTES DE GRAVAR — junto das outras
     * pré-condições, e pela mesma regra aprendida.
     */
    if (d.estadoMinimoParaAbater === "PAGO") {
      const noGrupo = await tx.rubricaDoGrupoDeEmpenho.findUnique({
        where: { rubricaId: d.rubricaDoAdiantamentoId },
        select: { grupo: { select: { codigo: true, descricao: true, porServidor: true } } },
      });
      const codigo =
        (await tx.rubrica.findUnique({ where: { id: d.rubricaDoAdiantamentoId }, select: { codigo: true } }))?.codigo ??
        d.rubricaDoAdiantamentoId;
      if (noGrupo === null) {
        throw new EstadoPagoNaoVerificavelNoAdiantamentoSalarialError(
          `a rubrica do adiantamento (${codigo}) não está em GRUPO DE EMPENHO nenhum — sem empenho não há ` +
            `liquidação nem pagamento a consultar`,
          `Inclua ${codigo} num grupo de empenho que empenhe POR SERVIDOR, em Folha > Grupos de empenho.`
        );
      }
      if (!noGrupo.grupo.porServidor) {
        throw new EstadoPagoNaoVerificavelNoAdiantamentoSalarialError(
          `o grupo ${noGrupo.grupo.codigo} (${noGrupo.grupo.descricao}), que empenha a rubrica ${codigo}, emite ` +
            `UM empenho para o grupo inteiro com credor declarado (porServidor = false)`,
          `Para exigir PAGO, o ente precisa empenhar o vale POR SERVIDOR. A ficha, a série e o modo de empenhar ` +
            `de um grupo já empenhado não se trocam — use um grupo próprio para a rubrica do adiantamento.`
        );
      }
    }

    const ultima = await tx.parametroDoAdiantamentoSalarial.findFirst({
      where: { competencia: d.competencia },
      select: { versao: true },
      orderBy: { versao: "desc" },
    });
    const versao = (ultima?.versao ?? 0) + 1;

    const criado = await tx.parametroDoAdiantamentoSalarial.create({
      data: {
        competencia: d.competencia,
        versao,
        percentualDoAdiantamento: d.percentualDoAdiantamento.toFixed(4),
        baseDoAdiantamento: d.baseDoAdiantamento,
        estadoMinimoParaAbater: d.estadoMinimoParaAbater,
        rubricaDoAdiantamentoId: d.rubricaDoAdiantamentoId,
        rubricaDoAbatimentoId: d.rubricaDoAbatimentoId,
        atoEsfera: d.atoEsfera,
        atoTipo: d.atoTipo,
        atoNumero: d.atoNumero,
        atoAno: d.atoAno,
        atoDispositivo: d.atoDispositivo,
        atoEmenta: d.atoEmenta,
        criadoPor: d.criadoPor,
      },
      select: { id: true, versao: true },
    });
    return { parametroId: criado.id, versao: criado.versao };
  });
}

/** O que a leitura devolve: o parâmetro mais as duas rubricas já resolvidas. */
export interface ParametroDaCompetencia {
  readonly parametro: ParametroLidoDoAdiantamentoSalarial;
  readonly rubricaDoAdiantamentoId: string;
  readonly rubricaDoAbatimentoId: string;
}

const SELECT_DO_PARAMETRO = {
  id: true,
  competencia: true,
  versao: true,
  percentualDoAdiantamento: true,
  baseDoAdiantamento: true,
  estadoMinimoParaAbater: true,
  rubricaDoAdiantamentoId: true,
  rubricaDoAbatimentoId: true,
  atoEsfera: true,
  atoTipo: true,
  atoNumero: true,
  atoAno: true,
  atoDispositivo: true,
  atoEmenta: true,
} as const;

type LinhaDoParametro = {
  readonly id: string;
  readonly competencia: string;
  readonly versao: number;
  readonly percentualDoAdiantamento: Decimal | string;
  readonly baseDoAdiantamento: string;
  readonly estadoMinimoParaAbater: string;
  readonly rubricaDoAdiantamentoId: string;
  readonly rubricaDoAbatimentoId: string;
  readonly atoEsfera: string;
  readonly atoTipo: string;
  readonly atoNumero: string;
  readonly atoAno: number;
  readonly atoDispositivo: string;
  readonly atoEmenta: string;
};

function paraParametro(p: LinhaDoParametro): ParametroDaCompetencia {
  return {
    parametro: {
      id: p.id,
      competencia: p.competencia,
      versao: p.versao,
      percentualDoAdiantamento: new Decimal(p.percentualDoAdiantamento as Decimal),
      baseDoAdiantamento: p.baseDoAdiantamento as BaseDoAdiantamentoSalarial,
      estadoMinimoParaAbater: p.estadoMinimoParaAbater as EstadoMinimoDoAdiantamento,
      ato: {
        esfera: p.atoEsfera as ParametroLidoDoAdiantamentoSalarial["ato"]["esfera"],
        tipo: p.atoTipo as ParametroLidoDoAdiantamentoSalarial["ato"]["tipo"],
        numero: p.atoNumero,
        ano: p.atoAno,
        dispositivo: p.atoDispositivo,
        ementa: p.atoEmenta,
      },
    },
    rubricaDoAdiantamentoId: p.rubricaDoAdiantamentoId,
    rubricaDoAbatimentoId: p.rubricaDoAbatimentoId,
  };
}

/**
 * O PARÂMETRO VIGENTE DA COMPETÊNCIA — a versão de maior número. Recusa nomeando a competência
 * quando não há nenhuma: um vale calculado sem parâmetro seria um vale calculado com os números de
 * quem escreveu o motor.
 */
export async function parametroVigenteDaCompetencia(tx: Tx, competencia: string): Promise<ParametroDaCompetencia> {
  const p = await tx.parametroDoAdiantamentoSalarial.findFirst({
    where: { competencia },
    orderBy: { versao: "desc" },
    select: SELECT_DO_PARAMETRO,
  });
  if (p === null) throw new ParametroDoAdiantamentoSalarialAusenteError(competencia);
  return paraParametro(p as unknown as LinhaDoParametro);
}

/**
 * ═══ A VERSÃO QUE APUROU AQUELE CÁLCULO — A MEMÓRIA HISTÓRICA, NÃO A VIGENTE DE HOJE ═══
 *
 * ⚠️ É ESTA FUNÇÃO QUE FAZ "ALTERAÇÃO DE PARÂMETRO NÃO REESCREVE CÁLCULO FECHADO" SER VERDADE.
 *
 * O parâmetro é append-only e nada impede o ente de cadastrar a versão 2 de junho DEPOIS de o vale
 * de junho já ter sido calculado e fechado. Se a mensal lesse o VIGENTE, ela:
 *   · conferiria o abatimento contra um critério que ninguém aplicou;
 *   · e, se a versão 2 trocasse a rubrica do abatimento, lançaria o desconto numa rubrica que o
 *     vale não conhece — e o empenho cairia noutra ficha.
 *
 * O fato já existe e nada foi inventado para esta leitura: `calcularContrachequeDoAdiantamentoSalarial`
 * grava `parametro.id` e `parametro.versao` na memória de TODO contracheque de vale.
 *
 * ⚠️ UM CONTRACHEQUE BASTA, e a razão é local e visível: o motor lê o parâmetro UMA vez, antes do
 * laço, e passa o MESMO objeto a todos os contracheques daquele cálculo. Ler todas as memórias
 * para conferir uma igualdade garantida por construção custaria dezenas de MB numa folha de mil
 * servidores — o `select` de um `Json` traz a memória INTEIRA.
 *
 * ⚠️ E FALHA FECHADO. Memória ausente, ilegível ou sem o id não vira "segue pelo vigente": vira
 * recusa nomeada. Uma guarda que se desliga sozinha quando não entende o dado é pior que guarda
 * nenhuma, porque parece que está lá.
 */
export async function parametroQueApurouOCalculo(tx: Tx, calculoId: string, competencia: string): Promise<ParametroDaCompetencia> {
  const c = await tx.contracheque.findFirst({ where: { calculoId }, select: { memoria: true }, orderBy: { id: "asc" } });
  const irrecuperavel = (porque: string): never => {
    throw new Error(
      `PARAMETRO-DO-ADIANTAMENTO-SALARIAL-IRRECUPERAVEL: não foi possível recuperar qual versão do ` +
        `parâmetro apurou a folha de adiantamento salarial de ${competencia} — ${porque}. Sem isso não dá ` +
        `para garantir que o abatimento da mensal sai da MESMA régua que pagou o vale, e ler a versão ` +
        `vigente de hoje conferiria o desconto contra um critério que ninguém aplicou. Nada foi calculado.`
    );
  };
  if (c === null) irrecuperavel("o cálculo que fechou aquela folha não tem contracheque nenhum");
  const memoria = (c as { readonly memoria: unknown }).memoria;
  if (typeof memoria !== "object" || memoria === null) irrecuperavel("a memória do contracheque não é um objeto");
  const p = (memoria as Record<string, unknown>)["parametro"];
  if (typeof p !== "object" || p === null) irrecuperavel("a memória não traz o bloco `parametro`");
  const id = (p as Record<string, unknown>)["id"];
  if (typeof id !== "string" || id === "") irrecuperavel("a memória não traz o identificador do parâmetro");

  const linha = await tx.parametroDoAdiantamentoSalarial.findUnique({ where: { id: id as string }, select: SELECT_DO_PARAMETRO });
  if (linha === null) {
    irrecuperavel(
      `a memória cita o parâmetro ${String(id)}, que não existe mais na tabela — e o parâmetro é append-only, ` +
        `então isso não deveria ser possível`
    );
  }
  return paraParametro(linha as unknown as LinhaDoParametro);
}

// ═══════════════════════════════════════════════════════════════════════════════
// O QUE A FOLHA MENSAL LÊ — AS GUARDAS, NA ORDEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * O que o motor mensal recebe para abater a competência inteira. `null` quando não houve vale —
 * que é o caso da esmagadora maioria das competências e NÃO é anomalia nenhuma.
 */
export interface AbatimentoDaCompetencia {
  readonly rubricaDoAbatimentoId: string;
  /** Vínculo → valor APURADO no vale fechado. Só quem teve linha com valor maior que zero. */
  readonly porVinculo: ReadonlyMap<string, Money>;
  /** Vínculo → matrícula, para as recusas nomearem quem é. */
  readonly matriculaPorVinculo: ReadonlyMap<string, string>;
  readonly procedencia: ProcedenciaDoAbatimentoSalarial;
}

/**
 * ═══ O ADIANTAMENTO SALARIAL QUE A MENSAL DESTA COMPETÊNCIA TEM DE ABATER ═══
 *
 * ⚠️ A LEITURA É REFEITA A CADA CÁLCULO, POR COMPETÊNCIA, SEM FK — E ISSO É O CONTRÁRIO DO QUE O
 * 13º FAZ, DE PROPÓSITO.
 *
 * O 13º resolve `folhaDoAdiantamentoId` na ABERTURA da folha (`servico.ts`), e funciona porque
 * quando o 13º abre o adiantamento do exercício já existe. A MENSAL não tem essa garantia: ela
 * abre no início do mês e o vale sai no meio. Um elo resolvido na abertura nasceria NULO, e uma
 * guarda "o adiantamento apareceu depois" — copiada do 13º — bloquearia o cálculo pelo RESTO DA
 * COMPETÊNCIA, sem saída: a folha mensal não se abre duas vezes (`@@unique([competencia, tipo])`)
 * e reabrir não existe. Beco sem saída, e é a mesma classe de defeito que a seção 5b do MODULO.md
 * já documentou e consertou para o 13º.
 *
 * Aqui a leitura é como a da COMPLEMENTAR: refeita a cada `calcularFolha`, pela competência.
 * Recalcular a mensal depois de o vale fechar absorve o achado sem folha nova.
 */
export async function abatimentoDoAdiantamentoSalarialNaCompetencia(
  tx: Tx,
  competencia: string
): Promise<AbatimentoDaCompetencia | null> {
  const folha = await tx.folhaDePagamento.findUnique({
    where: { competencia_tipo: { competencia, tipo: "ADIANTAMENTO_SALARIAL" } },
    select: {
      id: true,
      competencia: true,
      fechamento: { select: { calculoId: true, calculo: { select: { numero: true } } } },
      certificacoes: { select: { tipo: true, calculoId: true, criadoEm: true } },
    },
  });
  // ⚠️ SEM FOLHA DE VALE NÃO HÁ NADA A ABATER, e isto NÃO é uma guarda desligada: é o estado
  // normal de toda competência em que o ente não pagou adiantamento. Transformar a ausência em
  // recusa bloquearia a folha mensal de todo município que não usa vale.
  if (folha === null) return null;

  // ── guarda 2: o vale existe e ainda NÃO fechou ──────────────────────────────
  /**
   * ⚠️ ABATER UM CÁLCULO QUE AINDA PODE MUDAR DEIXA A MENSAL ERRADA NO INSTANTE SEGUINTE. Quem
   * recalcular o vale depois disso muda o valor adiantado, e a mensal já fechada continuaria
   * descontando o número antigo — com os totais batendo dos dois lados.
   */
  if (folha.fechamento === null) {
    throw new Error(
      `ADIANTAMENTO-SALARIAL-NAO-FECHADO: a folha de adiantamento salarial de ${competencia} existe ` +
        `(${folha.id}) e ainda não foi FECHADA. Abater da mensal valores de um cálculo que ainda pode ` +
        `mudar deixaria a folha do mês errada assim que alguém recalculasse o vale, e os totais dos dois ` +
        `lados continuariam batendo. O QUE FAZER: feche a folha de adiantamento salarial de ` +
        `${competencia} antes de calcular a mensal. Nada foi calculado.`
    );
  }

  // ── o parâmetro que APUROU aquele vale, não o vigente de hoje ───────────────
  const cfg = await parametroQueApurouOCalculo(tx, folha.fechamento.calculoId, competencia);

  // ── o estado que o ente exigiu, conferido aqui ──────────────────────────────
  const exigido = cfg.parametro.estadoMinimoParaAbater;
  const certificacoes = folha.certificacoes as readonly FatoDaCertificacao[];
  const situacao = situacaoDaCertificacao(certificacoes, folha.fechamento.calculoId);
  const ato = `${cfg.parametro.ato.tipo} ${cfg.parametro.ato.numero}/${cfg.parametro.ato.ano}, ${cfg.parametro.ato.dispositivo}`;

  const linhas = await tx.linhaDoContracheque.findMany({
    where: { contracheque: { calculoId: folha.fechamento.calculoId }, rubricaId: cfg.rubricaDoAdiantamentoId },
    select: { valor: true, contracheque: { select: { vinculoId: true, vinculo: { select: { matricula: true } } } } },
  });

  const porVinculo = new Map<string, Money>();
  const matriculaPorVinculo = new Map<string, string>();
  for (const l of linhas) {
    const v = toMoney(l.valor);
    matriculaPorVinculo.set(l.contracheque.vinculoId, l.contracheque.vinculo.matricula);
    if (v.gt(0)) porVinculo.set(l.contracheque.vinculoId, v);
  }

  let verificado: EstadoMinimoDoAdiantamento = "FECHADO";

  if (exigido === "CERTIFICADO") {
    if (situacao !== "CERTIFICADA") {
      throw new Error(
        `ADIANTAMENTO-SALARIAL-NAO-CERTIFICADO: o parâmetro de ${competencia} (versão ${cfg.parametro.versao}) ` +
          `exige que o adiantamento salarial esteja ao menos CERTIFICADO para ser abatido — ${ato}. A folha de ` +
          `vale de ${competencia} está ${situacao}. ` +
          (situacao === "DEVOLVIDA"
            ? `Devolvida para correção é exatamente o caso que este critério existe para pegar: ela nunca será ` +
              `liquidada nem paga, e abatê-la descontaria do servidor dinheiro que não vai sair. `
            : `Quem o ente designou precisa atestar o cálculo do vale antes. `) +
          `Nada foi calculado.`
      );
    }
    verificado = "CERTIFICADO";
  }

  if (exigido === "PAGO") {
    /**
     * ⚠️ "FECHOU" NÃO É "PAGOU", E ESTE RAMO É A CONSEQUÊNCIA DISSO. Fechar congela o cálculo e
     * não move um centavo do caixa. Quando o ente declara PAGO, o abatimento só acontece depois
     * de o dinheiro ter saído PARA AQUELE SERVIDOR — e "saiu" é líquido de estorno e de anulação
     * parcial, somado por `packages/estornaveis`, nunca por uma soma escrita aqui.
     *
     * ⚠️ A CADEIA SÓ EXISTE COM `porServidor = true`. O cadastro do parâmetro já recusou o
     * critério quando o grupo não empenha por servidor; aqui se confere de novo, fail-closed,
     * porque entre cadastrar e calcular passa um mês inteiro e o grupo pode ter mudado.
     */
    const noGrupo = await tx.rubricaDoGrupoDeEmpenho.findUnique({
      where: { rubricaId: cfg.rubricaDoAdiantamentoId },
      select: { grupoId: true, grupo: { select: { codigo: true, porServidor: true } } },
    });
    if (noGrupo === null || !noGrupo.grupo.porServidor) {
      throw new Error(
        `ADIANTAMENTO-SALARIAL-PAGO-NAO-VERIFICAVEL: o parâmetro de ${competencia} exige PAGO, e a rubrica do ` +
          `vale ${noGrupo === null ? "não está em grupo de empenho nenhum" : `está no grupo ${noGrupo.grupo.codigo}, que emite UM empenho para o grupo inteiro (porServidor = false)`}. ` +
          `"Quanto foi pago a cada servidor" não existe como fato no banco nessa configuração — e abater assim ` +
          `seria supor. Cadastre a versão seguinte do parâmetro com FECHADO ou CERTIFICADO, ou empenhe o vale ` +
          `por servidor. Nada foi calculado.`
      );
    }
    const empenhos = await tx.empenhoDaFolha.findMany({
      where: { apropriacao: { folhaId: folha.id }, grupoId: noGrupo.grupoId },
      select: { empenhoId: true, vinculoId: true },
    });
    const empenhoDoVinculo = new Map<string, string>();
    for (const e of empenhos) if (e.vinculoId !== null) empenhoDoVinculo.set(e.vinculoId, e.empenhoId);

    const pagamentos =
      empenhos.length === 0
        ? []
        : await tx.pagamento.findMany({
            where: { liquidacao: { empenhoId: { in: empenhos.map((e) => e.empenhoId) } } },
            select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, liquidacao: { select: { empenhoId: true } } },
          });
    const porEmpenho = new Map<string, { id: string; valor: Money; estornoDeId: string | null; anulacaoParcialDeId: string | null }[]>();
    for (const pg of pagamentos) {
      const chave = pg.liquidacao.empenhoId;
      const lista = porEmpenho.get(chave) ?? [];
      lista.push({ id: pg.id, valor: toMoney(pg.valor), estornoDeId: pg.estornoDeId, anulacaoParcialDeId: pg.anulacaoParcialDeId });
      porEmpenho.set(chave, lista);
    }

    for (const [vinculoId, apurado] of porVinculo) {
      const matricula = matriculaPorVinculo.get(vinculoId) ?? vinculoId;
      const empenhoId = empenhoDoVinculo.get(vinculoId);
      const pago = empenhoId === undefined ? toMoney(0) : somaLiquidaEstornaveis(porEmpenho.get(empenhoId) ?? []);
      /**
       * ⚠️ PAGAMENTO PARCIAL NÃO SATISFAZ. O gate é "o apurado foi pago", não "houve pagamento":
       * com meio vale pago, abater o inteiro descontaria do salário do mês dinheiro que nunca saiu.
       */
      if (pago.lt(apurado)) {
        /**
         * ═══ ⚠️ O ESTORNO DEPOIS DE A MENSAL JÁ TER ABATIDO — DITO, EM VEZ DE DEIXADO ADIVINHAR ═══
         *
         * Esta consulta NÃO muda decisão nenhuma: a recusa acontece do mesmo jeito. Ela muda o que
         * a recusa DIZ, e a diferença é entre um operador que corrige e um que fica preso.
         *
         * O caso, medido em `m33-adiantamento-salarial-pago.test.ts`: o vale foi pago, a folha
         * mensal o abateu e FECHOU, e só então o pagamento foi anulado. A mensal fechada continua
         * como está (folha fechada não se recalcula — a obrigação já reconhecida NÃO desaparece), e
         * a COMPLEMENTAR, que seria o instrumento de pagar o que faltou, cai aqui: ela recalcula o
         * correto, o correto passa por este critério, e o critério agora não se satisfaz.
         *
         * ⚠️ A RECUSA É VERDADEIRA — o vale realmente não está mais pago — E ELA FECHA A PORTA DA
         * CORREÇÃO. A saída é ato próprio de reposição ou de reconhecimento, que este sistema não
         * pratica, e improvisá-lo aqui seria inventar ato financeiro. Fica nomeado
         * `ESTORNO-DO-VALE-BLOQUEIA-A-COMPLEMENTAR` no MODULO do M33. O que o código pode fazer, e
         * faz, é NOMEAR o beco em vez de deixar o operador descobri-lo por eliminação.
         */
        const jaAbatido = await tx.linhaDoContracheque.findFirst({
          where: {
            rubricaId: cfg.rubricaDoAbatimentoId,
            contracheque: { vinculoId, calculo: { fechamento: { isNot: null }, folha: { competencia } } },
          },
          select: { valor: true },
        });
        const abatidoAntes = jaAbatido === null ? null : toMoney(jaAbatido.valor);
        throw new Error(
          `ADIANTAMENTO-SALARIAL-NAO-PAGO: o parâmetro de ${competencia} (versão ${cfg.parametro.versao}) exige ` +
            `que o adiantamento esteja PAGO para ser abatido — ${ato}. A matrícula ${matricula} teve ` +
            `${emProsa(apurado.toFixed(2))} apurados no vale de ${competencia} e ${emProsa(pago.toFixed(2))} pagos ` +
            `(líquido de estorno e de anulação parcial)` +
            (empenhoId === undefined
              ? ` — não há empenho por servidor dessa folha para esta matrícula.`
              : pago.isZero()
                ? ` — nenhum pagamento registrado.`
                : `: pagamento PARCIAL não satisfaz o critério, e abater o apurado inteiro descontaria do mês o que não saiu.`) +
            (abatidoAntes === null || abatidoAntes.lte(0)
              ? ` Pague o saldo, ou cadastre a versão seguinte do parâmetro com o critério que o ato do ente de fato exige.`
              : ` ⚠️ E ATENÇÃO: uma folha JÁ FECHADA de ${competencia} abateu ${emProsa(abatidoAntes.toFixed(2))} desta ` +
                `matrícula. O pagamento do vale foi desfeito DEPOIS disso — o servidor ficou sem o adiantamento E com ` +
                `o desconto, e o ente lhe deve essa diferença. A folha fechada não se recalcula (a obrigação já ` +
                `reconhecida não desaparece), e esta folha não pode seguir abatendo o que não foi pago. Não há, neste ` +
                `sistema, ato que acerte isso: a reposição e o reconhecimento são atos próprios que ele não pratica. ` +
                `O QUE FAZER: trate o acerto fora daqui e registre a pendência; se a anulação do pagamento foi engano, ` +
                `refaça o pagamento do vale e recalcule.`) +
            ` Nada foi calculado.`
        );
      }
    }
    verificado = "PAGO";
  }

  return {
    rubricaDoAbatimentoId: cfg.rubricaDoAbatimentoId,
    porVinculo,
    matriculaPorVinculo,
    procedencia: {
      competencia,
      folhaId: folha.id,
      calculoNumero: folha.fechamento.calculo.numero,
      situacaoDaCertificacao: situacao,
      versaoDoParametro: cfg.parametro.versao,
      estadoExigido: exigido,
      estadoVerificado: verificado,
      ato,
    },
  };
}
