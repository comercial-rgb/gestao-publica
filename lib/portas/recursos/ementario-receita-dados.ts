import {
  cadastrarNaturezaReceita,
  hierarquiaDaNaturezaReceita,
} from "../../../modules/m04-receita/ementario.js";
import {
  parsearNaturezaReceita,
  type OrigemReceita,
  type TipoNaturezaReceita,
} from "../../../modules/m04-receita/natureza.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { PaginaDoMolde } from "./dados";

export { PortaSemBancoError };

/**
 * ═══ OS DADOS DO EMENTÁRIO DA RECEITA (M04) ═══
 *
 * ⚠️ A ORIGEM E O TIPO DA LISTA SÃO DERIVADOS DO CÓDIGO, pelo parser do M04 — não há coluna para
 * eles no model, e não pode haver (ver `modules/m04-receita/natureza.ts`). Os rótulos abaixo são
 * os nomes do rol da Portaria Interministerial STN/SOF nº 163/2001, em prosa.
 */

const ROTULO_DA_ORIGEM: Readonly<Record<OrigemReceita, string>> = {
  IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA: "Impostos, taxas e contribuições de melhoria",
  CONTRIBUICOES: "Contribuições",
  RECEITA_PATRIMONIAL: "Receita patrimonial",
  RECEITA_AGROPECUARIA: "Receita agropecuária",
  RECEITA_INDUSTRIAL: "Receita industrial",
  RECEITA_DE_SERVICOS: "Receita de serviços",
  TRANSFERENCIAS_CORRENTES: "Transferências correntes",
  OUTRAS_RECEITAS_CORRENTES: "Outras receitas correntes",
  OPERACOES_DE_CREDITO: "Operações de crédito",
  ALIENACAO_DE_BENS: "Alienação de bens",
  AMORTIZACAO_DE_EMPRESTIMOS: "Amortização de empréstimos",
  TRANSFERENCIAS_DE_CAPITAL: "Transferências de capital",
  OUTRAS_RECEITAS_DE_CAPITAL: "Outras receitas de capital",
};

const ROTULO_DO_TIPO: Readonly<Record<TipoNaturezaReceita, string>> = {
  NAO_VALORIZAVEL_AGREGADORA: "Agregadora",
  PRINCIPAL: "Principal",
  MULTAS_E_JUROS_DE_MORA: "Multas e juros de mora",
  DIVIDA_ATIVA: "Dívida ativa",
  MULTAS_E_JUROS_DE_MORA_DA_DIVIDA_ATIVA: "Multas e juros da dívida ativa",
};

/** Origem e tipo em prosa. Código legado fora do rol aparece como tal, sem derrubar a lista. */
function classificar(codigo: string): { readonly origem: string; readonly tipo: string } {
  try {
    const c = parsearNaturezaReceita(codigo);
    const intra = c.intraorcamentaria ? " (intraorçamentária)" : "";
    return { origem: `${ROTULO_DA_ORIGEM[c.origem]}${intra}`, tipo: ROTULO_DO_TIPO[c.tipo] };
  } catch {
    return { origem: "Código fora da classificação vigente", tipo: "" };
  }
}

export async function listarNaturezasDeReceita(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  // "1.1.1.8" e "1118" procuram o mesmo prefixo: a hierarquia é o código com pontos.
  const qCodigo = q.replaceAll(".", "");
  const where =
    q === ""
      ? {}
      : {
          OR: [
            ...(qCodigo !== "" && /^\d+$/.test(qCodigo) ? [{ codigo: { startsWith: qCodigo } }] : []),
            { descricao: { contains: q, mode: "insensitive" as const } },
          ],
        };
  const [total, linhas] = await Promise.all([
    prisma.naturezaReceita.count({ where }),
    prisma.naturezaReceita.findMany({
      where,
      skip: (c.pagina - 1) * TAMANHO_DE_PAGINA,
      take: TAMANHO_DE_PAGINA,
      orderBy: c.ordem === null ? { codigo: "asc" } : { [c.ordem]: c.direcao },
      select: { id: true, codigo: true, descricao: true, _count: { select: { receitasArrecadadas: true } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      codigo: hierarquiaDaNaturezaReceita(x.codigo),
      descricao: x.descricao,
      ...classificar(x.codigo),
      arrecadacoes: String(x._count.receitasArrecadadas),
    })),
  };
}

type Campos = Readonly<Record<string, string>>;

export async function criarNaturezaDeReceita(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", (criadoPor) =>
    cadastrarNaturezaReceita(cliente(), {
      codigo: (c["codigo"] ?? "").trim(),
      descricao: (c["descricao"] ?? "").trim(),
      criadoPor,
    })
  );
  return `${hierarquiaDaNaturezaReceita(r.codigo)} — ${r.descricao}`;
}

export async function semAcaoNoEmentario(acao: string): Promise<void> {
  throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
}
