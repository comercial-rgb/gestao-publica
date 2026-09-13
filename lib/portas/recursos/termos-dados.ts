import { diaCivilBr, inicioDoDiaCivil } from "../../../packages/datas/index.js";
import type { Prisma } from "../../../prisma/generated/client/client.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import { emitirTermoPatrimonial } from "../../../modules/m10-patrimonial/gestao-do-bem.js";
import { documentoDoTermo, type DocumentoDoTermoLido } from "../../../modules/m10-patrimonial/termo-documento.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { ENTE } from "../../pdf/ente.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import { opcoesDoAcervo } from "./acervo-dados.js";
import type { DetalheLido, OpcoesDoCadastro, PaginaDoMolde } from "./dados";

/**
 * ═══ OS DADOS DOS TERMOS PATRIMONIAIS — M10, V3 pacote 2, unidade 5 ═══
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Termo de responsabilidade sem responsável, número
 * repetido e o registro do movimento são decididos no domínio (`emitirTermoPatrimonial`),
 * e a recusa sobe COMO VEIO. A única resolução desta porta é a dos TOMBAMENTOS → ids, e ela
 * recusa nomeando os que não existem antes de chamar o serviço.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | undefined => (t(c, k) === "" ? undefined : t(c, k));

const ROTULO_DO_TIPO: Readonly<Record<string, string>> = { RESPONSABILIDADE: "Responsabilidade", BAIXA: "Baixa" };

function nomeDoResponsavel(r: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] } | null): string {
  if (r === null) return "—";
  return `${r.versoes[0]?.nome ?? r.documento} (${formatarDocumento(r.documento)})`;
}

export async function listarTermos(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const tipo = c.filtros["tipo"] ?? "";
  // Tipado pelo input do Prisma: com `exactOptionalPropertyTypes`, um objeto montado por
  // spreads condicionais não é aceito como `WhereInput` — as chaves opcionais do literal
  // saem como `string`, e não como o enum.
  const where: Prisma.TermoPatrimonialWhereInput = {};
  if (tipo === "RESPONSABILIDADE" || tipo === "BAIXA") where.tipo = tipo;
  if (q !== "") {
    const digitos = q.replace(/\D/g, "");
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { responsavel: { versoes: { some: { nome: { contains: q, mode: "insensitive" } } } } },
      ...(digitos.length >= 3 ? [{ responsavel: { documento: { contains: digitos } } }] : []),
    ];
  }
  const ordem: Prisma.TermoPatrimonialOrderByWithRelationInput = c.ordem === "numero" ? { numero: c.direcao } : { data: c.direcao };
  const [total, linhas] = await Promise.all([
    prisma.termoPatrimonial.count({ where }),
    prisma.termoPatrimonial.findMany({
      where,
      orderBy: ordem,
      skip: (c.pagina - 1) * TAMANHO_DE_PAGINA,
      take: TAMANHO_DE_PAGINA,
      select: {
        id: true, numero: true, tipo: true, data: true,
        responsavel: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } },
        setor: { select: { codigo: true, nome: true } },
        _count: { select: { itens: true } },
      },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((x) => ({
      id: x.id,
      numero: x.numero,
      tipo: ROTULO_DO_TIPO[x.tipo] ?? x.tipo,
      responsavel: nomeDoResponsavel(x.responsavel),
      setor: x.setor === null ? "—" : `${x.setor.codigo} — ${x.setor.nome}`,
      data: diaCivilBr(x.data),
      itens: String(x._count.itens),
    })),
  };
}

export async function verTermo(id: string): Promise<DetalheLido | null> {
  const x = await cliente().termoPatrimonial.findUnique({
    where: { id },
    select: {
      numero: true, tipo: true, data: true, criadoEm: true, criadoPor: true,
      responsavel: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } },
      setor: { select: { codigo: true, nome: true } },
      documento: { select: { id: true } },
      emissaoSha256: true, modeloDaEmissao: true, emitidoEm: true,
      anexos: { select: { id: true } },
      itens: {
        select: { id: true, criadoEm: true, criadoPor: true, bem: { select: { id: true, numeroTombamento: true, descricao: true, classeDeBens: { select: { codigo: true, descricao: true } } } } },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (x === null) return null;
  return {
    titulo: `${ROTULO_DO_TIPO[x.tipo] ?? x.tipo} nº ${x.numero}`,
    subtitulo: x.tipo === "RESPONSABILIDADE" ? `Responsável: ${nomeDoResponsavel(x.responsavel)}` : "Baixa do acervo",
    selos: [
      { texto: ROTULO_DO_TIPO[x.tipo] ?? x.tipo, tom: "neutro" },
      { texto: `${x.itens.length} bem(ns)`, tom: "neutro" },
      ...(x.anexos.length === 0 && x.documento === null ? [{ texto: "sem termo assinado anexado", tom: "alerta" as const }] : [{ texto: "termo assinado anexado", tom: "ok" as const }]),
      ...(x.emissaoSha256 === null ? [{ texto: "sem emissão congelada (anterior ao registro da emissão)", tom: "alerta" as const }] : [{ texto: "emissão congelada", tom: "ok" as const }]),
    ],
    dados: [
      { rotulo: "Número", valor: x.numero },
      { rotulo: "Tipo", valor: ROTULO_DO_TIPO[x.tipo] ?? x.tipo },
      { rotulo: "Responsável", valor: nomeDoResponsavel(x.responsavel) },
      { rotulo: "Setor", valor: x.setor === null ? "— (termo do ente)" : `${x.setor.codigo} — ${x.setor.nome}` },
      { rotulo: "Data do termo", valor: diaCivilBr(x.data), tipo: "data", nota: "A data do fato: é a data do movimento registrado em cada bem." },
      { rotulo: "Emitido em", valor: diaCivilBr(x.criadoEm), tipo: "data" },
      { rotulo: "Emitido por", valor: x.criadoPor },
      x.emissaoSha256 === null
        ? { rotulo: "Emissão congelada", valor: "Não há", nota: "Termo anterior ao registro da emissão: o PDF é composto agora, com valores e localizações de hoje, e diz isso." }
        : { rotulo: "Emissão congelada", valor: `${x.modeloDaEmissao ?? ""} · sha256 ${x.emissaoSha256.slice(0, 16)}…`, nota: `Gravada em ${x.emitidoEm === null ? "—" : diaCivilBr(x.emitidoEm)} com o termo. A segunda via reproduz exatamente esta emissão; a integridade é conferida a cada leitura.` },
      {
        rotulo: "Movimento registrado",
        valor: x.tipo === "RESPONSABILIDADE" ? "Responsável, em cada bem" : "Situação BAIXADO, em cada bem",
        nota: "Emitir o termo é o próprio ato: o termo e a derivação do bem dizem a mesma coisa.",
      },
    ],
    historico: x.itens.map((i) => ({
      id: i.id,
      oQue: `${i.bem.numeroTombamento} — ${i.bem.descricao}`,
      quando: diaCivilBr(x.data),
      registradoEm: diaCivilBr(i.criadoEm),
      por: i.criadoPor,
      motivo: `${i.bem.classeDeBens.codigo} — ${i.bem.classeDeBens.descricao}`,
      href: `/patrimonio/bens-patrimoniais/${i.bem.id}`,
      hrefRotulo: "abrir o bem",
    })),
  };
}

export async function opcoesDosTermos(): Promise<OpcoesDoCadastro> {
  const [acervo, setores] = await Promise.all([
    opcoesDoAcervo(),
    cliente().setor.findMany({ where: { ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" }, take: 500 }),
  ]);
  return {
    responsavelId: acervo["responsavelId"] ?? [],
    setorId: setores.map((s) => ({ valor: s.id, rotulo: `${s.codigo} — ${s.nome}` })),
  };
}

/** Tombamentos → ids. Recusa nomeando os que não existem — antes de qualquer escrita. */
async function bensPelosTombamentos(texto: string): Promise<readonly string[]> {
  const tombamentos = [...new Set(texto.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s !== ""))];
  if (tombamentos.length === 0) throw new Error("Informe ao menos um tombamento — um termo sem bem não entrega nada a ninguém. Nada foi gravado.");
  const bens = await cliente().bemPatrimonial.findMany({ where: { numeroTombamento: { in: tombamentos } }, select: { id: true, numeroTombamento: true } });
  const achados = new Map(bens.map((b) => [b.numeroTombamento, b.id]));
  const faltam = tombamentos.filter((n) => !achados.has(n));
  if (faltam.length > 0) {
    throw new Error(`TOMBAMENTO INEXISTENTE: ${faltam.join(", ")} não corresponde(m) a bem nenhum do acervo. Confira e tente de novo. Nada foi gravado.`);
  }
  return tombamentos.map((n) => achados.get(n) as string);
}

