import { toMoney } from "../../../packages/contracts/index.js";
import { diaCivilBr } from "../../../packages/datas/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import { criarM02Deps } from "../../../modules/m02-planejamento/adapter-prisma.js";
import { criarFicha } from "../../../modules/m02-planejamento/servico.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DadoDoDetalhe, LinhaDoHistorico } from "../../molde/tipos.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * A PORTA DA FICHA ORÇAMENTÁRIA (M02, V6.2 U0). Lê e chama `criarFicha`; quem decide é o domínio.
 * Os saldos da lista são o CACHE da ficha (que o M05 escreve como SUM dos movimentos) — orientação,
 * nunca a decisão de empenhar.
 */
export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const ROTULO_DO_MOVIMENTO: Readonly<Record<string, string>> = {
  DOTACAO_INICIAL: "Dotação inicial (LOA)",
  SUPLEMENTACAO: "Suplementação",
  ANULACAO: "Anulação",
  RESERVA: "Reserva",
  LIBERACAO_RESERVA: "Liberação de reserva",
  EMPENHO: "Empenho",
  ESTORNO_EMPENHO: "Estorno de empenho",
};

export async function opcoesDaFicha(): Promise<OpcoesDoCadastro> {
  // ⚠️ SÓ OS EXERCÍCIOS ABERTOS. O M08 recusa o encerrado dentro da transação; oferecer um exercício
  // encerrado seria ensinar a pessoa a preencher tudo para ouvir não.
  const exercicios = await cliente().exercicio.findMany({ where: { encerramento: null }, orderBy: { ano: "desc" }, select: { ano: true } });
  return { exercicio: exercicios.map((e) => ({ valor: String(e.ano), rotulo: String(e.ano) })) };
}

export async function listarFichas(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const ex = Number.parseInt(c.filtros["exercicio"] ?? "", 10);
  const where: Prisma.FichaOrcamentariaWhereInput = {
    ...(Number.isFinite(ex) ? { exercicio: ex } : {}),
    ...(q === ""
      ? {}
      : {
          OR: [
            ...(/^\d+$/.test(q) && q.length <= 6 ? [{ numero: Number(q) }] : []),
            { naturezaDespesa: { codigoCompleto: { startsWith: q } } },
            { unidadeOrc: { codigo: { startsWith: q } } },
            { unidadeOrc: { descricao: { contains: q, mode: "insensitive" as const } } },
          ],
        }),
  };
  const [total, fichas] = await Promise.all([
    prisma.fichaOrcamentaria.count({ where }),
    prisma.fichaOrcamentaria.findMany({
      where,
      orderBy: [{ exercicio: "desc" }, { numero: c.direcao === "desc" ? "desc" : "asc" }],
      skip: (c.pagina - 1) * TAMANHO_DE_PAGINA,
      take: TAMANHO_DE_PAGINA,
      select: {
        id: true, exercicio: true, numero: true, saldoAutorizado: true, saldoDisponivel: true,
        unidadeOrc: { select: { codigo: true } }, funcao: { select: { codigo: true } }, subfuncao: { select: { codigo: true } },
        programa: { select: { codigo: true } }, acao: { select: { codigo: true } },
        naturezaDespesa: { select: { codigoCompleto: true } }, fonte: { select: { codigo: true } },
      },
    }),
  ]);
  return {
    total,
    linhas: fichas.map((f) => ({
      id: f.id, numero: String(f.numero), exercicio: String(f.exercicio), unidade: f.unidadeOrc.codigo,
      funcional: `${f.funcao.codigo}.${f.subfuncao.codigo}.${f.programa.codigo}.${f.acao.codigo}`,
      natureza: f.naturezaDespesa.codigoCompleto, fonte: f.fonte.codigo,
      autorizado: toMoney(f.saldoAutorizado).toFixed(2), disponivel: toMoney(f.saldoDisponivel).toFixed(2),
    })),
  };
}

