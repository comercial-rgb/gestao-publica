import { diaCivil } from "../../packages/datas/index.js";
import { conferirLimiteDaLoa } from "./limite-de-suplementacao.js";
import { toPercentual } from "../../packages/contracts/index.js";
import { criarAutorizacaoPortPrisma } from "../m16-travamento/porta.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { travar } from "../../packages/locks/index.js";
import { idsUuid } from "../m01-core-contabil/adapter-prisma.js";
import { calcularSaldos } from "../m05-despesa/dominio.js";
import {
  garantirDotacaoInicial,
  recalcularCache,
  totaisPorTipo,
  travarFichas,
  type Tx,
} from "../m05-despesa/adapter-prisma.js";
import { exigirExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { registrarMovimentoDotacao } from "../m05-despesa/dotacao-razao.js";
import {
  classificarAbertura,
  exigirAberturaDoDecreto,
  type TipoDeCreditoAdicional,
} from "./abertura-do-credito.js";
import { ehRecursoNovo, type OrigemRecurso } from "./dominio.js";
import type {
  AnularCreditoParams,
  CreditoRepositoryPort,
  DeclararDisponibilidadeParams,
  DecretoParaPersistir,
  DecretoResumo,
  DisponibilidadeDeclarada,
  EncerrarDecretoParams,
  ExecutarCreditoParams,
  LeiParaPersistir,
  M03Deps,
  PortasDoRecursoNovo,
} from "./ports.js";

/**
 * ADAPTERS do M03 — a única camada que conhece Prisma.
 *
 * REUSA o mecanismo de saldo do M05 (`garantirDotacaoInicial`, `totaisPorTipo`,
 * `recalcularCache`): nada de aritmética de saldo reimplementada aqui. Cada item
 * de crédito vira um `MovimentoDotacao`, e o cache da ficha é RECALCULADO por
 * SUM — nunca incrementado.
 */

export interface ItemBruto {
  readonly id: string;
  readonly tipo: "SUPLEMENTACAO" | "ANULACAO";
  readonly valor: { toFixed(n: number): string };
  readonly estornoDeId: string | null;
}

/**
 * ⚠️⚠️ A SUPLEMENTAÇÃO LÍQUIDA — E AQUI MORAVA UM BUG DE VERDADE.
 *
 * As duas somas do M03 (`consumido`, do teto da lei, e `usadoDaDisponibilidade`, da
 * fonte) filtravam `tipo: "SUPLEMENTACAO"` **no SQL**. Só que o item de ESTORNO nasce
 * com o tipo **INVERTIDO** (`anularCredito`: uma SUPLEMENTACAO anulada vira um item
 * `ANULACAO` apontando para ela) — então o estorno **NÃO VOLTAVA DA QUERY**, o
 * conjunto `estornados` saía VAZIO, e o item original continuava somando.
 *
 * Consequência, e ela é grave: **ANULAR UM DECRETO NUNCA DEVOLVEU NADA.** O teto da
 * lei ficava consumido para sempre (uma lei de 20.000 com um decreto de 20.000
 * anulado não autorizava mais um centavo), e a disponibilidade da fonte também. O
 * dinheiro era gasto de uma vez, e a anulação só mexia na ficha. Nenhum teste pegava
 * porque nenhum somava o teto DEPOIS de uma anulação — os testes de anulação
 * conferiam os saldos das fichas, e esses estavam certos.
 *
 * A cura é filtrar pelo tipo do ALVO, não pelo tipo da linha: entra o original que é
 * SUPLEMENTACAO, e entra o estorno **de** uma SUPLEMENTACAO (seja qual for o tipo
 * dele). Aí o `packages/estornaveis` — a soma única, abaixo de todos — faz o resto.
 */
/**
 * ⚠️ EXPORTADA (V11 V3.1) para a CONSULTA do superávit. A consulta mostra o mesmo
 * "utilizado" que o guard subtrai; recalculá-lo lá criaria a segunda verdade que este
 * comentário inteiro existe para impedir.
 */
export function suplementacaoLiquida(itens: readonly ItemBruto[]): Money {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const relevantes = itens.filter((i) =>
    i.estornoDeId === null
      ? i.tipo === "SUPLEMENTACAO"
      : porId.get(i.estornoDeId)?.tipo === "SUPLEMENTACAO"
  );

  return somaLiquidaEstornaveis(
    relevantes.map((i) => ({
      id: i.id,
      valor: toMoney(i.valor.toFixed(2)),
      estornoDeId: i.estornoDeId,
    }))
  );
}

const SELECT_ITEM = {
  id: true,
  tipo: true,
  valor: true,
  estornoDeId: true,
} as const;

/** Quanto a lei já teve consumido por decretos vivos. SUM real, LÍQUIDO. */
async function consumido(tx: Tx, leiId: string): Promise<Money> {
  return suplementacaoLiquida(
    await tx.itemCredito.findMany({
      where: { decreto: { leiId } },
      select: SELECT_ITEM,
    })
  );
}

/**
 * Quanto de uma disponibilidade de recurso novo já foi usado. SUM real, LÍQUIDO — a
 * ANULAÇÃO do decreto devolve o valor à fonte por DERIVAÇÃO (o item de estorno cancela
 * o original; nenhum dos dois soma).
 *
 * ⚠️ E ELA É POR EXERCÍCIO — ISSO ERA UM FURO. Até aqui a soma varria os itens de
 * TODOS os anos, e a busca da disponibilidade era um `findFirst` sem `exercicio`,
 * embora a chave da tabela seja `[exercicio, fonteId, origem]`. Com duas
 * disponibilidades declaradas (2026 e 2027), o guard comparava o crédito de um ano
 * contra a declaração de OUTRO — e o uso de 2026 consumia o superávit de 2027. O
 * superávit é uma foto do encerramento de UM exercício; ele não atravessa anos.
 */
/**
 * A CHAVE DO LOCK DA DISPONIBILIDADE — estável entre versões.
 *
 * ⚠️ ELA NÃO PODE SER O `id` DA LINHA (V11 V7.3). Enquanto havia uma linha só por fonte, travar
 * o `id` equivalia a travar a fonte. Com a declaração versionada, cada versão tem `id` próprio:
 * uma transação que leu a versão 2 e outra que acabou de criar a versão 3 travariam postes
 * DIFERENTES e não se veriam — o lock continuaria existindo e deixaria de proteger, que é o pior
 * modo de falha de um lock.
 */
export function chaveDaDisponibilidade(
  exercicio: number,
  fonteId: string,
  origem: string
): string {
  return `${exercicio}:${fonteId}:${origem}`;
}

/** A declaração VIGENTE — a de maior versão. `null` quando a fonte nunca foi declarada. */
export async function disponibilidadeVigente(
  tx: Tx,
  exercicio: number,
  fonteId: string,
  origem: string
): Promise<{ readonly id: string; readonly versao: number; readonly valor: Money; readonly descricao: string } | null> {
  const linha = await tx.disponibilidadeRecursoNovo.findFirst({
    where: { exercicio, fonteId, origem: origem as never },
    orderBy: { versao: "desc" },
    select: { id: true, versao: true, valor: true, descricao: true },
  });
  if (linha === null) return null;
  return {
    id: linha.id,
    versao: linha.versao,
    valor: toMoney(linha.valor.toFixed(2)),
    descricao: linha.descricao,
  };
}

export async function usadoDaDisponibilidade(
  tx: Tx,
  fonteId: string,
  origem: string,
  exercicio: number
): Promise<Money> {
  return suplementacaoLiquida(
    await tx.itemCredito.findMany({
      where: {
        fonteId,
        decreto: { origemRecurso: origem as never, ano: exercicio },
      },
      select: SELECT_ITEM,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AS AMARRAÇÕES DO RECURSO NOVO (TR 4.37)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ QUAL AMARRAÇÃO CADA ORIGEM TEM — Record EXAUSTIVO, e é ele o guard de verdade.
 *
 * Uma origem nova no enum NÃO COMPILA até alguém dizer contra o que ela é conferida.
 * Sem isto, o valor novo cairia num `if` que ninguém escreveu e passaria batido: o
 * recurso entraria no orçamento sem lastro nenhum, silenciosamente. `"DECLARADA"` é
 * uma decisão, não um esquecimento — e ela está escrita.
 */
const AMARRACAO_DA_ORIGEM: Record<
  OrigemRecurso,
  "NAO_SE_APLICA" | "SUPERAVIT" | "EXCESSO" | "OPERACAO_CREDITO"
> = {
  /** Não é recurso novo: tira de outra ficha, e o guard é o saldo dela. */
  ANULACAO: "NAO_SE_APLICA",
  SUPERAVIT_FINANCEIRO: "SUPERAVIT",
  EXCESSO_ARRECADACAO: "EXCESSO",
  OPERACAO_CREDITO: "OPERACAO_CREDITO",
};

interface ContextoDaAmarracao {
  readonly origem: OrigemRecurso;
  readonly decretoId: string;
  readonly exercicio: number;
  /** A data do FATO (a do decreto) — o corte de tudo que se soma aqui. */
  readonly dataDoFato: Date;
  readonly fonteId: string;
  readonly declarado: Money;
  readonly usado: Money;
  readonly pedido: Money;
}

/**
 * FAIL-OPEN, E BARULHENTO — o único log do sistema (não há logger no repositório).
 *
 * `null` = NÃO HÁ RESPOSTA: o port não foi ligado, ou o dado de que ele depende não
 * existe (o exercício anterior não foi encerrado; a fonte não tem previsão
 * cadastrada). Barrar aqui paralisaria o ente por uma falta que não é dele — e o art.
 * 43 não proíbe o crédito, proíbe o crédito SEM LASTRO. Mas passar em silêncio é como
 * o sistema chegou até aqui: a disponibilidade declarada e ninguém a conferindo.
 */
function semAmarracao(c: ContextoDaAmarracao, motivo: string): void {
  console.warn(
    JSON.stringify({
      evento: "RECURSO_NOVO_SEM_AMARRACAO",
      modulo: "m03-creditos",
      tr: "4.37",
      origem: c.origem,
      decretoId: c.decretoId,
      exercicio: c.exercicio,
      fonteId: c.fonteId,
      declarado: c.declarado.toFixed(2),
      solicitado: c.pedido.toFixed(2),
      motivo,
    })
  );
}

/**
 * O guard, escrito UMA vez: `usado + pedido <= derivado`. O que muda entre as três
 * origens é DE ONDE vem o `derivado` — e só isso.
 */
function exigirCabe(
  c: ContextoDaAmarracao,
  derivado: Money,
  comoFoiDerivado: string
): void {
  const total = toMoney(c.usado.plus(c.pedido));
  if (!total.greaterThan(derivado)) return;

  throw new Error(
    `${c.origem} INSUFICIENTE na fonte ${c.fonteId}: os FATOS dão ` +
      `${derivado.toFixed(2)} (${comoFoiDerivado}), já foram usados ` +
      `${c.usado.toFixed(2)} em créditos de ${c.exercicio}, e este decreto pede mais ` +
      `${c.pedido.toFixed(2)} (total ${total.toFixed(2)}). A disponibilidade ` +
      `DECLARADA é ${c.declarado.toFixed(2)} — se ela é maior que o derivado, é ELA ` +
      `que está errada: o recurso novo não é o que se digita, é o que existe. Abrir ` +
      `este crédito seria autorizar despesa contra um dinheiro que não entrou ` +
      `(art. 43 da Lei 4.320/64).`
  );
}

async function amarrar(
  tx: Tx,
  portas: PortasDoRecursoNovo,
  c: ContextoDaAmarracao
): Promise<void> {
  const qual = AMARRACAO_DA_ORIGEM[c.origem];

  if (qual === "NAO_SE_APLICA") return;

  if (qual === "SUPERAVIT") {
    if (portas.superavit === undefined) return semAmarracao(c, PORT_DESLIGADO);
    const anterior = c.exercicio - 1;
    const derivado = await portas.superavit.superavitDaFonte(
      tx,
      c.fonteId,
      anterior
    );
    if (derivado === null) {
      return semAmarracao(
        c,
        `Exercício ${anterior} não foi ENCERRADO — o superávit financeiro por fonte ` +
          `não tem corte contra o que ser conferido. Abrir crédito por superávit ` +
          `ANTES de encerrar o exercício que o produziu é exatamente o que este log ` +
          `denuncia.`
      );
    }
    return exigirCabe(
      c,
      derivado,
      `superávit da fonte no encerramento de ${anterior} — receita, pagamento, ` +
        `retenção e restos`
    );
  }

  if (qual === "EXCESSO") {
    if (portas.excesso === undefined) return semAmarracao(c, PORT_DESLIGADO);
    const derivado = await portas.excesso.excessoDaFonte(
      tx,
      c.fonteId,
      c.exercicio,
      c.dataDoFato
    );
    if (derivado === null) {
      return semAmarracao(
        c,
        `A fonte não tem RECEITA PREVISTA cadastrada no exercício ${c.exercicio} — e ` +
          `sem previsão não existe "excesso": o excesso é o que passou DELA. Isto não ` +
          `é excesso zero (arrecadar menos do que se previu é uma resposta, e ela ` +
          `barra); é dado AUSENTE. Cadastre a previsão da fonte na LOA.`
      );
    }
    return exigirCabe(
      c,
      derivado,
      `arrecadado LÍQUIDO da fonte até ${diaCivil(c.dataDoFato)} ` +
        `MENOS a previsão atualizada dela — o REALIZADO, sem tendência (art. 43 § 3º)`
    );
  }

  // OPERACAO_CREDITO — e o TypeScript já sabe que não sobrou mais nada.
  if (portas.operacaoCredito === undefined) return semAmarracao(c, PORT_DESLIGADO);
  const derivado = await portas.operacaoCredito.arrecadadoOperacaoCredito(
    tx,
    c.fonteId,
    c.dataDoFato
  );
  if (derivado === null) return semAmarracao(c, PORT_DESLIGADO);
  return exigirCabe(
    c,
    derivado,
    `arrecadado LÍQUIDO da fonte com natureza de ORIGEM "operações de crédito" (2º ` +
      `dígito) até ${diaCivil(c.dataDoFato)} — o que ENTROU do ` +
      `empréstimo, não o que o contrato promete`
  );
}

const PORT_DESLIGADO =
  "O port da amarração não está ligado neste wiring — a disponibilidade segue " +
  "DECLARADA e não conferida contra os fatos.";

/**
 * O DECRETO de crédito adicional, na transação de quem chama (V36: a efetivação da prévia cria o decreto e executa o
 * crédito num ato só). O `criarDecreto` do repositório a chama com o client.
 */
export async function criarDecretoNaTransacao(tx: Tx, d: DecretoParaPersistir): Promise<string> {
  // ═══ ⚠️ ABERTO OU REABERTO — A GUARDA DA CF ART. 167 § 2º (V11 V8.6) ═══
  //
  // Fecha `CREDITO-ESPECIAL-ABERTO-OU-REABERTO`. A pendência dizia que faltava um FATO; o
  // fato existia — o decreto aponta para a lei, e cada um tem o seu ano —, faltava LER a
  // diferença. E ler é melhor que perguntar: uma caixa de seleção entre "aberto" e "reaberto"
  // é uma escolha que se erra, e o erro vai direto para o balancete do TCE.
  //
  // ⚠️ AQUI, E NÃO NO `executarCredito`: um decreto ilegal não deve NASCER. Deixá-lo nascer e
  // recusar só na execução criaria um documento que o ente vê na tela, cita em ofício, e que
  // nunca vai poder ser executado.
  const lei = await tx.leiCredito.findUnique({
    where: { id: d.leiId },
    select: { ano: true, tipoCredito: true, dataPublicacao: true, numero: true },
  });
  if (lei === null) {
    throw new Error(`Lei de crédito ${d.leiId} não existe. Nada foi gravado.`);
  }
  const classificacao = classificarAbertura({
    tipoCredito: lei.tipoCredito as TipoDeCreditoAdicional,
    leiAno: lei.ano,
    leiDataPublicacao: lei.dataPublicacao,
    decretoAno: d.ano,
  });
  if (classificacao.recusa !== null) {
    throw new Error(
      `Decreto ${d.numero}/${d.ano} contra a lei ${lei.numero}/${lei.ano}: ${classificacao.recusa}`
    );
  }

  const criado = await tx.decretoCredito.create({
    data: {
      id: d.id,
      leiId: d.leiId,
      numero: d.numero,
      ano: d.ano,
      data: d.data,
      origemRecurso: d.origemRecurso,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });

  return criado.id;
}

/**
 * @param portas M02/M04/M12 — OPCIONAIS. Ausentes = a disponibilidade segue DECLARADA
 * e não conferida (fail-open com log). Ver `PortasDoRecursoNovo`.
 */
export function criarCreditoRepositoryPrisma(
  prisma: PrismaClient,
  portas: PortasDoRecursoNovo = {}
): CreditoRepositoryPort {
  return {
    async criarLei(lei: LeiParaPersistir): Promise<string> {
      const criada = await prisma.leiCredito.create({
        data: {
          id: lei.id,
          numero: lei.numero,
          ano: lei.ano,
          tipoCredito: lei.tipoCredito,
          valorAutorizado: lei.valorAutorizado.toFixed(2),
          percentualLimite: lei.percentualLimite ?? null,
          dataPublicacao: lei.dataPublicacao,
          criadoPor: lei.criadoPor,
        },
        select: { id: true },
      });
      return criada.id;
    },

    async criarDecreto(d: DecretoParaPersistir): Promise<string> {
      return criarDecretoNaTransacao(prisma, d);
    },

    async executarCredito(p: ExecutarCreditoParams): Promise<readonly string[]> {
      return prisma.$transaction(async (tx) => {
        // V36 — a trava da prévia de alteração orçamentária, antes das fichas (ver o port).
        if (p.antesDeTravar !== undefined) await p.antesDeTravar(tx);
        // ⚠️ A ANULAÇÃO DE DOTAÇÃO CONSOME DISPONÍVEL (o guard "não se anula o que
        // já foi empenhado" soma o razão e decide) — logo tem a MESMA corrida do
        // empenho. E um decreto toca VÁRIAS fichas: `travarFichas` as ordena por id
        // para que dois decretos com as mesmas fichas nunca se abracem (deadlock).
        await travarFichas(
          tx,
          p.itens.map((i) => i.fichaId)
        );

        // V36 — a efetivação da prévia: desbloqueio, decreto e desfecho, nesta transação (ver o port).
        if (p.preparar !== undefined) await p.preparar(tx);

        const decreto = await tx.decretoCredito.findUniqueOrThrow({
          where: { id: p.decretoId },
          select: {
            id: true,
            leiId: true,
            ano: true,
            // ⚠️ A DATA DO FATO — é ela que corta o arrecadado (nunca o `criadoEm`).
            // Um decreto de março não se lastreia na receita que entrou em setembro.
            data: true,
            origemRecurso: true,
            encerramento: { select: { id: true } },
            // ⚠️ O TIPO DE CRÉDITO VEM DA LEI, e ele decide a CONTA (V11 V7.1). O PCASP parte
            // `5.2.2.1.2 DOTAÇÃO ADICIONAL POR TIPO DE CREDITO` em suplementar, especial e
            // extraordinário; sem carregá-lo até o movimento, o razão não sabe em qual entrar.
            // ⚠️ E O ANO E A PUBLICAÇÃO DA LEI VÊM JUNTO (V11 V8.8): é deles, contra o ano do
            // DECRETO, que sai ABERTO ou REABERTO — a dimensão que o plano parte em contas
            // diferentes. Derivada aqui, e não gravada, pelo mesmo motivo do tipo de crédito.
            lei: { select: { numero: true, valorAutorizado: true, percentualLimite: true, tipoCredito: true, ano: true, dataPublicacao: true } },
          },
        });
        if (decreto.encerramento !== null) {
          throw new Error(`Decreto ${p.decretoId} está ENCERRADO.`);
        }

        const fichaIds = [...new Set(p.itens.map((i) => i.fichaId))];
        const fichas = await tx.fichaOrcamentaria.findMany({
          where: { id: { in: fichaIds } },
          select: { id: true, numero: true, fonteId: true, exercicio: true },
        });
        if (fichas.length !== fichaIds.length) {
          throw new Error(`Ficha(s) inexistente(s) no crédito.`);
        }
        const fichaPorId = new Map(fichas.map((f) => [f.id, f]));

        // M08 — fail-closed: nenhuma ficha do decreto pode estar em exercício
        // encerrado. Suplementar um exercício fechado seria reabrir o orçamento
        // de um ano já prestado ao TCE.
        for (const ficha of fichas) {
          await exigirExercicioAberto(
            tx,
            ficha.exercicio,
            `crédito adicional na ficha ${ficha.numero}`
          );
        }

        // A fonte declarada na perna TEM de ser a fonte da ficha. Sem isto,
        // alguém declara fonte 500 numa ficha de fonte 540 e o balanceamento
        // "por fonte" (TR 5.111) passa a checar uma ficção.
        for (const item of p.itens) {
          const ficha = fichaPorId.get(item.fichaId)!;
          if (ficha.fonteId !== item.fonteId) {
            throw new Error(
              `Fonte do item (${item.fonteId}) diverge da fonte da ficha ` +
                `${ficha.numero} (${ficha.fonteId}).`
            );
          }
        }

        // TR 4.30 — o decreto não pode ultrapassar o teto RESTANTE da lei.
        const suplementado = p.itens
          .filter((i) => i.tipo === "SUPLEMENTACAO")
          .reduce((acc, i) => toMoney(acc.plus(i.valor)), toMoney("0.00"));

        const jaConsumido = await consumido(tx, decreto.leiId);
        const teto = toMoney(decreto.lei.valorAutorizado.toFixed(2));
        const restante = toMoney(teto.minus(jaConsumido));

        if (suplementado.greaterThan(restante)) {
          throw new Error(
            `SUPLEMENTAÇÃO ACIMA DO TETO DA LEI: (${suplementado.toFixed(2)}) excede o saldo ` +
              `da lei: autorizado ${teto.toFixed(2)}, já consumido ` +
              `${jaConsumido.toFixed(2)}, restante ${restante.toFixed(2)}.`
          );
        }

        // V35 — o limite PERCENTUAL da LOA (Lei 4.320, art. 7º, I), além do teto em reais. Ver limite-de-suplementacao.ts.
        if (decreto.lei.tipoCredito === "SUPLEMENTAR" && decreto.lei.percentualLimite !== null) {
          await conferirLimiteDaLoa(tx, {
            leiId: decreto.leiId,
            leiNumero: decreto.lei.numero,
            exercicio: decreto.ano,
            percentual: toPercentual(decreto.lei.percentualLimite.toFixed(6)),
            itens: p.itens.map((i) => ({ fonteId: i.fonteId, tipo: i.tipo, valor: toMoney(i.valor) })),
          });
        }

        // Recurso NOVO: valida contra a disponibilidade declarada da fonte — e,
        // quando a origem é SUPERÁVIT FINANCEIRO, também contra o superávit DERIVADO
        // DOS FATOS no encerramento do exercício anterior (TR 4.37/4.39).
        if (ehRecursoNovo(decreto.origemRecurso)) {
          const porFonte = new Map<string, Money>();
          for (const i of p.itens) {
            porFonte.set(
              i.fonteId,
              toMoney((porFonte.get(i.fonteId) ?? toMoney("0.00")).plus(i.valor))
            );
          }
          for (const [fonteId, valor] of porFonte) {
            // ⚠️ A VIGENTE É A DE MAIOR VERSÃO (V11 V7.3). Era um `findUnique` porque havia uma
            // linha só; agora as antigas permanecem, e ler qualquer uma delas conferiria o
            // decreto contra um número que já foi substituído.
            const disp = await disponibilidadeVigente(
              tx,
              decreto.ano,
              fonteId,
              decreto.origemRecurso
            );
            if (disp === null) {
              throw new Error(
                `Sem disponibilidade declarada de ${decreto.origemRecurso} para ` +
                  `a fonte ${fonteId} no exercício ${decreto.ano}. Um crédito por ` +
                  `recurso novo não pode sair do nada — declare a disponibilidade ` +
                  `apurada primeiro.`
              );
            }

            // ⚠️ O LOCK VEM ANTES DA SOMA. Sem ele, dois decretos concorrentes sobre a
            // MESMA fonte leem `usado` no mesmo estado, os dois passam, e a fonte
            // estoura — a corrida da ficha (6fa5d4e) de novo, num degrau acima. E o
            // `travarFichas` NÃO cobre isto: dois decretos podem suplementar fichas
            // DIFERENTES da mesma fonte e nunca se cruzar.
            // ⚠️ A CHAVE DO LOCK É A DA FONTE, NÃO A DA LINHA — ver `chaveDaDisponibilidade`.
            // Travar `disp.id` deixou de proteger no instante em que a declaração ganhou
            // versões: quem declara cria uma linha NOVA, com id novo, e os dois lados travariam
            // postes diferentes.
            await travar(tx, "DisponibilidadeRecursoNovo", [
              chaveDaDisponibilidade(decreto.ano, fonteId, decreto.origemRecurso),
            ]);

            const declarado = disp.valor;
            const usado = await usadoDaDisponibilidade(
              tx,
              fonteId,
              decreto.origemRecurso,
              decreto.ano
            );
            const sobra = toMoney(declarado.minus(usado));
            if (valor.greaterThan(sobra)) {
              throw new Error(
                `Crédito por ${decreto.origemRecurso} excede a disponibilidade da ` +
                  `fonte ${fonteId}: declarado ${declarado.toFixed(2)}, já usado ` +
                  `${usado.toFixed(2)}, restante ${sobra.toFixed(2)}, solicitado ` +
                  `${valor.toFixed(2)}.`
              );
            }

            // ═══ A AMARRAÇÃO — o declarado contra o DERIVADO (TR 4.37) ═══
            //
            // Até cf765b0, a disponibilidade era DECLARADA e ninguém a conferia: um
            // zero a mais na digitação virava crédito adicional sem lastro, e o
            // orçamento crescia contra um dinheiro que nunca existiu (art. 43 § 1º).
            //
            // O guard compara sempre contra o DERIVADO DOS FATOS, nunca contra o
            // declarado — e é por isso que ele pega os DOIS erros: a INFLAÇÃO
            // (declararam 20.000 onde os fatos dão 10.000) e a REDUÇÃO (o derivado
            // CAIU depois, e o que já se usou não cabe mais). Um guard contra o
            // declarado conferiria a declaração contra ela mesma.
            await amarrar(tx, portas, {
              origem: decreto.origemRecurso,
              decretoId: p.decretoId,
              exercicio: decreto.ano,
              dataDoFato: decreto.data,
              fonteId,
              declarado,
              usado,
              pedido: valor,
            });
          }
        }

        // INVARIANTE 3 — não se anula o que já foi empenhado. SUM real.
        for (const item of p.itens) {
          if (item.tipo !== "ANULACAO") continue;
          await garantirDotacaoInicial(tx, item.fichaId, p.criadoPor);
          // ⚠️ CORRENTE: o guard pergunta se há saldo para anular AGORA. Cortado por
          // competência, ele ignoraria empenhos posteriores e deixaria anular o que já
          // foi gasto.
          const saldos = calcularSaldos(
            await totaisPorTipo(tx, item.fichaId, { eixo: "CORRENTE" })
          );
          if (item.valor.greaterThan(saldos.disponivel)) {
            const ficha = fichaPorId.get(item.fichaId)!;
            throw new Error(
              `Não há saldo para anular na ficha ${ficha.numero}: disponível ` +
                `${saldos.disponivel.toFixed(2)}, anulação pedida ` +
                `${item.valor.toFixed(2)}. Não se anula o que já foi empenhado.`
            );
          }
        }

        // ⚠️ ABERTO OU REABERTO, UMA VEZ PARA O DECRETO INTEIRO (V11 V8.8). É do decreto, não do
        // item: todos os itens executam o MESMO ato, e classificá-los em separado abriria a porta
        // para dois itens do mesmo decreto caírem em contas diferentes.
        //
        // ⚠️ E ELA RECUSA. Um decreto ilegal não NASCE desde a V8.6, mas os que nasceram antes
        // daquela guarda continuam no banco — executá-los seria escriturar crédito sem autorização
        // vigente. `null` aqui é o SUPLEMENTAR, que não se parte.
        const abertura = exigirAberturaDoDecreto({
          tipoCredito: decreto.lei.tipoCredito as TipoDeCreditoAdicional,
          leiAno: decreto.lei.ano,
          leiDataPublicacao: decreto.lei.dataPublicacao,
          decretoAno: decreto.ano,
        });

        // Grava tudo. Cada item -> um MovimentoDotacao.
        const ids: string[] = [];
        for (const item of p.itens) {
          await garantirDotacaoInicial(tx, item.fichaId, p.criadoPor);

          // ⚠️ O MOVIMENTO **E A PERNA NO RAZÃO**, na MESMA transação. O crédito adicional
          // é dinheiro NOVO no orçamento: sem perna, o razão diria que o ente autorizou
          // uma despesa que a LOA não previu e ninguém suplementou. Ver `dotacao-razao.ts`.
          const mov = await registrarMovimentoDotacao(tx, {
            fichaId: item.fichaId,
            tipo:
              item.tipo === "SUPLEMENTACAO"
                ? "CREDITO_ADICIONAL"
                : "ANULACAO_CREDITO",
            // ⚠️ SÓ NA PERNA DE SUPLEMENTAÇÃO. A anulação reduz a dotação de outra ficha e
            // no plano não mora em `5.2.2.1.2`; mandar o tipo de crédito nela faria o
            // `registrarMovimentoDotacao` recusar — de propósito, porque a classificação da
            // anulação é outra pendência (ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS).
            ...(item.tipo === "SUPLEMENTACAO"
              ? { tipoCredito: decreto.lei.tipoCredito }
              : {}),
            // A abertura acompanha o tipo de crédito, e só existe onde ele se parte.
            ...(item.tipo === "SUPLEMENTACAO" && abertura !== null ? { abertura } : {}),
            // ⚠️ A ORIGEM DO RECURSO VAI JUNTO (V11 V8.9), e só o eixo POR FONTE a lê. Mandá-la
            // sempre custa nada e evita o pior dos mundos: o dia em que o ente troca de eixo, o
            // crédito adicional pararia de lançar por falta de um dado que o decreto sempre teve.
            ...(item.tipo === "SUPLEMENTACAO" ? { origemDoRecurso: decreto.origemRecurso } : {}),
            valor: item.valor.toFixed(2),
            origemTipo: "CREDITO_ADICIONAL",
            origemId: p.decretoId,
            criadoPor: p.criadoPor,
            // A data do FATO é a do DECRETO — não a da digitação.
            data: decreto.data,
            historico: `Crédito adicional — decreto ${p.decretoId}`,
          });

          const criado = await tx.itemCredito.create({
            data: {
              id: item.itemId,
              decretoId: p.decretoId,
              fichaId: item.fichaId,
              tipo: item.tipo,
              valor: item.valor.toFixed(2),
              fonteId: item.fonteId,
              movimentoDotacaoId: mov.movimentoId,
              criadoPor: p.criadoPor,
            },
            select: { id: true },
          });
          ids.push(criado.id);
        }

        // INVARIANTE 4 — cache recalculado por SUM em TODA ficha tocada.
        for (const fichaId of fichaIds) {
          await recalcularCache(tx, fichaId);
        }

        return ids;
      });
    },

    async anularCredito(p: AnularCreditoParams): Promise<readonly string[]> {
      return prisma.$transaction(async (tx) => {
        // ⚠️ O TIPO DE CRÉDITO DO DECRETO — e ele é lido AQUI, do decreto que se anula, não
        // inferido (V11 V7.1). O estorno de uma ANULAÇÃO volta a ser um CREDITO_ADICIONAL, e
        // esse crédito entra na MESMA conta em que o original entrou: a do tipo da lei.
        // Reabrir a conta por outro caminho faria o estorno lançar num lugar e o fato
        // original noutro, e o par não fecharia no balancete.
        const decreto = await tx.decretoCredito.findUniqueOrThrow({
          where: { id: p.decretoId },
          select: {
            ano: true,
            origemRecurso: true,
            lei: { select: { tipoCredito: true, ano: true, dataPublicacao: true } },
          },
        });

        // ⚠️ A MESMA ABERTURA DO ORIGINAL, E PELO MESMO CAMINHO. O estorno de uma ANULAÇÃO volta a
        // ser um CREDITO_ADICIONAL, e ele tem de voltar para a conta EXATA de onde o fato saiu —
        // um reaberto estornado na conta do aberto deixaria as duas contas erradas ao mesmo tempo,
        // e o par não fecharia no balancete. Derivar de novo devolve o mesmo valor porque as duas
        // datas são as mesmas; guardar a conclusão em outro lugar é que criaria divergência.
        const abertura = exigirAberturaDoDecreto({
          tipoCredito: decreto.lei.tipoCredito as TipoDeCreditoAdicional,
          leiAno: decreto.lei.ano,
          leiDataPublicacao: decreto.lei.dataPublicacao,
          decretoAno: decreto.ano,
        });

        const itens = await tx.itemCredito.findMany({
          where: { decretoId: p.decretoId, estornoDeId: null },
          select: {
            id: true,
            fichaId: true,
            tipo: true,
            valor: true,
            fonteId: true,
            estornos: { select: { id: true } },
          },
        });

        // Anular uma SUPLEMENTACAO tira saldo de volta — e o guard soma o razão
        // para ver se ele ainda está lá. Mesma corrida, mesmo lock, mesma ordem.
        await travarFichas(
          tx,
          itens.map((i) => i.fichaId)
        );

        const vivos = itens.filter((i) => i.estornos.length === 0);
        if (vivos.length === 0) {
          throw new Error(`Decreto ${p.decretoId} não tem item vivo.`);
        }

        const ids: string[] = [];
        const fichasTocadas = new Set<string>();

        for (const [i, item] of vivos.entries()) {
          // Anular uma SUPLEMENTACAO tira o saldo de volta — e isso pode faltar
          // se a ficha já empenhou. Fail-closed.
          if (item.tipo === "SUPLEMENTACAO") {
            // ⚠️ CORRENTE — mesmo motivo do guard acima.
            const saldos = calcularSaldos(
              await totaisPorTipo(tx, item.fichaId, { eixo: "CORRENTE" })
            );
            const valor = toMoney(item.valor.toFixed(2));
            if (valor.greaterThan(saldos.disponivel)) {
              throw new Error(
                `Não dá para anular a suplementação: a ficha já usou o crédito. ` +
                  `Disponível ${saldos.disponivel.toFixed(2)}, suplementação ` +
                  `${valor.toFixed(2)}.`
              );
            }
          }

          // Movimento INVERSO: o que era CREDITO_ADICIONAL vira ANULACAO_CREDITO.
          // ⚠️ E A PERNA DO RAZÃO É INVERTIDA JUNTO, no MESMO commit — cada item com o
          // SEU valor. Um estorno que recarimbasse um valor único desfaria errado o que
          // o decreto fez certo (a lição do `resolverPartidas` do M08).
          const mov = await registrarMovimentoDotacao(tx, {
            fichaId: item.fichaId,
            tipo:
              item.tipo === "SUPLEMENTACAO"
                ? "ANULACAO_CREDITO"
                : "CREDITO_ADICIONAL",
            // O INVERSO do de cima: aqui é a perna de ANULAÇÃO que vira crédito adicional.
            ...(item.tipo === "ANULACAO"
              ? { tipoCredito: decreto.lei.tipoCredito }
              : {}),
            ...(item.tipo === "ANULACAO" && abertura !== null ? { abertura } : {}),
            ...(item.tipo === "ANULACAO" ? { origemDoRecurso: decreto.origemRecurso } : {}),
            valor: item.valor.toFixed(2),
            origemTipo: "CREDITO_ANULADO",
            origemId: p.decretoId,
            estornoDeId: item.id,
            criadoPor: p.criadoPor,
            data: p.data,
            historico: `Anulação do decreto ${p.decretoId}`,
          });

          const estorno = await tx.itemCredito.create({
            data: {
              id: p.idsEstorno[i]!,
              decretoId: p.decretoId,
              fichaId: item.fichaId,
              // tipo INVERTIDO
              tipo: item.tipo === "SUPLEMENTACAO" ? "ANULACAO" : "SUPLEMENTACAO",
              valor: item.valor,
              fonteId: item.fonteId,
              movimentoDotacaoId: mov.movimentoId,
              estornoDeId: item.id,
              criadoPor: p.criadoPor,
            },
            select: { id: true },
          });
          ids.push(estorno.id);
          fichasTocadas.add(item.fichaId);
        }

        for (const fichaId of fichasTocadas) {
          await recalcularCache(tx, fichaId);
        }

        return ids;
      });
    },

    async encerrarDecreto(p: EncerrarDecretoParams): Promise<string> {
      const enc = await prisma.decretoEncerramento.create({
        data: {
          decretoId: p.decretoId,
          data: p.data,
          motivo: p.motivo,
          criadoPor: p.criadoPor,
        },
        select: { id: true },
      });
      return enc.id;
    },

    async buscarDecreto(id: string): Promise<DecretoResumo | null> {
      const d = await prisma.decretoCredito.findUnique({
        where: { id },
        select: {
          id: true,
          leiId: true,
          numero: true,
          origemRecurso: true,
          encerramento: { select: { id: true } },
          itens: {
            select: {
              id: true,
              fichaId: true,
              tipo: true,
              valor: true,
              fonteId: true,
              estornoDeId: true,
              estornos: { select: { id: true } },
            },
          },
        },
      });
      if (d === null) return null;

      return {
        id: d.id,
        leiId: d.leiId,
        numero: d.numero,
        origemRecurso: d.origemRecurso,
        // DERIVADO da existência do fato — não é coluna.
        encerrado: d.encerramento !== null,
        itensVivos: d.itens
          .filter((i) => i.estornoDeId === null && i.estornos.length === 0)
          .map((i) => ({
            id: i.id,
            fichaId: i.fichaId,
            tipo: i.tipo,
            valor: toMoney(i.valor.toFixed(2)),
            fonteId: i.fonteId,
          })),
      };
    },

    async consumidoDaLei(leiId: string): Promise<Money> {
      return consumido(prisma, leiId);
    },

    async declararDisponibilidade(
      p: DeclararDisponibilidadeParams
    ): Promise<DisponibilidadeDeclarada> {
      return prisma.$transaction(async (tx) => {
        // ⚠️ O MESMO LOCK QUE O CRÉDITO TOMA, NA MESMA CHAVE. Sem ele, um decreto em voo lê a
        // versão antiga, esta transação grava uma menor, e os dois commitam: o decreto fica
        // apoiado em recurso que a declaração vigente já nega. A chave é
        // `exercicio:fonteId:origem` — estável entre versões, ao contrário do `id` da linha.
        await travar(tx, "DisponibilidadeRecursoNovo", [
          chaveDaDisponibilidade(p.exercicio, p.fonteId, p.origem),
        ]);

        const fonte = await tx.fonteRecurso.findUnique({
          where: { id: p.fonteId },
          select: { codigo: true },
        });
        if (fonte === null) {
          throw new Error(`Fonte ${p.fonteId} não existe. Nada foi declarado.`);
        }

        const vigente = await disponibilidadeVigente(tx, p.exercicio, p.fonteId, p.origem);

        // ⚠️ O QUE JÁ FOI USADO É O PISO, E ELE É SUM REAL. Declarar abaixo dele deixaria, no
        // mesmo instante, decretos VIVOS apoiados em recurso que a declaração nega. O guard do
        // crédito pega isso no PRÓXIMO decreto; aqui ele é pego na hora, que é quando alguém
        // ainda pode corrigir o número ou anular o decreto.
        const utilizado = await usadoDaDisponibilidade(tx, p.fonteId, p.origem, p.exercicio);
        if (p.valor.lessThan(utilizado)) {
          throw new Error(
            `A disponibilidade declarada (${p.valor.toFixed(2)}) é MENOR do que o que a fonte ` +
              `${fonte.codigo} já suplementou por ${p.origem} em ${p.exercicio} ` +
              `(${utilizado.toFixed(2)}). Gravar assim deixaria decreto vivo apoiado em recurso ` +
              `que esta própria declaração nega. Anule os decretos que sobram, ou declare pelo ` +
              `menos o que já foi usado. Nada foi declarado.`
          );
        }

        // ═══ ⚠️ O TETO DOS FATOS, NA HORA DE DECLARAR (V11 V8.10) ═══
        //
        // `SUPERAVIT-DECLARADO-NAO-DERIVADO`: o número era DIGITADO com uma explicação, e quem o
        // conferia contra os fatos era só o guard do crédito — depois, quando alguém já tinha
        // escrito lei e decreto contra ele. Declarar acima do apurado nunca serviu para nada; só
        // adiava a recusa para o pior momento.
        //
        // ⚠️ SÓ O SUPERÁVIT, e isso é deliberado. O superávit é uma FOTO: 31/12 do exercício
        // encerrado, e depois disso ele só muda se um fato daquele ano for lançado. O EXCESSO de
        // arrecadação e a OPERAÇÃO DE CRÉDITO crescem ao longo do exercício — recusar uma
        // declaração de março por não caber no arrecadado de março barraria uma declaração que
        // fica verdadeira em abril. Nesses dois, quem confere continua sendo o guard do crédito,
        // na DATA DO FATO, que é o instante certo.
        //
        // ⚠️ `null` DO PORT NÃO É ZERO: é "o exercício anterior não foi encerrado, não há foto".
        // Recusar aí impediria o ente de declarar antes de encerrar — e o crédito já é barrado
        // pelo guard nesse caso, com o motivo.
        if (p.origem === "SUPERAVIT_FINANCEIRO" && portas.superavit !== undefined) {
          const anterior = p.exercicio - 1;
          const apurado = await portas.superavit.superavitDaFonte(tx, p.fonteId, anterior);
          if (apurado !== null && p.valor.greaterThan(apurado)) {
            throw new Error(
              `A disponibilidade declarada (${p.valor.toFixed(2)}) é MAIOR do que o superávit ` +
                `financeiro que os FATOS do exercício ${anterior} dão para a fonte ${fonte.codigo} ` +
                `(${apurado.toFixed(2)}) — uma diferença de ` +
                `${toMoney(p.valor.minus(apurado)).toFixed(2)}. O recurso novo não é o que se ` +
                `digita, é o que existe (art. 43 da Lei 4.320/64): o apurado sai de receita, ` +
                `pagamento, retenção e restos no encerramento de ${anterior}, a MESMA conta que o ` +
                `Anexo 14 publica. Declare no máximo o apurado, ou lance em ${anterior} o fato que ` +
                `está faltando. Nada foi declarado.`
            );
          }
        }

        // Repetição não duplica: redeclarar EXATAMENTE o mesmo número, com a mesma explicação,
        // não é um fato novo — e uma versão a mais sem diferença nenhuma só suja o histórico
        // que esta tabela existe para preservar.
        if (
          vigente !== null &&
          vigente.valor.equals(p.valor) &&
          vigente.descricao === p.descricao
        ) {
          throw new Error(
            `A disponibilidade da fonte ${fonte.codigo} por ${p.origem} em ${p.exercicio} JÁ ` +
              `está declarada nesse valor (${p.valor.toFixed(2)}), com a mesma explicação, na ` +
              `versão ${vigente.versao}. Nada foi declarado.`
          );
        }

        const versao = vigente === null ? 1 : vigente.versao + 1;
        const criada = await tx.disponibilidadeRecursoNovo.create({
          data: {
            exercicio: p.exercicio,
            fonteId: p.fonteId,
            origem: p.origem,
            valor: p.valor.toFixed(2),
            descricao: p.descricao,
            versao,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        return {
          id: criada.id,
          versao,
          anterior: vigente === null ? null : vigente.valor,
          utilizado,
        };
      });
    },
  };
}

export function criarM03Deps(
  prisma: PrismaClient,
  portas: PortasDoRecursoNovo = {}
): M03Deps {
  return {
    autz: criarAutorizacaoPortPrisma(prisma),
    creditos: criarCreditoRepositoryPrisma(prisma, portas),
    ids: idsUuid,
  };
}
