import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { janelaCivilDoAno } from "../../packages/datas/index.js";
import { saldosDeControle } from "../m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * M08 — A CLASSIFICAÇÃO DA CONTA DE CONTROLE NA VIRADA (V20).
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO CONSERTA, E ELE FOI MEDIDO ═══
 * `encerrarControlesOrcamentarios` está completo desde a V15 — com lock por exercício, idempotência
 * derivada do saldo, perna derivada do SINAL e recusa fail-closed de conta sem destino. Mas a
 * tabela-parâmetro de que ele depende, `ContaNaVirada`, **não tinha escritor nenhum**: busca por
 * `contaNaVirada.create|upsert|createMany` em `modules/`, `lib/`, `scripts/` e `prisma/` devolveu
 * quatro ocorrências, TODAS em arquivos de teste. Em instalação real a tabela fica vazia para
 * sempre, e a virada recusa — corretamente, e sem caminho para resolver.
 *
 * O resultado prático: a dotação inicial e o crédito disponível de um exercício ATRAVESSAM para o
 * seguinte. O `beginning_balance` da MSC de janeiro de E+1 traz a dotação de E, e o segundo ano do
 * sistema publica à União um orçamento que é a soma de dois.
 *
 * ═══ ⚠️ AÇÃO PRÓPRIA, E NÃO A DO ENCERRAMENTO ═══
 * `PARAMETRIZAR_VIRADA_DOS_CONTROLES` é ação separada de `ENCERRAR_CONTROLES_ORCAMENTARIOS`. Dizer
 * que a dotação CADUCA (art. 167, II da CF) é ato normativo do ente; enterrar o orçamento é ato de
 * execução, feito uma vez por ano. Fundir as duas daria a quem executa o poder de reescrever a régua
 * pela qual o próprio encerramento dele é medido — a mesma segregação que separa
 * `PARAMETRIZAR_ROTEIRO_ORCAMENTARIO` de `EMPENHAR`.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export type DestinoDaConta = "ENCERRA" | "TRANSFERE";

// ═══════════════════════════════════════════════════════════════════════════
// A SUGESTÃO PELA DOUTRINA — pura, e ela SUGERE, não decide
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Os ramos do PCASP cujo controle ATRAVESSA a virada, com a razão de cada um.
 *
 * ⚠️ É UMA LISTA DE PREFIXOS DO PLANO OFICIAL, e ela é curta de propósito: `5.3` é a INSCRIÇÃO de
 * restos a pagar e `6.3` é a EXECUÇÃO deles. O resto a pagar inscrito em 31/12 é obrigação viva em
 * 1º/01 — o controle dele não pode morrer com o orçamento que o gerou, ou o ente perderia o registro
 * de quanto deve executar de exercícios anteriores.
 *
 * ⚠️ E ISTO NÃO É UMA TABELA DE DECISÃO. É o texto que a tela mostra ao lado do campo, preenchido
 * como ponto de partida. A decisão continua sendo do ente, gravada com justificativa própria: quem
 * confirma a sugestão escreve por que, e quem discorda troca. Uma "sugestão" que fosse aplicada em
 * silêncio seria a norma da STN inventada dentro de um `if`.
 */
const RAMOS_QUE_TRANSFEREM: readonly { readonly prefixo: string; readonly razao: string }[] = [
  {
    prefixo: "5.3",
    razao:
      "inscrição de restos a pagar: o resto inscrito em 31 de dezembro é obrigação viva em 1º de " +
      "janeiro, e o controle da inscrição atravessa a virada com ela",
  },
  {
    prefixo: "6.3",
    razao:
      "execução de restos a pagar: o que falta liquidar e pagar de exercícios anteriores continua " +
      "sendo executado no exercício seguinte",
  },
];

export interface SugestaoDeDestino {
  readonly destino: DestinoDaConta;
  /** A razão, em português, para a tela mostrar ao lado do campo. */
  readonly razao: string;
}

/**
 * O destino SUGERIDO para uma conta de controle, pelo código dela no plano oficial.
 *
 * ⚠️ O PADRÃO É `ENCERRA`, e ele não é preguiça: o orçamento é ANUAL (CF art. 165), e em 31/12 a
 * autorização de gastar morre — o crédito não empenhado caduca (art. 167, II). Quem transfere é a
 * exceção, e a exceção tem nome e ramo.
 */
