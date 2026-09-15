import { CANAIS, PRODUTO, ambienteDeExecucao, identidadeNeutra, rotuloDoAmbiente, versaoLegivel, type Ambiente, type Canal, type IdentidadeDaTela } from "../identidade/produto";
import {
  apresentacaoVigente,
  historicoDaApresentacao,
  imagemDaApresentacaoVigente,
  registrarApresentacaoDoEnte,
  TEMAS,
  type ApresentacaoInput,
  type ApresentacaoVigente,
  type Tema,
  nomeDoEnteNosDocumentos,
} from "../../modules/m16-travamento/apresentacao-do-ente.js";

export { TEMAS };
export type { Tema };
import { ID_DO_ENTE_UNICO } from "../../modules/m01-core-contabil/contexto-do-ente.js";
import { cliente } from "./cliente";
import { exigirLeitura } from "./molde";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ A PORTA DA IDENTIDADE (V6 P0.1) ═══
 *
 * Duas projeções, e a diferença entre elas é o ponto:
 *   · `identidadePublica()` — o que a tela de entrada, o shell e os portais mostram: produto,
 *     ambiente, versão legível e a apresentação do ente. SEM sessão. Nunca inclui credencial,
 *     vínculo, parâmetro fiscal, CNPJ de responsável ou dado pessoal.
 *   · `lerApresentacaoAdmin()` — a tela administrativa: a vigente, o histórico e os dados do
 *     `EnteConfig` pertinentes. Exige CONSULTAR_ADMINISTRACAO.
 *
 * ⚠️ QUAL ENTE: o da IMPLANTAÇÃO — o banco que este processo foi configurado para usar
 * (`DATABASE_URL`), vinculado no deploy. Host, query string, cookie ou campo de formulário
 * não escolhem ente nem banco. Sem `EnteConfig` semeado, a identidade é a NEUTRA de
 * desenvolvimento, com a pendência nomeada para o administrador — nunca uma prefeitura ao acaso.
 */

export interface IdentidadePublica {
  readonly produto: { readonly nome: string; readonly descricao: string; readonly sigla: string };
  readonly ambiente: Ambiente;
  /** "Ambiente de demonstração" etc.; `null` em produção. */
  readonly rotuloDoAmbiente: string | null;
  /** Sete caracteres do commit do build, ou `null` fora de build versionado. */
  readonly versao: string | null;
  /** A instituição, ou `null` quando não há apresentação configurada. */
  readonly ente: {
    readonly nomeDeExibicao: string;
    readonly orgao: string | null;
    readonly uf: string | null;
    readonly temImagem: boolean;
    /** A URL da imagem vigente (rota própria, cacheável por versão). */
    readonly imagemHref: string | null;
    readonly contatoEmail: string | null;
    readonly contatoTelefone: string | null;
    readonly horarioDeAtendimento: string | null;
    readonly sitio: string | null;
    readonly tema: Tema;
  } | null;
  readonly assinaturaDoFornecedor: string | null;
  /** Os canais que EXISTEM e estão ATIVADOS — só estes ganham link na entrada. */
  readonly canais: readonly (Canal & { readonly href: string })[];
  /** Por que a identidade está neutra, quando está — para o administrador, não para o público. */
  readonly pendencia: "ENTE_NAO_SEMEADO" | "APRESENTACAO_NAO_CONFIGURADA" | "BANCO_INDISPONIVEL" | null;
}

function base(): Pick<IdentidadePublica, "produto" | "ambiente" | "rotuloDoAmbiente" | "versao"> {
  const ambiente = ambienteDeExecucao();
  return { produto: PRODUTO, ambiente, rotuloDoAmbiente: rotuloDoAmbiente(ambiente), versao: versaoLegivel() };
}

function canaisAtivos(v: ApresentacaoVigente | null): readonly (Canal & { readonly href: string })[] {
  const ativos = new Set<Canal["id"]>(["gestao-interna"]);
  if (v?.canalTransparencia === true) ativos.add("transparencia");
  if (v?.canalConsultaPublica === true) ativos.add("consulta-publica");
  return CANAIS.filter((c): c is Canal & { readonly href: string } => c.href !== null && ativos.has(c.id));
}

