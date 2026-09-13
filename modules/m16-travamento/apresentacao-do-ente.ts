import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { z } from "zod";
import { ID_DO_ENTE_UNICO } from "../m01-core-contabil/contexto-do-ente.js";
import { ACAO_DO_SERVICO } from "./acoes.js";
import { autorizar } from "./autorizacao.js";

/**
 * ═══ A APRESENTAÇÃO DO ENTE (V6 P0.1) ═══
 *
 * Como a instituição se mostra nas telas: nome de exibição, órgão, imagem, contatos, tema e
 * canais ativados. É configuração de APRESENTAÇÃO, versionada e auditada — não é o cadastro
 * fiscal do ente (`EnteConfig`), que continua sendo a fonte das remessas.
 *
 * ⚠️ APPEND-ONLY. Reconfigurar é gravar a versão N+1; a vigente é a de maior número. O
 * UNIQUE (enteId, numero) é a trava contra duas gravações concorrentes: a segunda cai na
 * constraint e é recusada nomeando, em vez de virar duas "vigentes".
 *
 * ⚠️ A IMAGEM É VALIDADA PELOS BYTES, não pela extensão nem pelo MIME declarado: PNG começa
 * com `89 50 4E 47`, JPEG com `FF D8 FF`. SVG não entra — carrega script. Nada aqui busca
 * URL: a imagem chega como bytes do formulário e é servida pela rota própria.
 */

export const TEMAS = ["PADRAO", "ALTO_CONTRASTE"] as const;
export type Tema = (typeof TEMAS)[number];
export const TETO_DA_IMAGEM = 256 * 1024;
export type MimeDaImagem = "image/png" | "image/jpeg";

/** Reconhece PNG e JPEG pela assinatura dos bytes; qualquer outra coisa é `null`. */
export function tipoDaImagem(bytes: Uint8Array): MimeDaImagem | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

const opcional = (max: number) => z.string().trim().max(max).optional();

