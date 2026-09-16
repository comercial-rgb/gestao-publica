import { Decimal, toMoney, serializar } from "../../packages/contracts/index.js";
import { diaCivilBr, fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { tipoDeDocumento } from "../../packages/documento/index.js";
import { cliente, PortaSemBancoError } from "./cliente";

export { PortaSemBancoError };

/**
 * ═══ A CONSULTA PÚBLICA DE DESPESAS (V9 N2, família Despesas) ═══
 *
 * ⚠️ UMA LINHA POR EMPENHO, E ESSE É O ASSUNTO DESTE ARQUIVO. Empenho, liquidação e pagamento não
 * são três despesas: são três ESTÁGIOS da mesma. O erro clássico de portal de transparência é
 * listar os três lado a lado e deixar o leitor somar — e o total fica até três vezes maior que a
 * despesa real. Aqui a linha é o empenho, e os estágios são COLUNAS dele.
 *
 * ⚠️ E OS VALORES SÃO LÍQUIDOS, com o original ao lado. Anulação total e anulação PARCIAL são
 * coisas diferentes no M05 (a parcial reduz o fato, não o zera), e `packages/estornaveis` é quem
 * sabe somar as duas. Publicar o valor bruto faria o portal mostrar despesa que foi desfeita;
 * publicar só o líquido esconderia que houve anulação. Vão os dois, e a diferença é a terceira
 * coluna.
 *
 * ⚠️ O CREDOR PESSOA FÍSICA VAI COM O CPF MASCARADO. O CNPJ de uma empresa contratada pelo poder
 * público é informação pública e vai inteiro; o CPF de uma pessoa física, não — é dado pessoal, e
 * a prática dos portais brasileiros (e o bom senso da LGPD) é publicar o nome com o documento
 * parcialmente oculto. Quem precisa do número completo obtém por pedido de acesso à informação,
 * que é um caminho com identificação e registro.
 */

/** O contrato público. Ver o cabeçalho e o teste de negação. */
export const CAMPOS_PUBLICOS_DA_DESPESA = [
  "id",
  "numero",
  "data",
  "exercicio",
  "unidade",
  "funcao",
  "naturezaDespesa",
  "fonte",
  "credorNome",
  "credorDocumento",
  "historico",
  "contrato",
  "empenhado",
  "empenhadoOriginal",
  "anulado",
  "liquidado",
  "pago",
  "fase",
] as const;

export const CAMPOS_NUNCA_PUBLICOS_DA_DESPESA = [
  // O documento COMPLETO de pessoa física. O campo público é `credorDocumento`, já mascarado.
  "credorCpfCnpj",
  // Identificadores internos e a conta bancária de onde o dinheiro saiu.
  "fichaId",
  "lancamentoId",
  "contaBancaria",
  "criadoPor",
] as const;

export interface DespesaPublicaNaLista {
  readonly id: string;
  readonly numero: string;
  readonly data: string;
  readonly exercicio: number;
  readonly unidade: string;
  readonly funcao: string;
  readonly naturezaDespesa: string;
  readonly fonte: string;
  readonly credorNome: string;
  /** CNPJ inteiro; CPF mascarado. Nunca o número cru de pessoa física. */
  readonly credorDocumento: string;
  readonly historico: string;
  readonly contrato: string | null;
  /** Strings decimais do domínio — quem formata é a tela. */
  readonly empenhado: string;
  readonly empenhadoOriginal: string;
  readonly anulado: string;
  readonly liquidado: string;
  readonly pago: string;
  /** Até onde a despesa chegou: o estágio, não uma soma. */
  readonly fase: "Empenhada" | "Liquidada" | "Paga" | "Anulada";
}

export interface FiltrosDasDespesasPublicas {
  readonly q?: string;
  readonly exercicio?: string;
  readonly unidade?: string;
  readonly fase?: string;
  readonly de?: string;
  readonly ate?: string;
  readonly ordem?: "data" | "valor" | "numero";
  readonly direcao?: "asc" | "desc";
  readonly pagina?: number;
  readonly porPagina?: number;
}

export interface PaginaDeDespesasPublicas {
  readonly linhas: readonly DespesaPublicaNaLista[];
  readonly total: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly paginas: number;
  readonly exerciciosDisponiveis: readonly number[];
  readonly unidadesDisponiveis: readonly { readonly valor: string; readonly rotulo: string }[];
  /**
   * ⚠️ OS TOTAIS SÃO DO RECORTE INTEIRO, não da página — e são TRÊS NÚMEROS SEPARADOS, nunca um
   * "total da despesa" que some os estágios.
   *
   * ⚠️ E ELES PODEM SER `null`, DE PROPÓSITO. Calcular o líquido de anulações totais e parciais
   * exige carregar a cadeia de cada empenho; acima de `TETO_DOS_TOTAIS` isso é um recorte que não
   * carrega — e a página de um município com dezenas de milhares de empenhos ficaria em branco.
   * Acima do teto os totais vêm ausentes COM O MOTIVO, em vez de virem errados ou de a página
   * morrer: um número ausente e explicado é honesto; um número parcial apresentado como total, não.
   */
  readonly totais: { readonly empenhado: string; readonly liquidado: string; readonly pago: string } | null;
  /** Por que os totais não vieram, quando não vieram. */
  readonly totaisAusentes: string | null;
}

export const PADRAO_POR_PAGINA_DESPESA = 25;

/**
 * Acima disto, os totais do recorte não são calculados. Medido pelo custo: cada empenho traz a
 * cadeia de liquidações e pagamentos com os respectivos estornos e anulações parciais.
 */
export const TETO_DOS_TOTAIS = 2000;

/**
 * O DOCUMENTO DO CREDOR PARA O PÚBLICO. CNPJ inteiro (é público); CPF com só os seis dígitos do
 * meio à vista, que é a forma usada pelos portais brasileiros.
 */
export function documentoPublicavelDoCredor(bruto: string): string {
  const d = (bruto ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (tipoDeDocumento(d) === "CNPJ" || d.length > 11) {
    return d.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  }
  if (d.length !== 11) return "não informado";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

interface LinhaDaCadeia {
  readonly id: string;
  readonly valor: { toFixed(n: number): string };
  readonly estornoDeId: string | null;
  readonly anulacaoParcialDeId: string | null;
}

/** Soma líquida de uma cadeia do M05 (empenhos, liquidações ou pagamentos). */
function liquido(linhas: readonly LinhaDaCadeia[]): Decimal {
  return somaLiquidaEstornaveis(linhas.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId })));
}

