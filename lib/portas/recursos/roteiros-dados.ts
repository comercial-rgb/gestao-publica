import { diaCivilBr } from "../../../packages/datas/index.js";
import {
  parametrizarRoteiroPatrimonial,
  parametrizarRoteiroResultadoAlienacao,
} from "../../../modules/m10-patrimonial/roteiros.js";
import { TIPOS_BASE } from "../../../modules/m10-patrimonial/dominio.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";
import { OPCOES_DE_CHAVE, rotuloDoTipoPatrimonial } from "./roteiros.js";

/**
 * ═══ OS DADOS DO ROTEIRO CONTÁBIL DO PATRIMÔNIO — M10, TR 5.10.1.71 ═══
 *
 * ⚠️ A LISTAGEM NÃO É "AS LINHAS DA TABELA", e essa é a decisão central deste arquivo. Ela
 * é o ROL COMPLETO dos eventos, com o roteiro junto quando existe. Hoje isso significa
 * treze linhas dizendo "Sem roteiro"; se a listagem fosse a tabela, a tela estaria vazia —
 * verdadeira e inútil, porque o que o contador precisa ver é justamente o que falta.
 *
 * ⚠️ O `id` DA LINHA É O PRÓPRIO TIPO, e não o id do roteiro. O tipo é `@unique` no modelo,
 * existe antes de haver roteiro, e é ele que o serviço recebe. Usar o id do roteiro deixaria
 * as linhas pendentes sem identidade — e o link para o detalhe apontaria para o nada
 * exatamente nas linhas que mais interessam.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Conta inexistente, conta sintética, par que não forma
 * lançamento patrimonial e substituição não pedida são decididos dentro da transação do
 * domínio, e a recusa sobe COMO VEIO.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;

const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

interface RoteiroLido {
  readonly id: string;
  readonly contaDebito: { readonly codigo: string; readonly nome: string };
  readonly contaCredito: { readonly codigo: string; readonly nome: string };
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

function conta(c: { readonly codigo: string; readonly nome: string }): string {
  return `${c.codigo} — ${c.nome}`;
}

/**
 * Monta as linhas do rol a partir dos eventos, cruzando com o que está gravado.
 *
 * ⚠️ O FILTRO É APLICADO SOBRE A LINHA COMPOSTA, e não num `where` do Prisma — porque a
 * pergunta "quais eventos estão SEM roteiro?" não é respondível por consulta à tabela dos
 * roteiros: o que falta não está lá. É a mesma anatomia do filtro "com saldo a atender" das
 * requisições, que também responde por derivação.
 */
