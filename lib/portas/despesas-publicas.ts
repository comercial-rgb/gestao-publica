import { Decimal, toMoney, serializar } from "../../packages/contracts/index.js";
import { diaCivilBr, fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { tipoDeDocumento } from "../../packages/documento/index.js";
import { cliente, PortaSemBancoError } from "./cliente.js";
import {
  derivadasDe,
  ehFase,
  idsDaPagina,
  totaisDerivados,
  type FaseDaDespesa,
  type FiltrosDerivados,
} from "./despesas-derivadas.js";

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
   * ⚠️ E ELES DEIXARAM DE PODER SER `null` (V10 T3). Até aqui, acima de dois mil empenhos o
   * rodapé desistia e dizia "estreite a busca" — e o total do exercício é exatamente o número
   * que o cidadão foi buscar. Agora a soma é AGREGADA NO BANCO
   * (`lib/portas/despesas-derivadas.ts`), sobre o recorte inteiro, sem teto e sem carregar
   * cadeia nenhuma em memória.
   */
  readonly totais: { readonly empenhado: string; readonly liquidado: string; readonly pago: string };
}

export const PADRAO_POR_PAGINA_DESPESA = 25;

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

export interface LinhaDaCadeia {
  readonly id: string;
  readonly valor: { toFixed(n: number): string };
  readonly estornoDeId: string | null;
  readonly anulacaoParcialDeId: string | null;
}

/**
 * Soma líquida de uma cadeia do M05 (empenhos, liquidações ou pagamentos).
 *
 * ⚠️ ELA DEIXOU DE SER USADA PELA CONSULTA (V10 T3) — quem calcula agora é o SQL de
 * `despesas-derivadas.ts`, para que filtro, contagem, paginação, totais e exportação falem do
 * mesmo conjunto. E ela continua EXPORTADA de propósito: é a implementação INDEPENDENTE contra
 * a qual o SQL é conferido em `test/despesas-derivadas.test.ts`. "Parser se testa contra
 * implementação independente" — usar o próprio SQL para conferir o próprio SQL passaria com
 * qualquer interpretação errada consistente.
 */
export function liquido(linhas: readonly LinhaDaCadeia[]): Decimal {
  return somaLiquidaEstornaveis(linhas.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId })));
}

