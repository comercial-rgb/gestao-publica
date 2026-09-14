import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { empenhar } from "../m05-despesa/servico.js";
import { elementoDebitaEstoque, roteiroEmpenho } from "../m01-core-contabil/roteiros.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { zCompetencia } from "./dominio.js";

/**
 * ═══ M33 — A APROPRIAÇÃO CONTÁBIL DA FOLHA (V6 P2.3b; TR 5.12.71/72) ═══
 *
 * A folha FECHADA vira despesa: os PROVENTOS de cada contracheque, agrupados pelo GRUPO DE
 * EMPENHO (quais rubricas, em qual ficha), geram empenhos pelo M05 — com o roteiro contábil de
 * sempre, o saldo da ficha travado e conferido na transação, o exercício conferido e a fila do
 * art. 141 alimentada. Nada aqui reimplementa despesa: o ato é o `empenhar` do M05.
 *
 * ⚠️ SÓ O BRUTO. Contribuição e imposto retidos do servidor NÃO são despesa orçamentária — são
 * retenções que viajam no PAGAMENTO. Empenhá-los duplicaria a despesa e inflaria o empenhado do
 * ente pela metade do líquido de cada servidor.
 *
 * ⚠️ A NUMERAÇÃO É DETERMINÍSTICA — e é ela que dá IDEMPOTÊNCIA. O número do empenho é
 * `<série>/<competência>/<matrícula ou código do grupo>`, e o `@@unique([fichaId, numero])` do
 * M05 faz a segunda tentativa bater na constraint. Reexecutar a apropriação CONTINUA de onde
 * parou em vez de duplicar a despesa.
 *
 * ⚠️ E ELA NÃO É ATÔMICA ENTRE EMPENHOS, por medida e não por descuido: `deps.despesa.empenhar`
 * abre a PRÓPRIA transação no adapter do M05 (é lá que a ficha é travada), e uma transação única
 * para mil empenhos manteria as fichas do ente travadas por minutos. Cada empenho é um fato; a
 * apropriação que parar por falta de saldo DIZ em qual ficha e em qual matrícula parou, e
 * continuar é reexecutá-la.
 */

export class FolhaNaoFechadaError extends Error {
  constructor(competencia: string) {
    super(
      `FOLHA-NAO-FECHADA: a folha de ${competencia} ainda não foi fechada. Só o cálculo congelado pelo fechamento vira ` +
        `despesa — apropriar um cálculo que ainda pode ser cancelado empenharia um valor que a competência pode mudar. Nada foi gravado.`
    );
    this.name = "FolhaNaoFechadaError";
  }
}

export class SemGrupoDeEmpenhoError extends Error {
  constructor(rubricas: readonly string[]) {
    super(
      `RUBRICA-SEM-GRUPO-DE-EMPENHO: ${rubricas.join(", ")} — ${rubricas.length === 1 ? "esta rubrica de provento não está" : "estas rubricas de provento não estão"} ` +
        `em nenhum grupo de empenho, e por isso ${rubricas.length === 1 ? "não teria" : "não teriam"} ficha onde empenhar. Apropriar assim empenharia MENOS do que a folha paga. ` +
        `Inclua-${rubricas.length === 1 ? "a" : "as"} num grupo antes. Nada foi gravado.`
    );
    this.name = "SemGrupoDeEmpenhoError";
  }
}

