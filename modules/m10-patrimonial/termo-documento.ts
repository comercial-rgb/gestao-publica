import { createHash } from "node:crypto";
import { diaCivilBr } from "../../packages/datas/index.js";
import { formatarDocumento } from "../../packages/documento/index.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { estadoDoBem } from "./gestao-do-bem.js";
import { valorContabilDoBem } from "./patrimonio.js";

/**
 * O DOCUMENTO DO TERMO PATRIMONIAL (V3 pacote 2, unidade 5; sessão noturna V4, §5 — achado A06;
 * TR 5.19.36 e 5.19.37).
 *
 * ═══ O QUE ISTO É ═══
 * A composição do termo — cabeçalho, a relação dos bens com o que cada um vale e onde está, a
 * declaração e as linhas de assinatura — como DADO. Quem transforma em PDF é o motor de
 * `lib/pdf` (a rota autenticada); o módulo não conhece PDF nem HTML.
 *
 * ═══ TRÊS DOCUMENTOS DISTINTOS (V4) ═══
 *   1. O DOCUMENTO EMITIDO — composto na emissão, DENTRO da transação que cria o termo, e
 *      congelado em `TermoPatrimonial.emissao` (dados + `modeloDaEmissao` + sha256 do JSON
 *      canônico). A segunda via é ESTE conteúdo, byte a byte nos dados: o bem mudou de sala, foi
 *      depreciado, a pessoa mudou de nome — o termo emitido não muda.
 *   2. A POSIÇÃO PATRIMONIAL ATUAL — outro documento, com data própria, que lê o acervo de hoje
 *      para os mesmos bens e DIZ que não é o termo.
 *   3. O ARTEFATO ASSINADO — o termo digitalizado, anexado ao termo (`Anexo.termoPatrimonialId`),
 *      preservado com sha256 e conferido na entrega pelo M22.
 *
 * ⚠️ O QUE A V3 FAZIA, E ERA ERRADO: compunha na impressão com nome, valor e localização atuais
 * sob a data do termo antigo, e o rodapé avisava. O aviso não fazia daquilo uma segunda via.
 *
 * Termos emitidos ANTES da V4 não têm emissão congelada: `documentoDoTermo` os compõe agora e
 * marca, na nota, que o documento é a posição atual — nunca finge segunda via.
 */

export const MODELO_DO_TERMO = "termo-patrimonial/1";

export interface SecaoDoTermo {
  readonly titulo?: string;
  readonly colunas: readonly { readonly rotulo: string; readonly alinhamento?: "esquerda" | "direita" }[];
  readonly linhas: readonly (readonly string[])[];
}

export interface DocumentoDoTermo {
  readonly ente: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly periodo: string;
  readonly secoes: readonly SecaoDoTermo[];
  readonly notas: readonly string[];
  /** O número do termo, seguro para nome de arquivo. */
  readonly numeroArquivo: string;
}

/** O documento com a sua proveniência — para a tela dizer o que está mostrando. */
export interface DocumentoDoTermoLido {
  readonly documento: DocumentoDoTermo;
  /** EMITIDO: a segunda via do congelado; ATUAL: a posição de hoje; SEM_EMISSAO: termo anterior à V4, composto agora. */
  readonly via: "EMITIDO" | "ATUAL" | "SEM_EMISSAO";
  readonly sha256: string;
  readonly modelo: string;
  readonly emitidoEm: Date | null;
}

const ROTULO_DO_TIPO = { RESPONSABILIDADE: "Termo de responsabilidade", BAIXA: "Termo de baixa" } as const;

/**
 * O JSON CANÔNICO: chaves de objeto em ordem lexicográfica, recursivamente; arrays na ordem em
 * que vieram (a ordem das linhas TEM significado). O JSONB do Postgres reordena as chaves ao
 * gravar — sem a canonização, o sha256 do que se lê nunca bateria com o do que se gravou.
 */
export function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  if (valor !== null && typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor);
}

/** O sha256 do JSON canônico do documento — o que prova, depois, que a segunda via é a emissão. */
export function sha256DoDocumento(doc: DocumentoDoTermo): string {
  return createHash("sha256").update(jsonCanonico(doc), "utf8").digest("hex");
}

/** O recorte do termo (TR 5.19.36): individual, setorial ou por responsável. */
export function recorteDoTermo(t: { readonly tipo: "RESPONSABILIDADE" | "BAIXA"; readonly setorId: string | null; readonly itens: number }): string {
  if (t.setorId !== null) return "setorial";
  if (t.tipo === "RESPONSABILIDADE") return t.itens === 1 ? "individual" : "por responsável";
  return t.itens === 1 ? "individual" : "do acervo";
}

export interface DadosDoTermoParaCompor {
  readonly numero: string;
  readonly tipo: "RESPONSABILIDADE" | "BAIXA";
  readonly data: Date;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly setorId: string | null;
  readonly responsavelId: string | null;
  readonly bensId: readonly string[];
}