export async function listarDespesasPublicas(f: FiltrosDasDespesasPublicas = {}): Promise<PaginaDeDespesasPublicas> {
  const prisma = cliente();
  const porPagina = Math.min(100, Math.max(1, f.porPagina ?? PADRAO_POR_PAGINA_DESPESA));
  const pagina = Math.max(1, f.pagina ?? 1);

  // ⚠️ SÓ OS EMPENHOS ORIGINAIS ENTRAM NA LISTA. Anulação total e anulação parcial são LINHAS de
  // empenho no M05 — listá-las mostraria "empenhos" que na verdade são correções de outros, e o
  // leitor contaria a mesma despesa duas vezes. Elas aparecem na COLUNA "anulado" do original.
  const where: Record<string, unknown> = { estornoDeId: null, anulacaoParcialDeId: null };
  const q = (f.q ?? "").trim();
  if (q !== "") {
    where["OR"] = [
      { numero: { contains: q, mode: "insensitive" } },
      { historico: { contains: q, mode: "insensitive" } },
      { credorCpfCnpj: { contains: q.replace(/[^0-9A-Za-z]/g, "") } },
    ];
  }
  const exercicio = Number.parseInt((f.exercicio ?? "").trim(), 10);
  if (Number.isInteger(exercicio)) where["ficha"] = { exercicio };
  if ((f.unidade ?? "").trim() !== "") {
    where["ficha"] = { ...((where["ficha"] as object) ?? {}), unidadeOrcId: (f.unidade ?? "").trim() };
  }
  /**
   * ⚠️ AS BORDAS DO PERÍODO SÃO DO DIA CIVIL DO ENTE, e a primeira versão deste arquivo as
   * escreveu com `T00:00:00Z`/`T23:59:59Z` — o guard `data-civil` a pegou no mesmo dia.
   *
   * O estrago seria silencioso e enviesado: com o ente em UTC−3, `31/03T23:59:59Z` é 20:59:59 do
   * dia 31 no relógio local, e todo empenho registrado depois das 21h do último dia do mês ficaria
   * FORA da consulta daquele mês; `01/03T00:00:00Z` é 21h do dia 28, e traria de volta parte do dia
   * anterior. O total de março sairia errado nas duas pontas — e bateria com o total de abril,
   * porque o mesmo viés se repete.
   */
  const periodo: Record<string, Date> = {};
  if ((f.de ?? "").trim() !== "") periodo["gte"] = inicioDoDiaCivil((f.de ?? "").trim());
  if ((f.ate ?? "").trim() !== "") periodo["lte"] = fimDoDiaCivil((f.ate ?? "").trim());
  if (Object.keys(periodo).length > 0) where["data"] = periodo;

  const ordem =
    f.ordem === "valor" ? { valor: f.direcao === "asc" ? ("asc" as const) : ("desc" as const) }
      : f.ordem === "numero" ? { numero: f.direcao === "asc" ? ("asc" as const) : ("desc" as const) }
        : { data: f.direcao === "asc" ? ("asc" as const) : ("desc" as const) };

  /**
   * ⚠️ ESTE OBJETO NÃO É CONFERIDO PELO COMPILADOR, e isso custou uma execução: `funcao: { select:
   * { descricao: true } }` compilou e só quebrou em runtime (o campo é `nome`). Um `select`
   * extraído para uma constante com `as const` perde a checagem que o Prisma faz quando ele é
   * escrito inline. Ele continua extraído — porque a lista e os totais TÊM de usar o mesmo, ou os
   * números do rodapé deixam de bater com as linhas — e o que cobre a lacuna é o teste que roda a
   * consulta de verdade contra o banco.
   */
  const SELECAO = {
    id: true, numero: true, data: true, valor: true, credorCpfCnpj: true, historico: true,
    estornoDeId: true, anulacaoParcialDeId: true,
    // As anulações DESTE empenho — é delas que sai a coluna "anulado".
    estornos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
    anulacoesParciais: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
    contrato: { select: { numeroContrato: true } },
    ficha: {
      select: {
        exercicio: true,
        unidadeOrc: { select: { codigo: true, descricao: true } },
        funcao: { select: { codigo: true, nome: true } },
        naturezaDespesa: { select: { codigoCompleto: true, descricao: true } },
        fonte: { select: { codigo: true, descricao: true } },
      },
    },
    liquidacoes: {
      select: {
        id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
        estornos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
        anulacoesParciais: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
        pagamentos: {
          select: {
            id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
            estornos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
            anulacoesParciais: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
          },
        },
      },
    },
  } as const;

  const [total, linhas, exercicios, unidades] = await Promise.all([
    prisma.empenho.count({ where }),
    prisma.empenho.findMany({ where, orderBy: ordem, skip: (pagina - 1) * porPagina, take: porPagina, select: SELECAO }),
    prisma.fichaOrcamentaria.findMany({ distinct: ["exercicio"], select: { exercicio: true }, orderBy: { exercicio: "desc" } }),
    prisma.unidadeOrcamentaria.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
  ]);

  // Os nomes dos credores, resolvidos pela Pessoa canônica — numa consulta só.
  const documentos = [...new Set(linhas.map((e) => e.credorCpfCnpj.replace(/[^0-9A-Za-z]/g, "")))];
  const pessoas = await prisma.pessoa.findMany({
    where: { documento: { in: documentos } },
    select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
  });
  const nomePorDocumento = new Map(pessoas.map((p) => [p.documento, p.versoes[0]?.nome ?? ""]));

  type Bruta = (typeof linhas)[number];
  const projetar = (e: Bruta): DespesaPublicaNaLista => {
    const cadeiaDoEmpenho = [
      { id: e.id, valor: e.valor, estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId },
      ...e.estornos, ...e.anulacoesParciais,
    ];
    const empenhado = liquido(cadeiaDoEmpenho);
    const original = new Decimal(e.valor.toFixed(2));
    const liquidacoes = e.liquidacoes.flatMap((l) => [{ id: l.id, valor: l.valor, estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId }, ...l.estornos, ...l.anulacoesParciais]);
    const pagamentos = e.liquidacoes.flatMap((l) => l.pagamentos.flatMap((p) => [{ id: p.id, valor: p.valor, estornoDeId: p.estornoDeId, anulacaoParcialDeId: p.anulacaoParcialDeId }, ...p.estornos, ...p.anulacoesParciais]));
    const liq = liquido(liquidacoes);
    const pg = liquido(pagamentos);
    const doc = e.credorCpfCnpj.replace(/[^0-9A-Za-z]/g, "");
    return {
      id: e.id,
      numero: e.numero,
      data: diaCivilBr(e.data),
      exercicio: e.ficha.exercicio,
      unidade: `${e.ficha.unidadeOrc.codigo} — ${e.ficha.unidadeOrc.descricao}`,
      funcao: `${e.ficha.funcao.codigo} — ${e.ficha.funcao.nome}`,
      naturezaDespesa: `${e.ficha.naturezaDespesa.codigoCompleto} — ${e.ficha.naturezaDespesa.descricao}`,
      fonte: `${e.ficha.fonte.codigo} — ${e.ficha.fonte.descricao}`,
      credorNome: nomePorDocumento.get(doc) ?? "não cadastrado",
      credorDocumento: documentoPublicavelDoCredor(doc),
      historico: e.historico,
      contrato: e.contrato?.numeroContrato ?? null,
      empenhado: serializar(toMoney(empenhado)),
      empenhadoOriginal: serializar(toMoney(original)),
      anulado: serializar(toMoney(original.minus(empenhado))),
      liquidado: serializar(toMoney(liq)),
      pago: serializar(toMoney(pg)),
      // ⚠️ A FASE É O ESTÁGIO ALCANÇADO, não um somatório: "Paga" não quer dizer que o valor pago
      // seja o empenhado — pagamento parcial existe, e as três colunas continuam ao lado.
      fase: empenhado.lte(0) ? "Anulada" : pg.gt(0) ? "Paga" : liq.gt(0) ? "Liquidada" : "Empenhada",
    };
  };

  const projetadas = linhas.map(projetar);

  // ⚠️ OS TOTAIS DO RECORTE INTEIRO, não da página — quem consulta um exercício quer o total do
  // exercício, e somar a página daria um número que não é total de nada.
  //
  // ⚠️ E ELES PASSAM PELA MESMA PROJEÇÃO DA LISTA. Uma segunda aritmética, "mais rápida", para o
  // rodapé é como o total deixa de bater com as linhas que estão acima dele — e ninguém descobre,
  // porque conferir exige somar a mão.
  let totais: PaginaDeDespesasPublicas["totais"] = null;
  let totaisAusentes: string | null = null;
  if (total > TETO_DOS_TOTAIS) {
    totaisAusentes =
      `Este recorte tem ${total} empenhos. Os totais são calculados até ${TETO_DOS_TOTAIS}: ` +
      `estreite por exercício, período ou unidade para vê-los.`;
  } else {
    const todos = await prisma.empenho.findMany({ where, select: SELECAO });
    const projetadasTodas = todos.map(projetar);
    const somar = (f2: (x: DespesaPublicaNaLista) => string): string =>
      serializar(toMoney(projetadasTodas.reduce((t, x) => t.plus(f2(x)), new Decimal(0))));
    totais = { empenhado: somar((x) => x.empenhado), liquidado: somar((x) => x.liquidado), pago: somar((x) => x.pago) };
  }

  return {
    linhas: projetadas,
    total,
    pagina,
    porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    exerciciosDisponiveis: exercicios.map((x) => x.exercicio),
    unidadesDisponiveis: unidades.map((u) => ({ valor: u.id, rotulo: `${u.codigo} — ${u.descricao}` })),
    totais,
    totaisAusentes,
  };
}