export async function verFicha(id: string): Promise<DetalheLido | null> {
  const f = await cliente().fichaOrcamentaria.findUnique({
    where: { id },
    select: {
      exercicio: true, numero: true, exercicioFonte: true, valorDotado: true,
      saldoAutorizado: true, saldoReservado: true, saldoEmpenhado: true, saldoDisponivel: true,
      orgao: { select: { codigo: true, nome: true } }, unidadeOrc: { select: { codigo: true, descricao: true } },
      funcao: { select: { codigo: true, nome: true } }, subfuncao: { select: { codigo: true, nome: true } },
      programa: { select: { codigo: true, descricao: true } }, acao: { select: { codigo: true, descricao: true } },
      naturezaDespesa: { select: { codigoCompleto: true, descricao: true } }, fonte: { select: { codigo: true, descricao: true } },
      co: { select: { codigo: true, descricao: true } },
      movimentos: { orderBy: [{ competencia: "asc" }, { criadoEm: "asc" }], take: 200, select: { id: true, tipo: true, valor: true, competencia: true, criadoEm: true, criadoPor: true, origemTipo: true } },
    },
  });
  if (f === null) return null;
  const semDotacao = toMoney(f.valorDotado).isZero();
  const dados: DadoDoDetalhe[] = [
    { rotulo: "Exercício", valor: String(f.exercicio), tipo: "inteiro" },
    { rotulo: "Número", valor: String(f.numero), tipo: "inteiro" },
    { rotulo: "Órgão", valor: `${f.orgao.codigo} — ${f.orgao.nome}` },
    { rotulo: "Unidade orçamentária", valor: `${f.unidadeOrc.codigo} — ${f.unidadeOrc.descricao}` },
    { rotulo: "Função", valor: `${f.funcao.codigo} — ${f.funcao.nome}` },
    { rotulo: "Subfunção", valor: `${f.subfuncao.codigo} — ${f.subfuncao.nome}` },
    { rotulo: "Programa", valor: `${f.programa.codigo} — ${f.programa.descricao}` },
    { rotulo: "Ação", valor: `${f.acao.codigo} — ${f.acao.descricao}` },
    { rotulo: "Natureza da despesa", valor: `${f.naturezaDespesa.codigoCompleto} — ${f.naturezaDespesa.descricao}` },
    { rotulo: "Fonte", valor: `${f.fonte.codigo} — ${f.fonte.descricao}` },
    { rotulo: "Código de acompanhamento", valor: f.co === null ? "" : `${f.co.codigo} — ${f.co.descricao}` },
    { rotulo: "Exercício da fonte", valor: f.exercicioFonte === 1 ? "1 — do exercício" : "2 — de exercícios anteriores" },
    { rotulo: "Dotação inicial (LOA)", valor: toMoney(f.valorDotado).toFixed(2), tipo: "dinheiro", nota: semDotacao ? "Ficha sem dotação inicial: o crédito dela vem de crédito adicional (Planejamento > Créditos adicionais)." : "Valor fixado na lei orçamentária." },
    { rotulo: "Autorizado", valor: toMoney(f.saldoAutorizado).toFixed(2), tipo: "dinheiro", nota: "Dotação inicial + créditos − anulações." },
    { rotulo: "Reservado", valor: toMoney(f.saldoReservado).toFixed(2), tipo: "dinheiro" },
    { rotulo: "Empenhado", valor: toMoney(f.saldoEmpenhado).toFixed(2), tipo: "dinheiro" },
    { rotulo: "Disponível", valor: toMoney(f.saldoDisponivel).toFixed(2), tipo: "dinheiro", nota: "Cache da soma dos movimentos — orientação. Quem decide se cabe é o empenho, contra a soma real, na transação." },
  ];
  const historico: LinhaDoHistorico[] = f.movimentos.map((m) => ({
    id: m.id,
    oQue: ROTULO_DO_MOVIMENTO[m.tipo] ?? m.tipo,
    quando: diaCivilBr(m.competencia),
    registradoEm: diaCivilBr(m.criadoEm),
    por: m.criadoPor,
    valor: toMoney(m.valor).toFixed(2),
    motivo: `origem ${m.origemTipo}`,
  }));
  return {
    titulo: `Ficha ${f.numero}/${f.exercicio}`,
    subtitulo: `${f.unidadeOrc.codigo} · ${f.naturezaDespesa.codigoCompleto} · fonte ${f.fonte.codigo}`,
    selos: semDotacao && toMoney(f.saldoAutorizado).isZero() ? [{ texto: "SEM CRÉDITO", tom: "alerta" }] : [],
    dados,
    historico,
  };
}

/**
 * CRIA A FICHA PELO CASO DE USO DO M02, sem dotação.
 *
 * ⚠️ O ÓRGÃO VEM DA UNIDADE, e é lido aqui só para montar o input — o M02 confere a coerência de novo.
 * ⚠️ OBRIGATÓRIOS AUSENTES RECUSAM NOMEANDO, antes do caso de uso: o seletor referenciado guarda o
 * valor num campo escondido, que o navegador não valida como obrigatório.
 */
export async function criarFichaPelaTela(c: Campos): Promise<string> {
  const faltando = [
    ["exercicio", "exercício"], ["numero", "número"], ["unidadeOrc", "unidade orçamentária"], ["funcao", "função"],
    ["subfuncao", "subfunção"], ["programa", "programa"], ["acao", "ação"], ["naturezaDespesa", "natureza da despesa"], ["fonte", "fonte"],
  ].filter(([k]) => t(c, k as string) === "").map(([, r]) => r);
  if (faltando.length > 0) throw new Error(`Escolha na lista: ${faltando.join(", ")}. Nada foi gravado.`);
  const prisma = cliente();
  const uo = await prisma.unidadeOrcamentaria.findUnique({ where: { codigo: t(c, "unidadeOrc") }, select: { orgao: { select: { codigo: true } } } });
  if (uo === null) throw new Error(`A unidade orçamentária ${t(c, "unidadeOrc")} não existe no plano. Nada foi gravado.`);
  return comEscritaAutenticada("CRIAR_FICHA", (criadoPor) =>
    criarFicha(
      {
        exercicio: Number.parseInt(t(c, "exercicio"), 10),
        numero: Number.parseInt(t(c, "numero"), 10),
        exercicioFonte: t(c, "exercicioFonte") === "2" ? 2 : 1,
        // ⚠️ A FICHA DA TELA NASCE SEM CRÉDITO — ver `lib/portas/recursos/fichas.ts`.
        valorDotado: "0.00",
        criadoPor,
        classificacao: {
          orgao: uo.orgao.codigo, unidadeOrc: t(c, "unidadeOrc"), funcao: t(c, "funcao"), subfuncao: t(c, "subfuncao"),
          programa: t(c, "programa"), acao: t(c, "acao"), naturezaDespesa: t(c, "naturezaDespesa"), fonte: t(c, "fonte"),
          ...(t(c, "co") !== "" ? { co: t(c, "co") } : {}),
        },
      },
      criarM02Deps(prisma)
    )
  );
}