export class ApropriacaoInterrompidaError extends Error {
  constructor(
    readonly feitos: number,
    readonly ondeParou: string,
    readonly motivo: string
  ) {
    super(
      `APROPRIACAO-INTERROMPIDA: ${feitos} empenho(s) já gravado(s), e a apropriação parou em ${ondeParou}. Motivo: ${motivo} ` +
        `Os empenhos gravados CONTINUAM válidos (cada um é um fato); resolva a causa e apropriar de novo continua de onde parou — ` +
        `a numeração é determinística e não duplica.`
    );
    this.name = "ApropriacaoInterrompidaError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// O CADASTRO DO GRUPO
// ═══════════════════════════════════════════════════════════════════════════════

export const zCadastrarGrupoDeEmpenhoInput = z
  .object({
    codigo: z.string().trim().min(1).max(20),
    descricao: z.string().trim().min(3),
    fichaId: z.string().min(1),
    categoriaOrdemCronologica: z.enum(["FORNECIMENTO_BENS", "LOCACAO", "PRESTACAO_SERVICOS", "REALIZACAO_OBRAS"]),
    tipoEmpenho: z.enum(["ORDINARIO", "GLOBAL", "ESTIMATIVO"]),
    serie: z.string().trim().regex(/^[A-Z0-9-]{1,10}$/, "série em maiúsculas, dígitos ou hífen (até 10)"),
    porServidor: z.boolean(),
    credorId: z.string().min(1).optional(),
    /**
     * V6.1 — AS DUAS CONTAS PATRIMONIAIS DA LIQUIDAÇÃO, obrigatórias no CADASTRO (a coluna é
     * nullable só para não inventar conta nos grupos já gravados). A VPD que a liquidação debita
     * e a obrigação de pessoal que ela credita são decisão do contador do ente — o rol
     * elemento→conta do M01 não cobre a folha, e a VPD dele é de serviços de terceiros.
     */
    contaVariacaoId: z.string().min(1),
    contaObrigacaoId: z.string().min(1),
    rubricaIds: z.array(z.string().min(1)).min(1, "o grupo empenha ao menos uma rubrica"),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (!v.porServidor && v.credorId === undefined) {
      ctx.addIssue({ code: "custom", path: ["credorId"], message: "O empenho ÚNICO do grupo precisa de um credor declarado — no empenho por servidor o credor é o CPF de cada um." });
    }
    if (v.porServidor && v.credorId !== undefined) {
      ctx.addIssue({ code: "custom", path: ["credorId"], message: "No empenho POR SERVIDOR o credor é o CPF de cada servidor; um credor declarado aqui seria ignorado, e ignorar em silêncio é pior do que recusar." });
    }
  });
export type CadastrarGrupoDeEmpenhoInput = z.input<typeof zCadastrarGrupoDeEmpenhoInput>;

export async function cadastrarGrupoDeEmpenhoDaFolha(prisma: PrismaClient, input: CadastrarGrupoDeEmpenhoInput): Promise<{ readonly grupoId: string }> {
  const d = zCadastrarGrupoDeEmpenhoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarGrupoDeEmpenhoDaFolha, "ENTE");

    if ((await tx.grupoDeEmpenhoDaFolha.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) !== null) {
      throw new Error(`GRUPO-REPETIDO: já existe grupo de empenho com o código ${d.codigo}. Nada foi gravado.`);
    }
    const ficha = await tx.fichaOrcamentaria.findUnique({
      where: { id: d.fichaId },
      select: { id: true, numero: true, naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } } },
    });
    if (ficha === null) throw new Error(`Ficha orçamentária ${d.fichaId} não existe. Nada foi gravado.`);
    // ⚠️ O GANCHO DE ESTOQUE NÃO PODE DISPARAR EM FOLHA, e a hora de impedir é AQUI — não na
    // liquidação, quando metade dos empenhos já existe. O M05 exige entrada no almoxarifado para
    // todo elemento que DEBITA ESTOQUE; um grupo de folha apontado para uma ficha de material
    // empenharia normalmente e travaria na liquidação, com uma mensagem sobre almoxarifado que
    // não explica nada a quem cadastrou o grupo.
    if (elementoDebitaEstoque(ficha.naturezaDespesa.codElemento)) {
      throw new Error(
        `FICHA-DE-MATERIAL-NO-GRUPO-DA-FOLHA: a ficha ${ficha.numero} é do elemento ` +
          `${ficha.naturezaDespesa.codElemento} (${ficha.naturezaDespesa.codigoCompleto}), que debita ESTOQUE — material de ` +
          `consumo, não remuneração. A liquidação dessa despesa exige entrada no almoxarifado, que a folha não tem. ` +
          `Aponte o grupo para uma ficha de pessoal. Nada foi gravado.`
      );
    }
    for (const [campo, id] of [["contaVariacaoId", d.contaVariacaoId], ["contaObrigacaoId", d.contaObrigacaoId]] as const) {
      if ((await tx.contaPcasp.findUnique({ where: { id }, select: { id: true } })) === null) {
        throw new Error(`Conta do plano ${id} (${campo}) não existe. Nada foi gravado.`);
      }
    }
    if (d.credorId !== undefined && (await tx.pessoa.findUnique({ where: { id: d.credorId }, select: { id: true } })) === null) {
      throw new Error(`Credor ${d.credorId} não existe no cadastro de pessoas. Nada foi gravado.`);
    }

    const rubricas = await tx.rubrica.findMany({ where: { id: { in: d.rubricaIds } }, select: { id: true, codigo: true, tipo: true, grupoDeEmpenho: { select: { grupo: { select: { codigo: true } } } } } });
    if (rubricas.length !== d.rubricaIds.length) throw new Error("Rubrica inexistente entre as informadas. Nada foi gravado.");
    // ⚠️ SÓ PROVENTO SE EMPENHA: o desconto é retenção do pagamento, e empenhá-lo duplicaria a
    // despesa. Recusar aqui é mais barato que descobrir no empenhado do ente.
    const descontos = rubricas.filter((r) => r.tipo !== "PROVENTO");
    if (descontos.length > 0) {
      throw new Error(
        `RUBRICA-DE-DESCONTO-NO-GRUPO: ${descontos.map((r) => r.codigo).join(", ")} — desconto não é despesa orçamentária, é retenção do pagamento. ` +
          `Empenhá-lo somaria à despesa do ente um valor que ele nunca gastou. Nada foi gravado.`
      );
    }
    const jaEmOutro = rubricas.filter((r) => r.grupoDeEmpenho !== null);
    if (jaEmOutro.length > 0) {
      throw new Error(
        `RUBRICA-JA-EM-OUTRO-GRUPO: ${jaEmOutro.map((r) => `${r.codigo} (no grupo ${r.grupoDeEmpenho?.grupo.codigo ?? "?"})`).join(", ")}. ` +
          `Uma rubrica empenha numa ficha só — em duas, a mesma verba viraria despesa duas vezes. Nada foi gravado.`
      );
    }

    const g = await tx.grupoDeEmpenhoDaFolha.create({
      data: {
        codigo: d.codigo, descricao: d.descricao, fichaId: d.fichaId,
        categoriaOrdemCronologica: d.categoriaOrdemCronologica, tipoEmpenho: d.tipoEmpenho,
        serie: d.serie, porServidor: d.porServidor, credorId: d.credorId ?? null, criadoPor: d.criadoPor,
        contaVariacaoId: d.contaVariacaoId, contaObrigacaoId: d.contaObrigacaoId,
        rubricas: { create: d.rubricaIds.map((rubricaId) => ({ rubricaId, criadoPor: d.criadoPor })) },
      },
      select: { id: true },
    });
    return { grupoId: g.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// O ATO — a folha fechada vira despesa
// ═══════════════════════════════════════════════════════════════════════════════

export const zApropriarFolhaInput = z.object({
  folhaId: z.string().min(1),
  /** A data dos empenhos; precisa cair no exercício ABERTO da ficha (o M05 confere). */
  dataDoEmpenho: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type ApropriarFolhaInput = z.input<typeof zApropriarFolhaInput>;

export interface ResultadoDaApropriacao {
  readonly apropriacaoId: string;
  readonly competencia: string;
  /** Empenhos gravados NESTA execução. */
  readonly empenhados: number;
  /** Já existiam (execução anterior): a numeração determinística os reconheceu. */
  readonly jaExistiam: number;
  readonly total: Money;
  readonly porGrupo: readonly { readonly codigo: string; readonly ficha: number; readonly empenhos: number; readonly valor: Money }[];
}

/** O grupo, tal como a apropriação e a certificação o leem. */
export interface GrupoParaApropriacao {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly serie: string;
  readonly porServidor: boolean;
  readonly tipoEmpenho: "ORDINARIO" | "GLOBAL" | "ESTIMATIVO";
  readonly categoriaOrdemCronologica: "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
  readonly fichaId: string;
  readonly ficha: { readonly numero: number };
  readonly credor: { readonly documento: string } | null;
  readonly contaVariacao: { readonly codigo: string } | null;
  readonly contaObrigacao: { readonly codigo: string } | null;
  readonly rubricas: readonly { readonly rubricaId: string }[];
}

/** O número do empenho da folha — determinístico, e é o que impede a duplicação. */
export function numeroDoEmpenhoDaFolha(serie: string, competencia: string, sufixo: string): string {
  return `${serie}/${competencia}/${sufixo}`;
}

/**
 * AS PARCELAS QUE UM CÁLCULO GERA — quem empenha o quê, em qual ficha, por quem.
 *
 * ⚠️ EXTRAÍDA PARA SER A ÚNICA VERDADE. A certificação (V6.1) precisa mostrar ao atestador as
 * "alocações a conferir" — e se ela reconstruísse o agrupamento por conta própria, o atesto
 * poderia descrever uma distribuição e a apropriação empenhar outra, sem que nada quebrasse.
 * Quem chama a aplica: `apropriarFolha` empenha parcela a parcela; a certificação soma por grupo.
 */
export interface ParcelaDaFolha {
  readonly grupo: GrupoParaApropriacao;
  readonly vinculoId: string | null;
  readonly matricula: string | null;
  readonly credorCpfCnpj: string;
  valor: Money;
}

export interface ParcelasDoCalculo {
  readonly parcelas: readonly ParcelaDaFolha[];
  /** Rubricas de provento que nenhum grupo empenha — a folha pagaria mais do que o ente empenhou. */
  readonly rubricasSemGrupo: readonly string[];
  /** Quantas linhas de provento o cálculo tem (zero significa cálculo sem provento nenhum). */
  readonly linhasDeProvento: number;
}

export async function parcelasDoCalculo(prisma: PrismaClient, calculoId: string): Promise<ParcelasDoCalculo> {
  const grupos = await prisma.grupoDeEmpenhoDaFolha.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true, codigo: true, descricao: true, serie: true, porServidor: true, tipoEmpenho: true, categoriaOrdemCronologica: true,
      fichaId: true, ficha: { select: { numero: true } },
      credor: { select: { documento: true } },
      contaVariacao: { select: { codigo: true } },
      contaObrigacao: { select: { codigo: true } },
      rubricas: { select: { rubricaId: true } },
    },
  });
  const grupoDaRubrica = new Map<string, GrupoParaApropriacao>();
  for (const g of grupos) for (const r of g.rubricas) grupoDaRubrica.set(r.rubricaId, g);

  const linhas = await prisma.linhaDoContracheque.findMany({
    where: { contracheque: { calculoId }, tipo: "PROVENTO" },
    select: {
      valor: true, rubricaId: true, rubrica: { select: { codigo: true } },
      contracheque: { select: { vinculoId: true, vinculo: { select: { matricula: true, servidor: { select: { pessoa: { select: { documento: true } } } } } } } },
    },
  });

  const rubricasSemGrupo = [...new Set(linhas.filter((l) => !grupoDaRubrica.has(l.rubricaId)).map((l) => l.rubrica.codigo))].sort();

  const porChave = new Map<string, ParcelaDaFolha>();
  for (const l of linhas) {
    const g = grupoDaRubrica.get(l.rubricaId);
    if (g === undefined) continue;
    const chave = g.porServidor ? `${g.id}::${l.contracheque.vinculoId}` : g.id;
    const credor = g.porServidor ? l.contracheque.vinculo.servidor.pessoa.documento : (g.credor?.documento ?? "");
    const atual = porChave.get(chave);
    if (atual === undefined) {
      porChave.set(chave, {
        grupo: g,
        vinculoId: g.porServidor ? l.contracheque.vinculoId : null,
        matricula: g.porServidor ? l.contracheque.vinculo.matricula : null,
        credorCpfCnpj: credor,
        valor: toMoney(l.valor),
      });
    } else {
      atual.valor = toMoney(atual.valor.plus(toMoney(l.valor)));
    }
  }

  // ⚠️ A PARCELA ZERADA NÃO É PARCELA, e o filtro fica AQUI — não no laço do empenho.
  // Achado do teste do atesto: com o filtro só na apropriação, o manifesto do atestador listava
  // uma alocação ("grupo X, 1 empenho, 0.00") que a apropriação nunca empenhava. O atesto
  // descrevia uma distribuição e a despesa fazia outra — exatamente o que a função única existe
  // para impedir. Uma rubrica pode zerar por dias trabalhados, por lançamento cessado ou por
  // gratificação não devida naquela competência; empenho de 0,00 não é fato.
  const parcelas = [...porChave.values()]
    .filter((p) => p.valor.gt(0))
    .sort((a, b) => a.grupo.codigo.localeCompare(b.grupo.codigo) || (a.matricula ?? "").localeCompare(b.matricula ?? ""));
  return { parcelas, rubricasSemGrupo, linhasDeProvento: linhas.length };
}