/** A projeção PÚBLICA e mínima. Sem sessão. Falha de banco vira identidade neutra com pendência, não 500. */
export async function identidadePublica(): Promise<IdentidadePublica> {
  const b = base();
  let vigente: ApresentacaoVigente | null;
  let enteSemeado: boolean;
  try {
    const prisma = cliente();
    vigente = await apresentacaoVigente(prisma);
    enteSemeado = vigente !== null || (await prisma.enteConfig.findUnique({ where: { id: ID_DO_ENTE_UNICO }, select: { id: true } })) !== null;
  } catch {
    return { ...b, ente: null, assinaturaDoFornecedor: null, canais: canaisAtivos(null), pendencia: "BANCO_INDISPONIVEL" };
  }
  if (vigente === null) {
    return {
      ...b,
      ente: null,
      assinaturaDoFornecedor: null,
      canais: canaisAtivos(null),
      pendencia: enteSemeado ? "APRESENTACAO_NAO_CONFIGURADA" : "ENTE_NAO_SEMEADO",
    };
  }
  return {
    ...b,
    ente: {
      nomeDeExibicao: vigente.nomeDeExibicao,
      orgao: vigente.orgao,
      uf: vigente.ente.uf,
      temImagem: vigente.temImagem,
      imagemHref: vigente.temImagem ? `/identidade/imagem?v=${vigente.numero}` : null,
      contatoEmail: vigente.contatoEmail,
      contatoTelefone: vigente.contatoTelefone,
      horarioDeAtendimento: vigente.horarioDeAtendimento,
      sitio: vigente.sitio,
      tema: vigente.tema,
    },
    assinaturaDoFornecedor: vigente.assinaturaDoFornecedor,
    canais: canaisAtivos(vigente),
    pendencia: null,
  };
}

/**
 * O NOME DO ENTE PARA OS DOCUMENTOS NOVOS — "Nome de exibição — UF". Sem apresentação
 * configurada, o nome oficial do `EnteConfig`; sem ente, a frase que diz isso — um PDF que
 * saísse em nome de ninguém, sem dizer, seria pior que um que nomeia a falta.
 *
 * ⚠️ Um documento EMITIDO congela este texto no seu JSON (M10 `termo-documento`); a segunda
 * via lê o JSON, não esta função. Reconfigurar a apresentação não reescreve o que já saiu.
 */
export async function nomeDoEnteParaDocumentos(): Promise<string> {
  return nomeDoEnteNosDocumentos(cliente());
}

/** A imagem vigente, para `app/identidade/imagem/route.ts`. Pública. */
export async function imagemInstitucional(): Promise<{ readonly mime: string; readonly bytes: Uint8Array; readonly numero: number } | null> {
  return imagemDaApresentacaoVigente(cliente());
}

export interface ApresentacaoAdmin {
  readonly ente: { readonly nome: string; readonly uf: string | null; readonly codigoIbge: string } | null;
  readonly vigente: ApresentacaoVigente | null;
  readonly historico: Awaited<ReturnType<typeof historicoDaApresentacao>>;
}

/** A tela administrativa. Exige CONSULTAR_ADMINISTRACAO. */
export async function lerApresentacaoAdmin(): Promise<ApresentacaoAdmin> {
  await exigirLeitura("CONSULTAR_ADMINISTRACAO");
  const prisma = cliente();
  const [ente, vigente, historico] = await Promise.all([
    prisma.enteConfig.findUnique({ where: { id: ID_DO_ENTE_UNICO }, select: { nome: true, uf: true, codigoIbge: true } }),
    apresentacaoVigente(prisma),
    historicoDaApresentacao(prisma),
  ]);
  return { ente, vigente, historico };
}

/** Grava uma versão nova. Exige CONFIGURAR_APRESENTACAO_DO_ENTE; auditada pelo envelope do comando. */
export async function configurarApresentacaoAdmin(
  input: Omit<ApresentacaoInput, "criadoPor">
): Promise<{ readonly versaoId: string; readonly numero: number }> {
  return comEscritaAutenticada("CONFIGURAR_APRESENTACAO_DO_ENTE", async (criadoPor) =>
    registrarApresentacaoDoEnte(cliente(), { ...input, criadoPor })
  );
}

/** A identidade como dado puro para as ilhas client (sidebar, rodapé). */
export function paraATela(pub: IdentidadePublica): IdentidadeDaTela {
  const neutra = identidadeNeutra();
  if (pub.ente === null) return { ...neutra, rotuloDoAmbiente: pub.rotuloDoAmbiente, versao: pub.versao };
  return {
    ...neutra,
    enteNome: pub.ente.nomeDeExibicao,
    enteOrgao: pub.ente.orgao,
    enteUf: pub.ente.uf,
    imagemHref: pub.ente.imagemHref,
    rotuloDoAmbiente: pub.rotuloDoAmbiente,
    versao: pub.versao,
    assinaturaDoFornecedor: pub.assinaturaDoFornecedor,
    tema: pub.ente.tema,
  };
}