/** Só `https:` com um domínio de verdade — e nunca é buscado pelo servidor. */
function ehEnderecoHttps(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export const zApresentacaoInput = z.object({
  nomeDeExibicao: z.string().trim().min(3, "o nome de exibição precisa de ao menos 3 caracteres").max(120),
  orgao: opcional(120),
  assinaturaDoFornecedor: opcional(120),
  contatoEmail: z.string().trim().email("e-mail de contato inválido").max(120).optional(),
  contatoTelefone: opcional(30),
  horarioDeAtendimento: opcional(120),
  sitio: z
    .string()
    .trim()
    .max(200)
    .refine(ehEnderecoHttps, "o sítio precisa ser um endereço https válido")
    .optional(),
  tema: z.enum(TEMAS),
  /** Os bytes de uma imagem nova, ou ausente. */
  imagem: z.instanceof(Uint8Array).optional(),
  /** Sem imagem nova: manter a da versão anterior (true) ou ficar sem imagem (false). */
  manterImagem: z.boolean(),
  canalTransparencia: z.boolean(),
  canalConsultaPublica: z.boolean(),
  criadoPor: z.string().min(1),
});
export type ApresentacaoInput = z.input<typeof zApresentacaoInput>;

export interface ApresentacaoVigente {
  readonly versaoId: string;
  readonly numero: number;
  readonly nomeDeExibicao: string;
  readonly orgao: string | null;
  readonly assinaturaDoFornecedor: string | null;
  readonly contatoEmail: string | null;
  readonly contatoTelefone: string | null;
  readonly horarioDeAtendimento: string | null;
  readonly sitio: string | null;
  readonly tema: Tema;
  readonly temImagem: boolean;
  readonly canalTransparencia: boolean;
  readonly canalConsultaPublica: boolean;
  readonly criadoPor: string;
  readonly criadoEm: Date;
  /** Do `EnteConfig` — o que a projeção pública pode dizer da instituição. */
  readonly ente: { readonly nome: string; readonly uf: string | null; readonly codigoIbge: string };
}

const SELECAO_SEM_BYTES = {
  id: true, numero: true, nomeDeExibicao: true, orgao: true, assinaturaDoFornecedor: true,
  contatoEmail: true, contatoTelefone: true, horarioDeAtendimento: true, sitio: true, tema: true,
  imagemMime: true, canalTransparencia: true, canalConsultaPublica: true, criadoPor: true, criadoEm: true,
} as const;

/**
 * A VERSÃO VIGENTE, ou `null` quando o ente não está semeado OU nunca foi apresentado.
 * Leitura PÚBLICA (a entrada a mostra antes do login): sem sessão, sem autorização, e por
 * isso sem bytes da imagem, sem CNPJ, sem responsáveis — só o que pode ir para a tela.
 */
export async function apresentacaoVigente(prisma: PrismaClient): Promise<ApresentacaoVigente | null> {
  const ente = await prisma.enteConfig.findUnique({
    where: { id: ID_DO_ENTE_UNICO },
    select: { nome: true, uf: true, codigoIbge: true },
  });
  if (ente === null) return null;
  const v = await prisma.versaoDaApresentacaoDoEnte.findFirst({
    where: { enteId: ID_DO_ENTE_UNICO },
    orderBy: { numero: "desc" },
    select: SELECAO_SEM_BYTES,
  });
  if (v === null) return null;
  return {
    versaoId: v.id, numero: v.numero, nomeDeExibicao: v.nomeDeExibicao, orgao: v.orgao,
    assinaturaDoFornecedor: v.assinaturaDoFornecedor, contatoEmail: v.contatoEmail, contatoTelefone: v.contatoTelefone,
    horarioDeAtendimento: v.horarioDeAtendimento, sitio: v.sitio, tema: v.tema as Tema, temImagem: v.imagemMime !== null,
    canalTransparencia: v.canalTransparencia, canalConsultaPublica: v.canalConsultaPublica,
    criadoPor: v.criadoPor, criadoEm: v.criadoEm,
    ente: { nome: ente.nome, uf: ente.uf, codigoIbge: ente.codigoIbge },
  };
}

/**
 * REGISTRAR UMA VERSÃO NOVA da apresentação. Exige CONFIGURAR_APRESENTACAO_DO_ENTE e o ente
 * semeado (fail-closed: sem `EnteConfig` não há o que apresentar — e a recusa diz o que semear).
 */
export async function registrarApresentacaoDoEnte(
  prisma: PrismaClient,
  input: ApresentacaoInput
): Promise<{ readonly versaoId: string; readonly numero: number }> {
  const d = zApresentacaoInput.parse(input);
  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.registrarApresentacaoDoEnte);

  const ente = await prisma.enteConfig.findUnique({ where: { id: ID_DO_ENTE_UNICO }, select: { id: true } });
  if (ente === null) {
    throw new Error(
      "ENTE NÃO CONFIGURADO: a apresentação é do ente, e o `EnteConfig` não está semeado. " +
        "Semeie a identificação do ente (IBGE, CNPJ, tribunal) com quem responde por ela; até lá a entrada mostra a identidade neutra de desenvolvimento."
    );
  }

  let imagem: { readonly mime: MimeDaImagem; readonly bytes: Uint8Array } | null = null;
  if (d.imagem !== undefined && d.imagem.length > 0) {
    const mime = tipoDaImagem(d.imagem);
    if (mime === null) {
      throw new Error("IMAGEM RECUSADA: só PNG ou JPEG, reconhecidos pelos bytes do arquivo. SVG e outros formatos não entram.");
    }
    if (d.imagem.length > TETO_DA_IMAGEM) {
      throw new Error(`IMAGEM RECUSADA: ${d.imagem.length} bytes; o teto é ${TETO_DA_IMAGEM} (256 KiB). Reduza a imagem antes.`);
    }
    imagem = { mime, bytes: d.imagem };
  }

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.versaoDaApresentacaoDoEnte.findFirst({
      where: { enteId: ente.id },
      orderBy: { numero: "desc" },
      select: { numero: true, imagemMime: true, imagem: true },
    });
    const numero = (anterior?.numero ?? 0) + 1;
    const herdada =
      imagem === null && d.manterImagem && anterior !== null && anterior.imagemMime !== null && anterior.imagem !== null
        ? { mime: anterior.imagemMime as MimeDaImagem, bytes: anterior.imagem }
        : null;
    const final = imagem ?? herdada;
    try {
      const v = await tx.versaoDaApresentacaoDoEnte.create({
        data: {
          enteId: ente.id,
          numero,
          nomeDeExibicao: d.nomeDeExibicao,
          orgao: vazioParaNulo(d.orgao),
          assinaturaDoFornecedor: vazioParaNulo(d.assinaturaDoFornecedor),
          contatoEmail: vazioParaNulo(d.contatoEmail),
          contatoTelefone: vazioParaNulo(d.contatoTelefone),
          horarioDeAtendimento: vazioParaNulo(d.horarioDeAtendimento),
          sitio: vazioParaNulo(d.sitio),
          tema: d.tema,
          imagemMime: final?.mime ?? null,
          imagem: final?.bytes ?? null,
          canalTransparencia: d.canalTransparencia,
          canalConsultaPublica: d.canalConsultaPublica,
          criadoPor: d.criadoPor,
        },
        select: { id: true, numero: true },
      });
      return { versaoId: v.id, numero: v.numero };
    } catch (e) {
      if (e instanceof Error && /Unique constraint/i.test(e.message)) {
        throw new Error(
          `CONCORRÊNCIA: outra configuração da apresentação foi gravada ao mesmo tempo (versão ${numero} já existe). ` +
            "Recarregue a tela, confira a versão vigente e repita se ainda fizer sentido. Nada foi gravado."
        );
      }
      throw e;
    }
  });
}