export async function apropriarFolha(prisma: PrismaClient, input: ApropriarFolhaInput): Promise<ResultadoDaApropriacao> {
  const d = zApropriarFolhaInput.parse(input);

  const folha = await prisma.folhaDePagamento.findUnique({
    where: { id: d.folhaId },
    select: { id: true, competencia: true, tipo: true, fechamento: { select: { calculoId: true } }, apropriacao: { select: { id: true } } },
  });
  if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
  zCompetencia.parse(folha.competencia);
  if (folha.fechamento === null) throw new FolhaNaoFechadaError(folha.competencia);

  // A autorização do ATO (a do EMPENHO é exigida de novo, por empenho, dentro do M05).
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apropriarFolha, "ENTE");
  });

  const agrupamento = await parcelasDoCalculo(prisma, folha.fechamento.calculoId);
  if (agrupamento.linhasDeProvento === 0) throw new Error(`FOLHA-SEM-PROVENTO: o cálculo fechado de ${folha.competencia} não tem linha de provento nenhuma. Nada foi gravado.`);
  if (agrupamento.rubricasSemGrupo.length > 0) throw new SemGrupoDeEmpenhoError(agrupamento.rubricasSemGrupo);

  const apropriacaoId =
    folha.apropriacao?.id ??
    (await prisma.apropriacaoDaFolha.create({ data: { folhaId: folha.id, dataDoEmpenho: d.dataDoEmpenho, criadoPor: d.criadoPor }, select: { id: true } })).id;

  const deps = criarM05DepsComContratos(prisma);
  const roteiro = roteiroEmpenho();
  let empenhados = 0;
  let jaExistiam = 0;
  const porGrupo = new Map<string, { codigo: string; ficha: number; empenhos: number; valor: Money }>();

  for (const p of agrupamento.parcelas) {
    const sufixo = p.matricula ?? p.grupo.codigo;
    const numero = numeroDoEmpenhoDaFolha(p.grupo.serie, folha.competencia, sufixo);
    const onde = `${p.grupo.codigo} / ${sufixo}`;

    const ja = await prisma.empenho.findUnique({ where: { fichaId_numero: { fichaId: p.grupo.fichaId, numero } }, select: { id: true } });
    if (ja !== null) {
      jaExistiam += 1;
    } else {
      if (p.credorCpfCnpj === "") throw new ApropriacaoInterrompidaError(empenhados, onde, "o grupo não tem credor e não empenha por servidor — o cadastro do grupo está incoerente.");
      try {
        const r = await empenhar(
          {
            fichaId: p.grupo.fichaId,
            numero,
            tipo: p.grupo.tipoEmpenho,
            valor: p.valor.toFixed(2),
            data: d.dataDoEmpenho,
            credorCpfCnpj: p.credorCpfCnpj,
            categoriaOrdemCronologica: p.grupo.categoriaOrdemCronologica,
            historico:
              `Folha ${folha.tipo.toLowerCase()} de ${folha.competencia} — ${p.grupo.descricao}` +
              (p.matricula === null ? "" : `, matrícula ${p.matricula}`) +
              ` (apropriação de ${diaCivil(d.dataDoEmpenho)}).`,
            criadoPor: d.criadoPor,
          },
          roteiro,
          deps
        );
        await prisma.empenhoDaFolha.create({
          data: { apropriacaoId, grupoId: p.grupo.id, vinculoId: p.vinculoId, empenhoId: r.empenhoId, valor: p.valor.toFixed(2), criadoPor: d.criadoPor },
        });
        empenhados += 1;
      } catch (e) {
        throw new ApropriacaoInterrompidaError(empenhados, onde, e instanceof Error ? e.message : String(e));
      }
    }
    const acc = porGrupo.get(p.grupo.codigo) ?? { codigo: p.grupo.codigo, ficha: p.grupo.ficha.numero, empenhos: 0, valor: toMoney(0) };
    acc.empenhos += 1;
    acc.valor = toMoney(acc.valor.plus(p.valor));
    porGrupo.set(p.grupo.codigo, acc);
  }

  return {
    apropriacaoId,
    competencia: folha.competencia,
    empenhados,
    jaExistiam,
    total: sumMoney([...porGrupo.values()].map((g) => g.valor)),
    porGrupo: [...porGrupo.values()],
  };
}