export async function listarDespesasPublicas(f: FiltrosDasDespesasPublicas = {}): Promise<PaginaDeDespesasPublicas> {
  const prisma = cliente();
  const porPagina = Math.min(100, Math.max(1, f.porPagina ?? PADRAO_POR_PAGINA_DESPESA));
  const pagina = Math.max(1, f.pagina ?? 1);

  /**
   * ⚠️ O FILTRO INTEIRO VAI PARA O BANCO (V10 T3), INCLUSIVE A FASE.
   *
   * A fase é DERIVADA da cadeia (empenhado/liquidado/pago líquidos), e até aqui ela era aplicada
   * sobre a PÁGINA já carregada. O efeito: a contagem falava do conjunto sem fase, o número de
   * páginas também, o CSV baixava outra coisa, e a tela tinha de explicar a diferença ao cidadão.
   * Agora a derivação acontece em SQL e o predicado vale para o conjunto inteiro — contagem,
   * páginas, totais, lista e exportação passam a falar do MESMO recorte.
   *
   * ⚠️ AS BORDAS DO PERÍODO SÃO DO DIA CIVIL DO ENTE. A primeira versão deste arquivo as escreveu
   * com `T00:00:00Z`/`T23:59:59Z` e o guard `data-civil` a pegou no mesmo dia: com o ente em
   * UTC−3, todo empenho depois das 21h do último dia ficaria FORA do mês, e parte do dia anterior
   * entraria. Elas são resolvidas AQUI e chegam ao SQL como instantes.
   */
  const exercicioNumero = Number.parseInt((f.exercicio ?? "").trim(), 10);
  const faseBruta = (f.fase ?? "").trim();
  const filtros: FiltrosDerivados = {
    ...((f.q ?? "").trim() !== "" ? { q: (f.q ?? "").trim() } : {}),
    ...(Number.isInteger(exercicioNumero) ? { exercicio: exercicioNumero } : {}),
    ...((f.unidade ?? "").trim() !== "" ? { unidadeOrcId: (f.unidade ?? "").trim() } : {}),
    ...((f.de ?? "").trim() !== "" ? { de: inicioDoDiaCivil((f.de ?? "").trim()) } : {}),
    ...((f.ate ?? "").trim() !== "" ? { ate: fimDoDiaCivil((f.ate ?? "").trim()) } : {}),
    ...(ehFase(faseBruta) ? { fase: faseBruta as FaseDaDespesa } : {}),
  };

  const ordem: "data" | "numero" | "valor" = f.ordem === "valor" ? "valor" : f.ordem === "numero" ? "numero" : "data";
  const direcao: "asc" | "desc" = f.direcao === "asc" ? "asc" : "desc";

  const [agregado, ids, exercicios, unidades] = await Promise.all([
    totaisDerivados(prisma, filtros),
    idsDaPagina(prisma, filtros, ordem, direcao, (pagina - 1) * porPagina, porPagina),
    prisma.fichaOrcamentaria.findMany({ distinct: ["exercicio"], select: { exercicio: true }, orderBy: { exercicio: "desc" } }),
    prisma.unidadeOrcamentaria.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { codigo: "asc" } }),
  ]);

  /**
   * ⚠️ ESTE OBJETO NÃO É CONFERIDO PELO COMPILADOR, e isso custou uma execução: `funcao: { select:
   * { descricao: true } }` compilou e só quebrou em runtime (o campo é `nome`). Um `select`
   * extraído para uma constante com `as const` perde a checagem que o Prisma faz quando ele é
   * escrito inline. O que cobre a lacuna é o teste que roda a consulta de verdade contra o banco.
   */
  const SELECAO = {
    id: true, numero: true, data: true, valor: true, credorCpfCnpj: true, historico: true,
    estornoDeId: true, anulacaoParcialDeId: true,
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
  } as const;

  // ⚠️ SEM TERNÁRIO AQUI. `ids.length === 0 ? [] : await …` faz a inferência do Prisma colapsar
  // para `any` — e aí `credorNome`, `unidade` e o resto deixam de ser conferidos pelo
  // compilador, em silêncio. `in: []` é consulta válida e devolve vazio.
  const linhas = await prisma.empenho.findMany({ where: { id: { in: [...ids] } }, select: SELECAO });

  // ⚠️ A ORDEM É A DO SQL, e não a do `findMany`: um `IN` não promete ordem nenhuma. Reordenar
  // pela lista de ids é o que mantém a página igual à que foi contada e paginada.
  const porId = new Map(linhas.map((e) => [e.id, e]));
  const naOrdem = ids.map((id) => porId.get(id)).filter((e): e is (typeof linhas)[number] => e !== undefined);

  // Os nomes dos credores, resolvidos pela Pessoa canônica — numa consulta só.
  const documentos = [...new Set(naOrdem.map((e) => e.credorCpfCnpj.replace(/[^0-9A-Za-z]/g, "")))];
  const pessoas = await prisma.pessoa.findMany({
    where: { documento: { in: documentos } },
    select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
  });
  const nomePorDocumento = new Map(pessoas.map((p) => [p.documento, p.versoes[0]?.nome ?? ""]));

  // ⚠️ O ESTADO DERIVADO DA LINHA VEM DO MESMO SQL que contou, paginou e somou. Recalculá-lo aqui
  // seria a segunda aritmética "mais rápida" que faz o rodapé deixar de bater com as linhas — e
  // ninguém descobre, porque conferir exige somar à mão.
  const derivadas = await derivadasDe(prisma, ids);

  type Bruta = (typeof linhas)[number];
  const projetar = (e: Bruta): DespesaPublicaNaLista => {
    const d = derivadas.get(e.id) ?? { empenhado: "0", liquidado: "0", pago: "0" };
    const empenhado = toMoney(new Decimal(d.empenhado));
    const liq = toMoney(new Decimal(d.liquidado));
    const pg = toMoney(new Decimal(d.pago));
    const original = new Decimal(e.valor.toFixed(2));
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
      empenhado: serializar(empenhado),
      empenhadoOriginal: serializar(toMoney(original)),
      anulado: serializar(toMoney(original.minus(empenhado))),
      liquidado: serializar(liq),
      pago: serializar(pg),
      // ⚠️ A FASE É O ESTÁGIO ALCANÇADO, não um somatório: "Paga" não quer dizer que o valor pago
      // seja o empenhado — pagamento parcial existe, e as três colunas continuam ao lado. A MESMA
      // árvore de decisão está em `predicadoDaFase`, no SQL, e o teste D5 confere as duas.
      fase: empenhado.lte(0) ? "Anulada" : pg.gt(0) ? "Paga" : liq.gt(0) ? "Liquidada" : "Empenhada",
    };
  };

  return {
    linhas: naOrdem.map(projetar),
    total: agregado.total,
    pagina,
    porPagina,
    paginas: Math.max(1, Math.ceil(agregado.total / porPagina)),
    exerciciosDisponiveis: exercicios.map((x) => x.exercicio),
    unidadesDisponiveis: unidades.map((u) => ({ valor: u.id, rotulo: `${u.codigo} — ${u.descricao}` })),
    totais: {
      empenhado: serializar(toMoney(new Decimal(agregado.empenhado))),
      liquidado: serializar(toMoney(new Decimal(agregado.liquidado))),
      pago: serializar(toMoney(new Decimal(agregado.pago))),
    },
  };

}