export async function criarTermo(c: Campos): Promise<void> {
  const bensId = await bensPelosTombamentos(t(c, "tombamentos"));
  const tipo = t(c, "tipo") === "BAIXA" ? "BAIXA" : "RESPONSABILIDADE";
  await comEscritaAutenticada("EMITIR_TERMO_PATRIMONIAL", (criadoPor) =>
    emitirTermoPatrimonial(cliente(), {
      numero: t(c, "numero"),
      tipo,
      ...(opcional(c, "responsavelId") !== undefined ? { responsavelId: t(c, "responsavelId") } : {}),
      ...(opcional(c, "setorId") !== undefined ? { setorId: t(c, "setorId") } : {}),
      data: inicioDoDiaCivil(t(c, "data")),
      bensId: [...bensId],
      ente: ENTE,
      criadoPor,
    })
  );
}

/** O documento para o PDF — `null` quando o termo não existe. `via` "atual" = a posição de hoje. */
export async function documentoDoTermoPara(id: string, via: "EMITIDO" | "ATUAL" = "EMITIDO"): Promise<DocumentoDoTermoLido | null> {
  try {
    return await documentoDoTermo(cliente(), id, ENTE, via);
  } catch (e) {
    if (e instanceof Error && /não encontrado/.test(e.message)) return null;
    throw e;
  }
}