/** O que o detalhe da folha mostra sobre a apropriação — derivado, nunca coluna. */
export interface ApropriacaoLida {
  readonly dataDoEmpenho: Date;
  readonly criadoPor: string;
  readonly criadoEm: Date;
  readonly empenhos: readonly {
    readonly numero: string;
    readonly ficha: number;
    readonly grupo: string;
    readonly matricula: string | null;
    readonly credor: string;
    readonly valor: Money;
    readonly empenhoId: string;
  }[];
  readonly total: Money;
}

export async function apropriacaoDaFolha(prisma: PrismaClient, folhaId: string): Promise<ApropriacaoLida | null> {
  const a = await prisma.apropriacaoDaFolha.findUnique({
    where: { folhaId },
    select: {
      dataDoEmpenho: true, criadoPor: true, criadoEm: true,
      empenhos: {
        orderBy: [{ grupo: { codigo: "asc" } }, { criadoEm: "asc" }],
        select: {
          valor: true, empenhoId: true,
          grupo: { select: { codigo: true, descricao: true } },
          vinculo: { select: { matricula: true } },
          empenho: { select: { numero: true, credorCpfCnpj: true, ficha: { select: { numero: true } } } },
        },
      },
    },
  });
  if (a === null) return null;
  return {
    dataDoEmpenho: a.dataDoEmpenho,
    criadoPor: a.criadoPor,
    criadoEm: a.criadoEm,
    empenhos: a.empenhos.map((e) => ({
      numero: e.empenho.numero, ficha: e.empenho.ficha.numero, grupo: `${e.grupo.codigo} — ${e.grupo.descricao}`,
      matricula: e.vinculo?.matricula ?? null, credor: e.empenho.credorCpfCnpj, valor: toMoney(e.valor), empenhoId: e.empenhoId,
    })),
    total: sumMoney(a.empenhos.map((e) => toMoney(e.valor))),
  };
}

export { Decimal };