function comporLinhas(
  eventos: readonly { readonly chave: string; readonly rotulo: string }[],
  gravados: ReadonlyMap<string, RoteiroLido>,
  c: ConsultaDoMolde
): PaginaDoMolde {
  const q = (c.filtros["q"] ?? "").trim().toLowerCase();
  const situacao = c.filtros["situacao"] ?? "";

  const linhas = eventos
    .map((e) => {
      const r = gravados.get(e.chave);
      return {
        id: e.chave,
        evento: e.rotulo,
        debito: r === undefined ? "—" : conta(r.contaDebito),
        credito: r === undefined ? "—" : conta(r.contaCredito),
        situacao: r === undefined ? "Sem roteiro" : "Parametrizado",
      };
    })
    .filter((l) => {
      if (situacao === "PARAMETRIZADO" && l.situacao !== "Parametrizado") return false;
      if (situacao === "PENDENTE" && l.situacao !== "Sem roteiro") return false;
      if (q === "") return true;
      return `${l.evento} ${l.debito} ${l.credito}`.toLowerCase().includes(q);
    });

  // ⚠️ SEM PAGINAÇÃO, e é medida: o rol tem treze eventos (dois no resultado da alienação),
  // e `TAMANHO_DE_PAGINA` é maior que isso. Paginar um rol fechado de treze acrescentaria um
  // rodapé que nunca muda de página.
  return { total: linhas.length, linhas };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROTEIROS DO MOVIMENTO PATRIMONIAL — os treze eventos do bem
// ═══════════════════════════════════════════════════════════════════════════

const EVENTOS_PATRIMONIAIS = TIPOS_BASE.map((tipo) => ({
  chave: tipo as string,
  rotulo: rotuloDoTipoPatrimonial(tipo),
}));

async function gravadosPatrimoniais(): Promise<ReadonlyMap<string, RoteiroLido>> {
  const linhas = await cliente().roteiroPatrimonial.findMany({
    select: {
      id: true,
      tipo: true,
      criadoEm: true,
      criadoPor: true,
      contaDebito: { select: { codigo: true, nome: true } },
      contaCredito: { select: { codigo: true, nome: true } },
    },
  });
  return new Map(linhas.map((r) => [r.tipo as string, r]));
}

export async function listarRoteirosPatrimoniais(
  c: ConsultaDoMolde
): Promise<PaginaDoMolde> {
  return comporLinhas(EVENTOS_PATRIMONIAIS, await gravadosPatrimoniais(), c);
}

export async function verRoteiroPatrimonial(tipo: string): Promise<DetalheLido | null> {
  const evento = EVENTOS_PATRIMONIAIS.find((e) => e.chave === tipo);
  // ⚠️ TIPO DESCONHECIDO É `null` (a tela chama `notFound`), e não um detalhe vazio: uma URL
  // digitada à mão não pode produzir uma tela que convida a parametrizar um evento que o
  // sistema não conhece — o serviço a recusaria depois, falando de um enum.
  if (evento === undefined) return null;

  const r = (await gravadosPatrimoniais()).get(tipo);
  return detalheDoRoteiro(evento.rotulo, r, {
    semRoteiro:
      "Enquanto este evento não tiver roteiro, o sistema RECUSA registrar qualquer " +
      "movimento dele — e a recusa é deliberada: sem roteiro, lançar exigiria escolher uma " +
      "conta, e o sistema não escolhe conta do PCASP por conta própria.",
  });
}

export async function criarRoteiroPatrimonial(c: Campos): Promise<void> {
  await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_PATRIMONIAL", (criadoPor) =>
    parametrizarRoteiroPatrimonial(cliente(), {
      tipo: t(c, "tipo"),
      contaDebitoId: t(c, "contaDebitoId"),
      contaCreditoId: t(c, "contaCreditoId"),
      substituir: false,
      criadoPor,
    })
  );
}

/**
 * ⚠️ FAIL-CLOSED: ação desconhecida ESTOURA. Um `default` silencioso deixaria a tela dizer
 * "roteiro alterado" sem ter gravado nada.
 */