/**
 * COMPÕE o documento a partir dos DADOS do termo e do acervo COMO ESTÁ AGORA — a leitura que a
 * emissão congela (chamada DENTRO da transação que cria o termo, antes de a linha existir) e que
 * a posição atual repete com data própria. Só lê.
 */
export async function comporTermo(
  tx: Tx,
  termo: DadosDoTermoParaCompor,
  ente: string,
  p: { readonly como: "EMISSAO" | "POSICAO_ATUAL"; readonly agora?: Date } = { como: "EMISSAO" }
): Promise<DocumentoDoTermo> {
  const agora = p.agora ?? new Date();
  const responsavelCru =
    termo.responsavelId === null
      ? null
      : await tx.pessoa.findUnique({
          where: { id: termo.responsavelId },
          select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
        });
  const responsavel =
    responsavelCru === null
      ? null
      : { nome: responsavelCru.versoes[0]?.nome ?? responsavelCru.documento, documento: formatarDocumento(responsavelCru.documento) };
  const setor = termo.setorId === null ? null : await tx.setor.findUnique({ where: { id: termo.setorId }, select: { codigo: true, nome: true } });
  const bens = await tx.bemPatrimonial.findMany({
    where: { id: { in: [...termo.bensId] } },
    select: { id: true, numeroTombamento: true, descricao: true, classeDeBens: { select: { codigo: true, descricao: true } } },
  });
  const porId = new Map(bens.map((b) => [b.id, b]));

  const linhas: string[][] = [];
  let somaCentavos = 0n;
  for (const bemId of termo.bensId) {
    const b = porId.get(bemId);
    if (b === undefined) throw new Error(`Bem patrimonial ${bemId} não existe — o termo não pode relacioná-lo.`);
    const [valor, estado] = await Promise.all([valorContabilDoBem(tx, b.id), estadoDoBem(tx, b.id)]);
    const localizacao =
      estado.localizacaoId === null
        ? "—"
        : await tx.localizacaoFisica.findUnique({ where: { id: estado.localizacaoId }, select: { codigo: true, descricao: true } }).then((l) => (l === null ? "—" : `${l.codigo} — ${l.descricao}`));
    const v = valor.toFixed(2);
    somaCentavos += BigInt(v.replace(".", ""));
    linhas.push([b.numeroTombamento, b.descricao, `${b.classeDeBens.codigo} — ${b.classeDeBens.descricao}`, localizacao, v]);
  }
  const total = `${somaCentavos / 100n}.${String(somaCentavos % 100n).padStart(2, "0")}`;
  linhas.push(["", "", "", "Total", total]);

  const recorte = recorteDoTermo({ tipo: termo.tipo, setorId: termo.setorId, itens: termo.bensId.length });
  const responsavelTexto = responsavel === null ? "—" : `${responsavel.nome} (${responsavel.documento})`;
  const setorTexto = setor === null ? "" : ` · Setor: ${setor.codigo} — ${setor.nome}`;
  const subtituloBase =
    termo.tipo === "RESPONSABILIDADE" ? `Responsável: ${responsavelTexto}${setorTexto}` : `Baixa do acervo${setorTexto}`;

  if (p.como === "POSICAO_ATUAL") {
    return {
      ente,
      titulo: `Posição patrimonial atual — bens do ${ROTULO_DO_TIPO[termo.tipo].toLowerCase()} nº ${termo.numero}`,
      subtitulo: `${subtituloBase} · recorte ${recorte}`,
      periodo: `Posição em ${diaCivilBr(agora)} (o termo é de ${diaCivilBr(termo.data)})`,
      secoes: [{ titulo: "Bens — como estão hoje", colunas: COLUNAS, linhas }],
      notas: [
        `Este documento NÃO é o termo nº ${termo.numero} nem uma segunda via dele: é a leitura do acervo em ${diaCivilBr(agora)} para os mesmos bens — valor contábil e localização de hoje.`,
        `O termo emitido, com os valores e localizações da emissão, é o documento próprio; a segunda via reproduz a emissão.`,
      ],
      numeroArquivo: `${termo.numero}-posicao-atual`.replace(/[^A-Za-z0-9._-]+/g, "_"),
    };
  }

  const notas =
    termo.tipo === "RESPONSABILIDADE"
      ? [
          `Declaro ter recebido os bens acima relacionados, em ${diaCivilBr(termo.data)}, responsabilizando-me pela guarda, conservação e uso exclusivo no serviço público, e por comunicar ao setor de patrimônio qualquer movimentação, dano ou extravio.`,
          `Assinatura do responsável: ________________________________  ${responsavelTexto === "—" ? "" : responsavelTexto}`,
          `Assinatura do setor de patrimônio: ________________________________`,
          `Emitido por ${termo.criadoPor} em ${diaCivilBr(termo.criadoEm)}. Valores contábeis e localizações são os da emissão; a posição atual é outro documento.`,
        ]
      : [
          `Os bens acima relacionados foram baixados do acervo patrimonial em ${diaCivilBr(termo.data)}, conforme o motivo registrado em cada movimento de baixa.`,
          `Assinatura do setor de patrimônio: ________________________________`,
          `Assinatura da comissão/autoridade: ________________________________`,
          `Emitido por ${termo.criadoPor} em ${diaCivilBr(termo.criadoEm)}. Valores contábeis e localizações são os da emissão; a posição atual é outro documento.`,
        ];

  return {
    ente,
    titulo: `${ROTULO_DO_TIPO[termo.tipo]} nº ${termo.numero}`,
    subtitulo: `${subtituloBase} · recorte ${recorte}`,
    periodo: `Data do termo: ${diaCivilBr(termo.data)}`,
    secoes: [{ titulo: "Bens", colunas: COLUNAS, linhas }],
    notas,
    numeroArquivo: termo.numero.replace(/[^A-Za-z0-9._-]+/g, "_"),
  };
}