export function destinoSugerido(codigo: string): SugestaoDeDestino {
  const ramo = RAMOS_QUE_TRANSFEREM.find((r) => codigo.startsWith(r.prefixo));
  if (ramo !== undefined) {
    return { destino: "TRANSFERE", razao: ramo.razao };
  }
  return {
    destino: "ENCERRA",
    razao:
      "o orçamento é anual: em 31 de dezembro a autorização de gastar morre e o crédito não " +
      "empenhado caduca (Constituição, artigo 167, inciso II)",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// A CONSULTA — a lista CURTA que a tela oferece
// ═══════════════════════════════════════════════════════════════════════════

export interface ContaDaVirada {
  readonly contaId: string;
  readonly codigo: string;
  readonly nome: string;
  readonly naturezaSaldo: "DEVEDORA" | "CREDORA";
  /** O saldo no corte, com a natureza da conta. Pode ser NEGATIVO. */
  readonly saldo: Money;
  /** A perna que zeraria esta conta — derivada do SINAL, como no serviço. */
  readonly pernaSeEncerrar: "DEBITO" | "CREDITO";
  readonly destino: DestinoDaConta | null;
  readonly justificativa: string | null;
  readonly classificadoPor: string | null;
  readonly sugestao: SugestaoDeDestino;
  readonly analitica: boolean;
}

export interface ContasDaVirada {
  readonly ano: number;
  readonly corte: Date;
  readonly exercicioId: string | null;
  readonly exercicioEncerrado: boolean;
  readonly contas: readonly ContaDaVirada[];
  /** Σ do que morreria, pela perna. É a conferência que o leitor faria com o dedo. */
  readonly somaDebito: Money;
  readonly somaCredito: Money;
}

/**
 * A perna que zera uma conta — DERIVADA DO SINAL, exatamente como no serviço de encerramento.
 *
 * ⚠️ A DUPLICAÇÃO É DELIBERADA E ELA É CONFERIDA: o teste afirma que, para cada conta, a perna que
 * esta consulta mostra é a MESMA que o encerramento grava. Mostrar uma perna na tela e gravar outra
 * seria pior do que não mostrar nada.
 */
export function pernaQueZera(
  naturezaSaldo: "DEVEDORA" | "CREDORA",
  saldo: Money
): "DEBITO" | "CREDITO" {
  const positivo = saldo.greaterThan(0);
  const devedora = naturezaSaldo === "DEVEDORA";
  return devedora === positivo ? "CREDITO" : "DEBITO";
}

/**
 * AS CONTAS DAS CLASSES 5 E 6 COM SALDO no corte do exercício, com a classificação que já têm.
 *
 * ⚠️ É O RECORTE QUE FAZ A TELA SER USÁVEL. O plano tem 7.864 contas; um `select` com todas elas,
 * ordenado por código, é o formulário bonito e inútil que a regra de interface proíbe. O que precisa
 * de decisão é o que TEM SALDO em 31/12 — e isso, num ente real, são poucas dezenas de linhas.
 *
 * ⚠️ E A SOMA VEM JUNTO, pelas duas pernas. Se ΣDÉBITO ≠ ΣCRÉDITO com as classificações atuais, o
 * encerramento será recusado pelo motor do M01 — e é melhor o operador ver isso ANTES de clicar do
 * que depois, numa mensagem sobre subsistema desbalanceado.
 */
export async function contasDaVirada(
  tx: Tx,
  p: { readonly ano: number }
): Promise<ContasDaVirada> {
  const corte = janelaCivilDoAno(p.ano).fim;

  const exercicio = await tx.exercicio.findFirst({
    where: { ano: p.ano },
    select: { id: true, encerramento: { select: { id: true } } },
  });

  const saldos = (
    await saldosDeControle(tx, { classes: ["5", "6"], ate: corte, campoData: "dataTransacao" })
  ).filter((s) => !s.saldo.isZero());

  const classificacoes = await tx.contaNaVirada.findMany({
    select: {
      destino: true,
      justificativa: true,
      criadoPor: true,
      conta: { select: { codigo: true } },
    },
  });
  const porCodigo = new Map(classificacoes.map((c) => [c.conta.codigo, c]));

  const contas = await tx.contaPcasp.findMany({
    where: { codigo: { in: saldos.map((s) => s.codigo) } },
    select: { id: true, codigo: true, nome: true, analitica: true },
  });
  const metaPorCodigo = new Map(contas.map((c) => [c.codigo, c]));

  let somaDebito = toMoney("0.00");
  let somaCredito = toMoney("0.00");

  const linhas: ContaDaVirada[] = [];
  for (const s of [...saldos].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    const meta = metaPorCodigo.get(s.codigo);
    const classificada = porCodigo.get(s.codigo);
    const perna = pernaQueZera(s.naturezaSaldo, s.saldo);
    // ⚠️ SÓ O QUE ENCERRA ENTRA NA SOMA. A conta que transfere não recebe partida nenhuma — somá-la
    // faria a conferência de fechamento acusar um desequilíbrio que o lançamento não terá.
    if (classificada?.destino === "ENCERRA") {
      const v = toMoney(s.saldo.abs());
      if (perna === "DEBITO") somaDebito = toMoney(somaDebito.plus(v));
      else somaCredito = toMoney(somaCredito.plus(v));
    }
    linhas.push({
      contaId: meta?.id ?? "",
      codigo: s.codigo,
      nome: meta?.nome ?? s.codigo,
      naturezaSaldo: s.naturezaSaldo,
      saldo: s.saldo,
      pernaSeEncerrar: perna,
      destino: classificada?.destino ?? null,
      justificativa: classificada?.justificativa ?? null,
      classificadoPor: classificada?.criadoPor ?? null,
      sugestao: destinoSugerido(s.codigo),
      analitica: meta?.analitica ?? false,
    });
  }

  return {
    ano: p.ano,
    corte,
    exercicioId: exercicio?.id ?? null,
    exercicioEncerrado: exercicio?.encerramento !== null && exercicio !== null,
    contas: linhas,
    somaDebito,
    somaCredito,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O ATO — classificar
// ═══════════════════════════════════════════════════════════════════════════

export const zClassificarContaNaViradaInput = z.object({
  /** O CÓDIGO da conta, e não o id: é o código que o operador lê e o que o plano publica. */
  contaCodigo: z.string().trim().min(1),
  destino: z.enum(["ENCERRA", "TRANSFERE"]),
  justificativa: z
    .string()
    .trim()
    .min(
      15,
      "A justificativa do destino da conta na virada precisa de ao menos 15 caracteres — quem " +
        "auditar em 2030 vai perguntar por que a dotação morreu e o resto a pagar não"
    ),
  criadoPor: z.string().min(1),
});
export type ClassificarContaNaViradaInput = z.input<typeof zClassificarContaNaViradaInput>;

/**
 * CLASSIFICA uma conta de controle para a virada — ou RECLASSIFICA uma já classificada.
 *
 * ⚠️ RECLASSIFICAR TROCA `destino` E `justificativa`, E NADA MAIS. `contaId` fica fora do grant do
 * papel de runtime (ver `prisma/papel-runtime.ts`): apontar a classificação para outra conta faria a
 * justificativa escrita para a dotação passar a explicar o destino do controle de restos a pagar.
 *
 * ⚠️ E A RECLASSIFICAÇÃO VALE PARA A PRÓXIMA VIRADA, nunca para uma já feita. O que escritura é o
 * LANÇAMENTO de encerramento — append-only, com estorno próprio. Trocar a classificação depois de
 * encerrar não desfaz nada: para desfazer, estorna-se o encerramento.
 *
 * ⚠️ RECUSA CONTA FORA DAS CLASSES 5 E 6 e RECUSA CONTA SINTÉTICA. A segunda o encerramento também
 * recusa, e a duplicação é deliberada: recusar no cadastro diz ao operador qual analítica escolher,
 * enquanto recusar só no ato o faria descobrir em 31 de dezembro, no dia em que não há tempo.
 */
export async function classificarContaNaVirada(
  prisma: PrismaClient,
  input: ClassificarContaNaViradaInput
): Promise<{
  readonly contaId: string;
  readonly codigo: string;
  readonly destino: DestinoDaConta;
  readonly reclassificada: boolean;
}> {
  const d = zClassificarContaNaViradaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.classificarContaNaVirada, "ENTE");

    const conta = await tx.contaPcasp.findUnique({
      where: { codigo: d.contaCodigo },
      select: { id: true, codigo: true, nome: true, analitica: true },
    });
    if (conta === null) {
      throw new Error(
        `A conta ${d.contaCodigo} não existe no plano de contas. O destino na virada se declara ` +
          `para uma conta do plano — o sistema não cria conta. Nada foi gravado.`
      );
    }
    const classe = conta.codigo.slice(0, 1);
    if (classe !== "5" && classe !== "6") {
      throw new Error(
        `A conta ${conta.codigo} é da classe ${classe}, e o destino na virada só existe para as ` +
          `classes 5 e 6 (os controles orçamentários). As classes 3 e 4 são zeradas pela APURAÇÃO ` +
          `DO RESULTADO, contra o patrimônio líquido, e as classes 1 e 2 atravessam a virada por ` +
          `natureza — saldo de banco e dívida não morrem em 31 de dezembro. Nada foi gravado.`
      );
    }
    if (!conta.analitica) {
      const sob = await tx.contaPcasp.findMany({
        where: { codigo: { startsWith: conta.codigo.slice(0, 5) }, analitica: true },
        orderBy: { codigo: "asc" },
        take: 8,
        select: { codigo: true },
      });
      throw new Error(
        `A conta ${conta.codigo} é SINTÉTICA e conta sintética não recebe partida: o encerramento ` +
          `recusaria o lançamento. Classifique a analítica` +
          (sob.length > 0 ? ` — por exemplo ${sob.map((c) => c.codigo).join(", ")}` : "") +
          `. Nada foi gravado.`
      );
    }

    const ja = await tx.contaNaVirada.findUnique({
      where: { contaId: conta.id },
      select: { id: true, destino: true },
    });
    if (ja === null) {
      await tx.contaNaVirada.create({
        data: {
          contaId: conta.id,
          destino: d.destino,
          justificativa: d.justificativa,
          criadoPor: d.criadoPor,
        },
      });
      return { contaId: conta.id, codigo: conta.codigo, destino: d.destino, reclassificada: false };
    }

    await tx.contaNaVirada.update({
      where: { contaId: conta.id },
      data: { destino: d.destino, justificativa: d.justificativa },
    });
    return { contaId: conta.id, codigo: conta.codigo, destino: d.destino, reclassificada: true };
  });
}