export async function acaoDoRoteiroPatrimonial(
  acao: string,
  tipo: string,
  c: Campos
): Promise<void> {
  if (acao !== "reparametrizar") {
    throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
  await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_PATRIMONIAL", (criadoPor) =>
    parametrizarRoteiroPatrimonial(cliente(), {
      tipo,
      contaDebitoId: t(c, "contaDebitoId"),
      contaCreditoId: t(c, "contaCreditoId"),
      substituir: true,
      criadoPor,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROTEIROS DO RESULTADO DA ALIENAÇÃO — ganho e perda
// ═══════════════════════════════════════════════════════════════════════════

const EVENTOS_DE_RESULTADO = OPCOES_DE_CHAVE.map((o) => ({
  chave: o.valor,
  rotulo: o.rotulo,
}));

async function gravadosDeResultado(): Promise<ReadonlyMap<string, RoteiroLido>> {
  const linhas = await cliente().roteiroResultadoAlienacao.findMany({
    select: {
      id: true,
      chave: true,
      criadoEm: true,
      criadoPor: true,
      contaDebito: { select: { codigo: true, nome: true } },
      contaCredito: { select: { codigo: true, nome: true } },
    },
  });
  return new Map(linhas.map((r) => [r.chave as string, r]));
}

export async function listarRoteirosDeResultado(
  c: ConsultaDoMolde
): Promise<PaginaDoMolde> {
  return comporLinhas(EVENTOS_DE_RESULTADO, await gravadosDeResultado(), c);
}

export async function verRoteiroDeResultado(chave: string): Promise<DetalheLido | null> {
  const evento = EVENTOS_DE_RESULTADO.find((e) => e.chave === chave);
  if (evento === undefined) return null;

  const r = (await gravadosDeResultado()).get(chave);
  return detalheDoRoteiro(evento.rotulo, r, {
    semRoteiro:
      "Sem este roteiro, a alienação de bem é RECUSADA no momento de apurar o resultado — " +
      "a baixa e o ganho são o mesmo ato, e metade dele não se grava.",
  });
}

export async function criarRoteiroDeResultado(c: Campos): Promise<void> {
  await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_PATRIMONIAL", (criadoPor) =>
    parametrizarRoteiroResultadoAlienacao(cliente(), {
      chave: t(c, "chave"),
      contaDebitoId: t(c, "contaDebitoId"),
      contaCreditoId: t(c, "contaCreditoId"),
      substituir: false,
      criadoPor,
    })
  );
}

export async function acaoDoRoteiroDeResultado(
  acao: string,
  chave: string,
  c: Campos
): Promise<void> {
  if (acao !== "reparametrizar") {
    throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  }
  await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_PATRIMONIAL", (criadoPor) =>
    parametrizarRoteiroResultadoAlienacao(cliente(), {
      chave,
      contaDebitoId: t(c, "contaDebitoId"),
      contaCreditoId: t(c, "contaCreditoId"),
      substituir: true,
      criadoPor,
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function detalheDoRoteiro(
  rotulo: string,
  r: RoteiroLido | undefined,
  textos: { readonly semRoteiro: string }
): DetalheLido {
  if (r === undefined) {
    return {
      titulo: rotulo,
      subtitulo: "Sem roteiro contábil",
      selos: [{ texto: "Sem roteiro", tom: "alerta" }],
      dados: [
        { rotulo: "Situação", valor: "Sem roteiro", nota: textos.semRoteiro },
        { rotulo: "Conta de débito", valor: "—" },
        { rotulo: "Conta de crédito", valor: "—" },
      ],
      // ⚠️ HISTÓRICO VAZIO PORQUE NÃO HÁ HISTÓRICO, e a aba não é declarada no descritor —
      // o molde não a mostra. Ver a nota do descritor: pendência `ROTEIRO-SEM-HISTORICO-PROPRIO`.
      historico: [],
    };
  }

  return {
    titulo: rotulo,
    subtitulo: `${conta(r.contaDebito)}  ->  ${conta(r.contaCredito)}`,
    selos: [{ texto: "Parametrizado", tom: "ok" }],
    dados: [
      {
        rotulo: "Conta de débito",
        valor: conta(r.contaDebito),
        nota: "A perna devedora do lançamento que este evento produz.",
      },
      {
        rotulo: "Conta de crédito",
        valor: conta(r.contaCredito),
        nota: "A contrapartida. As duas pernas são do subsistema patrimonial.",
      },
      { rotulo: "Parametrizado em", valor: diaCivilBr(r.criadoEm), tipo: "data" },
      { rotulo: "Parametrizado por", valor: r.criadoPor },
    ],
    historico: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AS OPÇÕES — chaveadas pelo NOME DO CAMPO do descritor
//
// ⚠️ AS DUAS PERNAS COMPARTILHAM A MESMA CONSULTA, e não duas. `contaDebitoId` e
// `contaCreditoId` aceitam exatamente o mesmo conjunto — analíticas das classes 1 a 4 —, e
// a diferença entre elas é o PAPEL no lançamento, não o universo. Duas consultas iguais
// derivariam no dia em que alguém corrigisse só uma.
// ═══════════════════════════════════════════════════════════════════════════

export async function opcoesDosRoteiros(): Promise<OpcoesDoCadastro> {
  const contas = await cliente().contaPcasp.findMany({
    where: {
      analitica: true,
      OR: ["1", "2", "3", "4"].map((c) => ({ codigo: { startsWith: `${c}.` } })),
    },
    select: { id: true, codigo: true, nome: true },
    orderBy: { codigo: "asc" },
    // ⚠️ O TETO COBRE AS QUATRO CLASSES INTEIRAS. No plano oficial do TCE-PB elas somam
    // cerca de 4.400 analíticas; um teto abaixo disso truncaria em silêncio, e a conta que
    // o contador procura simplesmente não estaria na lista — sem erro e sem aviso.
    take: 6000,
  });

  const opcoes = contas.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.nome}` }));
  return {
    contaDebitoId: opcoes,
    contaCreditoId: opcoes,
  };
}