function vazioParaNulo(s: string | undefined): string | null {
  return s === undefined || s === "" ? null : s;
}

/** A IMAGEM VIGENTE (bytes + mime), para a rota que a serve. `null` sem imagem. */
export async function imagemDaApresentacaoVigente(
  prisma: PrismaClient
): Promise<{ readonly mime: MimeDaImagem; readonly bytes: Uint8Array; readonly numero: number } | null> {
  const v = await prisma.versaoDaApresentacaoDoEnte.findFirst({
    where: { enteId: ID_DO_ENTE_UNICO },
    orderBy: { numero: "desc" },
    select: { numero: true, imagemMime: true, imagem: true },
  });
  if (v === null || v.imagemMime === null || v.imagem === null) return null;
  return { mime: v.imagemMime as MimeDaImagem, bytes: v.imagem, numero: v.numero };
}

/** O HISTÓRICO das versões (sem bytes) — a tela administrativa mostra quem mudou o quê e quando. */
export async function historicoDaApresentacao(
  prisma: PrismaClient
): Promise<readonly { readonly numero: number; readonly nomeDeExibicao: string; readonly tema: string; readonly temImagem: boolean; readonly criadoPor: string; readonly criadoEm: Date }[]> {
  const versoes = await prisma.versaoDaApresentacaoDoEnte.findMany({
    where: { enteId: ID_DO_ENTE_UNICO },
    orderBy: { numero: "desc" },
    select: { numero: true, nomeDeExibicao: true, tema: true, imagemMime: true, criadoPor: true, criadoEm: true },
  });
  return versoes.map((v) => ({ numero: v.numero, nomeDeExibicao: v.nomeDeExibicao, tema: v.tema, temImagem: v.imagemMime !== null, criadoPor: v.criadoPor, criadoEm: v.criadoEm }));
}