/** A composição de um termo que JÁ EXISTE, a partir da linha dele. */
export async function composicaoDoTermo(
  tx: Tx,
  termoId: string,
  ente: string,
  p: { readonly como: "EMISSAO" | "POSICAO_ATUAL"; readonly agora?: Date } = { como: "EMISSAO" }
): Promise<DocumentoDoTermo> {
  const termo = await tx.termoPatrimonial.findUnique({
    where: { id: termoId },
    select: { numero: true, tipo: true, data: true, criadoEm: true, criadoPor: true, setorId: true, responsavelId: true, itens: { select: { bemId: true }, orderBy: { criadoEm: "asc" } } },
  });
  if (termo === null) throw new Error(`Termo patrimonial ${termoId} não encontrado.`);
  return comporTermo(tx, { ...termo, bensId: termo.itens.map((i) => i.bemId) }, ente, p);
}

const COLUNAS: SecaoDoTermo["colunas"] = [
  { rotulo: "Tombamento" },
  { rotulo: "Descrição" },
  { rotulo: "Classe" },
  { rotulo: "Localização" },
  { rotulo: "Valor contábil (R$)", alinhamento: "direita" },
];

/**
 * O DOCUMENTO DO TERMO para a rota do PDF.
 *   · via "EMITIDO" (padrão): a emissão congelada — a segunda via. Termo anterior à V4 (sem
 *     emissão) é composto agora e marcado como SEM_EMISSAO, com a nota dizendo isso;
 *   · via "ATUAL": a posição patrimonial de hoje, com data própria.
 */
export async function documentoDoTermo(
  tx: Tx,
  termoId: string,
  ente: string,
  via: "EMITIDO" | "ATUAL" = "EMITIDO",
  agora?: Date
): Promise<DocumentoDoTermoLido> {
  if (via === "ATUAL") {
    const documento = await composicaoDoTermo(tx, termoId, ente, { como: "POSICAO_ATUAL", ...(agora !== undefined ? { agora } : {}) });
    return { documento, via: "ATUAL", sha256: sha256DoDocumento(documento), modelo: MODELO_DO_TERMO, emitidoEm: null };
  }
  const termo = await tx.termoPatrimonial.findUnique({
    where: { id: termoId },
    select: { emissao: true, emissaoSha256: true, modeloDaEmissao: true, emitidoEm: true },
  });
  if (termo === null) throw new Error(`Termo patrimonial ${termoId} não encontrado.`);
  if (termo.emissao !== null && termo.emissaoSha256 !== null) {
    const documento = termo.emissao as unknown as DocumentoDoTermo;
    // A INTEGRIDADE É CONFERIDA NA LEITURA: o JSON gravado tem de bater com o sha256 gravado.
    const conferido = sha256DoDocumento(documento);
    if (conferido !== termo.emissaoSha256) {
      throw new Error(
        `EMISSÃO ADULTERADA: o documento congelado do termo ${termoId} não confere com o sha256 gravado na emissão ` +
          `(${termo.emissaoSha256.slice(0, 12)}… × ${conferido.slice(0, 12)}…). A segunda via não é emitida.`
      );
    }
    return { documento, via: "EMITIDO", sha256: termo.emissaoSha256, modelo: termo.modeloDaEmissao ?? MODELO_DO_TERMO, emitidoEm: termo.emitidoEm };
  }
  const composto = await composicaoDoTermo(tx, termoId, ente, { como: "EMISSAO" });
  const documento: DocumentoDoTermo = {
    ...composto,
    notas: [
      ...composto.notas,
      `SEM EMISSÃO CONGELADA: este termo é anterior ao registro da emissão; o documento acima foi composto agora, com valores e localizações de hoje — não é a segunda via da emissão original.`,
    ],
  };
  return { documento, via: "SEM_EMISSAO", sha256: sha256DoDocumento(documento), modelo: MODELO_DO_TERMO, emitidoEm: null };
}
