import { z } from "zod";
import { Decimal } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * ═══ M34 — O CADASTRO IMOBILIÁRIO, HISTÓRICO (V7 B1) ═══
 *
 * O imóvel é a INSCRIÇÃO; o que muda é VERSÃO com vigência e motivo. Nada se reescreve: a simulação de um exercício
 * anterior encontra o cadastro como ele era naquele dia. Os vínculos com a Pessoa canônica (M19) têm papel, fração e
 * vigência, e se encerram por fato — o histórico continua legível.
 *
 * ⚠️ ESTE MÓDULO NÃO LANÇA TRIBUTO, NÃO CONSTITUI DÍVIDA E NÃO ESCREVE NO LEDGER. Ele cadastra e alimenta a
 * simulação (`simulacao.ts`). A efetivação financeira é outra unidade, com contrato próprio com o M04/M01.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const zDecimal = (casas: number) => z.string().trim().regex(new RegExp(`^\\d+(\\.\\d{1,${casas}})?$`), `Número com até ${casas} casas, ponto decimal.`);
const zChave = z.string().trim().regex(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_.]*$/, "A chave começa por letra e usa letras, números, ponto e sublinhado — é o nome que a fórmula chama.");
const br = (dia: string): string => dia.split("-").reverse().join("/");

const zAtributo = z.object({ chave: zChave, valor: zDecimal(6), descricao: z.string().trim().min(1).optional() }).strict();

export const zCadastrarImovel = z
  .object({
    inscricao: z.string().trim().min(1).max(40),
    vigenciaInicio: zDia,
    motivo: z.string().trim().min(5),
    logradouro: z.string().trim().min(3),
    numero: z.string().trim().min(1),
    bairro: z.string().trim().min(2),
    zona: z.string().trim().min(1).optional(),
    uso: z.enum(["RESIDENCIAL", "COMERCIAL", "INDUSTRIAL", "TERRITORIAL", "MISTO", "OUTRO"]),
    padraoConstrutivo: z.string().trim().min(1).optional(),
    areaDoTerreno: zDecimal(4),
    areaConstruida: zDecimal(4),
    fracaoIdeal: zDecimal(6).optional(),
    atributos: z.array(zAtributo).max(40).default([]),
    criadoPor: z.string().min(1),
  })
  .strict();
export type CadastrarImovelInput = z.input<typeof zCadastrarImovel>;

function conferirAtributos(atributos: readonly { readonly chave: string }[]): void {
  const chaves = atributos.map((a) => a.chave);
  if (new Set(chaves).size !== chaves.length) throw new Error("ATRIBUTO-REPETIDO: cada atributo do imóvel entra uma vez. Nada foi gravado.");
}

/** O imóvel nasce com a VERSÃO 1 — um cadastro sem versão não diz nada sobre nada. */
export async function cadastrarImovel(prisma: PrismaClient, input: CadastrarImovelInput): Promise<{ readonly imovelId: string; readonly versao: number }> {
  const d = zCadastrarImovel.parse(input);
  conferirAtributos(d.atributos);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarImovel, "ENTE");
      const r = await tx.imovel.create({
        data: {
          inscricao: d.inscricao, criadoPor: d.criadoPor,
          versoes: {
            create: {
              versao: 1, vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), motivo: d.motivo,
              logradouro: d.logradouro, numero: d.numero, bairro: d.bairro, zona: d.zona ?? null,
              uso: d.uso, padraoConstrutivo: d.padraoConstrutivo ?? null,
              areaDoTerreno: d.areaDoTerreno, areaConstruida: d.areaConstruida, fracaoIdeal: d.fracaoIdeal ?? null,
              criadoPor: d.criadoPor,
              atributos: { create: d.atributos.map((a) => ({ chave: a.chave, valor: a.valor, descricao: a.descricao ?? null })) },
            },
          },
        },
        select: { id: true },
      });
      return { imovelId: r.id, versao: 1 };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error(`INSCRICAO-JA-CADASTRADA: já existe imóvel com a inscrição ${d.inscricao}. Nada foi gravado.`);
    throw e;
  }
}

export const zNovaVersaoDoImovel = zCadastrarImovel.omit({ inscricao: true }).extend({ imovelId: z.string().min(1) }).strict();
export type NovaVersaoDoImovelInput = z.input<typeof zNovaVersaoDoImovel>;

/** A versão nova vale a partir da vigência; a anterior continua valendo antes dela (nada é reescrito). */
export async function novaVersaoDoImovel(prisma: PrismaClient, input: NovaVersaoDoImovelInput): Promise<{ readonly versaoId: string; readonly versao: number }> {
  const d = zNovaVersaoDoImovel.parse(input);
  conferirAtributos(d.atributos);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.novaVersaoDoImovel, "ENTE");
    const imovel = await tx.imovel.findUnique({ where: { id: d.imovelId }, select: { inscricao: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { versao: true, vigenciaInicio: true } } } });
    if (imovel === null) throw new Error("IMOVEL-INEXISTENTE: o imóvel indicado não existe. Nada foi gravado.");
    const ultima = imovel.versoes[0];
    if (ultima !== undefined && d.vigenciaInicio < diaCivil(ultima.vigenciaInicio)) {
      throw new Error(`VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE: a versão ${ultima.versao} do imóvel ${imovel.inscricao} vale desde ${diaCivilBr(ultima.vigenciaInicio)}; a nova não pode valer antes. Nada foi gravado.`);
    }
    const versao = (ultima?.versao ?? 0) + 1;
    const r = await tx.versaoDoImovel.create({
      data: {
        imovelId: d.imovelId, versao, vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), motivo: d.motivo,
        logradouro: d.logradouro, numero: d.numero, bairro: d.bairro, zona: d.zona ?? null,
        uso: d.uso, padraoConstrutivo: d.padraoConstrutivo ?? null,
        areaDoTerreno: d.areaDoTerreno, areaConstruida: d.areaConstruida, fracaoIdeal: d.fracaoIdeal ?? null,
        criadoPor: d.criadoPor,
        atributos: { create: d.atributos.map((a) => ({ chave: a.chave, valor: a.valor, descricao: a.descricao ?? null })) },
      },
      select: { id: true },
    });
    return { versaoId: r.id, versao };
  });
}

export const zVincularPessoaAoImovel = z
  .object({
    imovelId: z.string().min(1),
    pessoaDocumento: z.string().trim().min(11).max(14),
    papel: z.enum(["PROPRIETARIO", "COMPROMISSARIO", "POSSUIDOR", "RESPONSAVEL_TRIBUTARIO"]),
    fracao: zDecimal(6),
    vigenciaInicio: zDia,
    motivo: z.string().trim().min(5),
    criadoPor: z.string().min(1),
  })
  .strict();
export type VincularPessoaAoImovelInput = z.input<typeof zVincularPessoaAoImovel>;

/**
 * O VÍNCULO com a Pessoa canônica, pelo DOCUMENTO (o cadastro de pessoas é o do M19 — este módulo não cria pessoa).
 * A soma das frações vigentes do MESMO papel não passa de 1: três proprietários de 50% cada é cadastro errado.
 */
export async function vincularPessoaAoImovel(prisma: PrismaClient, input: VincularPessoaAoImovelInput): Promise<{ readonly vinculoId: string; readonly fracaoDoPapel: string }> {
  const d = zVincularPessoaAoImovel.parse(input);
  const fracao = new Decimal(d.fracao);
  if (fracao.lte(0) || fracao.gt(1)) throw new Error("FRACAO-INVALIDA: a fração ideal vai de 0 (exclusive) a 1 (100%). Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.vincularPessoaAoImovel, "ENTE");
    const imovel = await tx.imovel.findUnique({ where: { id: d.imovelId }, select: { inscricao: true } });
    if (imovel === null) throw new Error("IMOVEL-INEXISTENTE: o imóvel indicado não existe. Nada foi gravado.");
    const pessoa = await tx.pessoa.findUnique({ where: { documento: d.pessoaDocumento }, select: { id: true } });
    if (pessoa === null) throw new Error(`PESSOA-NAO-CADASTRADA: não há pessoa com o documento informado. Cadastre-a no cadastro de pessoas antes. Nada foi gravado.`);
    const vigentes = await tx.vinculoDePessoaComImovel.findMany({
      where: { imovelId: d.imovelId, papel: d.papel, OR: [{ encerramento: { is: null } }, { encerramento: { dataEfeito: { gt: inicioDoDiaCivil(d.vigenciaInicio) } } }] },
      select: { fracao: true, pessoaId: true },
    });
    if (vigentes.some((v) => v.pessoaId === pessoa.id)) throw new Error(`VINCULO-JA-EXISTE: esta pessoa já tem vínculo vigente de ${d.papel.toLowerCase()} no imóvel ${imovel.inscricao}. Nada foi gravado.`);
    const soma = vigentes.reduce((t, v) => t.plus(v.fracao.toFixed(6)), new Decimal(0)).plus(fracao);
    if (soma.gt(1)) {
      throw new Error(`FRACAO-ACIMA-DO-INTEIRO: as frações vigentes de ${d.papel.toLowerCase()} no imóvel ${imovel.inscricao} somariam ${soma.toFixed(6)} a partir de ${br(d.vigenciaInicio)}. Encerre o vínculo anterior antes. Nada foi gravado.`);
    }
    const r = await tx.vinculoDePessoaComImovel.create({
      data: { imovelId: d.imovelId, pessoaId: pessoa.id, papel: d.papel, fracao: d.fracao, vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { vinculoId: r.id, fracaoDoPapel: soma.toFixed(6) };
  });
}

export const zEncerrarVinculoComImovel = z.object({ vinculoId: z.string().min(1), dataEfeito: zDia, motivo: z.string().trim().min(5), criadoPor: z.string().min(1) }).strict();
export type EncerrarVinculoComImovelInput = z.input<typeof zEncerrarVinculoComImovel>;

export async function encerrarVinculoComImovel(prisma: PrismaClient, input: EncerrarVinculoComImovelInput): Promise<{ readonly encerramentoId: string }> {
  const d = zEncerrarVinculoComImovel.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encerrarVinculoComImovel, "ENTE");
      const v = await tx.vinculoDePessoaComImovel.findUnique({ where: { id: d.vinculoId }, select: { vigenciaInicio: true, encerramento: { select: { id: true } } } });
      if (v === null) throw new Error("VINCULO-INEXISTENTE: o vínculo indicado não existe. Nada foi gravado.");
      if (v.encerramento !== null) throw new Error("VINCULO-JA-ENCERRADO: este vínculo já foi encerrado. Nada foi gravado.");
      if (d.dataEfeito < diaCivil(v.vigenciaInicio)) throw new Error(`ENCERRAMENTO-ANTES-DA-VIGENCIA: o vínculo vale desde ${diaCivilBr(v.vigenciaInicio)}; não se encerra antes disso. Nada foi gravado.`);
      const r = await tx.encerramentoDoVinculoComImovel.create({ data: { vinculoId: d.vinculoId, dataEfeito: inicioDoDiaCivil(d.dataEfeito), motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
      return { encerramentoId: r.id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("VINCULO-JA-ENCERRADO: outro encerramento deste vínculo foi gravado no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEITURAS
// ═══════════════════════════════════════════════════════════════════════════════

export interface VersaoDoImovelLida {
  readonly id: string;
  readonly versao: number;
  readonly vigenciaInicio: string;
  readonly motivo: string;
  readonly endereco: string;
  readonly bairro: string;
  readonly zona: string | null;
  readonly uso: string;
  readonly padraoConstrutivo: string | null;
  readonly areaDoTerreno: string;
  readonly areaConstruida: string;
  readonly fracaoIdeal: string | null;
  readonly atributos: readonly { readonly chave: string; readonly valor: string; readonly descricao: string | null }[];
}

export interface ImovelLido {
  readonly id: string;
  readonly inscricao: string;
  readonly versoes: readonly VersaoDoImovelLida[];
  readonly vinculos: readonly { readonly id: string; readonly papel: string; readonly fracao: string; readonly vigenciaInicio: string; readonly motivo: string; readonly pessoa: { readonly documento: string; readonly nome: string }; readonly encerrado: { readonly dataEfeito: string; readonly motivo: string } | null }[];
}

const versaoLida = (v: {
  id: string; versao: number; vigenciaInicio: Date; motivo: string; logradouro: string; numero: string; bairro: string; zona: string | null; uso: string; padraoConstrutivo: string | null;
  areaDoTerreno: { toFixed(n: number): string }; areaConstruida: { toFixed(n: number): string }; fracaoIdeal: { toFixed(n: number): string } | null;
  atributos: readonly { chave: string; valor: { toFixed(n: number): string }; descricao: string | null }[];
}): VersaoDoImovelLida => ({
  id: v.id, versao: v.versao, vigenciaInicio: diaCivil(v.vigenciaInicio), motivo: v.motivo,
  endereco: `${v.logradouro}, ${v.numero}`, bairro: v.bairro, zona: v.zona, uso: v.uso, padraoConstrutivo: v.padraoConstrutivo,
  areaDoTerreno: v.areaDoTerreno.toFixed(4), areaConstruida: v.areaConstruida.toFixed(4), fracaoIdeal: v.fracaoIdeal === null ? null : v.fracaoIdeal.toFixed(6),
  atributos: v.atributos.map((a) => ({ chave: a.chave, valor: a.valor.toFixed(6), descricao: a.descricao })),
});

const SELECT_VERSAO = {
  id: true, versao: true, vigenciaInicio: true, motivo: true, logradouro: true, numero: true, bairro: true, zona: true, uso: true, padraoConstrutivo: true,
  areaDoTerreno: true, areaConstruida: true, fracaoIdeal: true, atributos: { orderBy: { chave: "asc" as const }, select: { chave: true, valor: true, descricao: true } },
} as const;

/** O imóvel com todas as versões (a mais nova primeiro) e os vínculos, vigentes e encerrados. */
export async function imovelPorInscricao(prisma: Tx, inscricao: string): Promise<ImovelLido | null> {
  const i = await prisma.imovel.findUnique({
    where: { inscricao },
    select: {
      id: true, inscricao: true,
      versoes: { orderBy: { versao: "desc" }, select: SELECT_VERSAO },
      vinculos: {
        orderBy: [{ papel: "asc" }, { vigenciaInicio: "asc" }],
        select: { id: true, papel: true, fracao: true, vigenciaInicio: true, motivo: true, encerramento: { select: { dataEfeito: true, motivo: true } }, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } },
      },
    },
  });
  if (i === null) return null;
  return {
    id: i.id, inscricao: i.inscricao,
    versoes: i.versoes.map(versaoLida),
    vinculos: i.vinculos.map((v) => ({
      id: v.id, papel: v.papel, fracao: v.fracao.toFixed(6), vigenciaInicio: diaCivil(v.vigenciaInicio), motivo: v.motivo,
      pessoa: { documento: v.pessoa.documento, nome: v.pessoa.versoes[0]?.nome ?? v.pessoa.documento },
      encerrado: v.encerramento === null ? null : { dataEfeito: diaCivil(v.encerramento.dataEfeito), motivo: v.encerramento.motivo },
    })),
  };
}

/** A versão do cadastro que VALE num dia — a última com vigência até ele. `null` se o imóvel ainda não valia. */
export async function versaoDoImovelNoDia(prisma: Tx, imovelId: string, dia: string): Promise<VersaoDoImovelLida | null> {
  const v = await prisma.versaoDoImovel.findFirst({
    where: { imovelId, vigenciaInicio: { lte: inicioDoDiaCivil(dia) } },
    orderBy: { versao: "desc" },
    select: SELECT_VERSAO,
  });
  return v === null ? null : versaoLida(v);
}

/** Quem responde pelo imóvel num dia, por papel: vínculos vigentes (não encerrados antes do dia). */
export async function vinculosDoImovelNoDia(prisma: Tx, imovelId: string, dia: string): Promise<readonly { readonly pessoaId: string; readonly papel: string; readonly fracao: string; readonly documento: string; readonly nome: string }[]> {
  const quando = inicioDoDiaCivil(dia);
  const vs = await prisma.vinculoDePessoaComImovel.findMany({
    where: { imovelId, vigenciaInicio: { lte: quando }, OR: [{ encerramento: { is: null } }, { encerramento: { dataEfeito: { gt: quando } } }] },
    orderBy: [{ papel: "asc" }, { vigenciaInicio: "asc" }],
    // ⚠️ O `pessoaId` ENTROU NA V10 T2 e é o que o lançamento CONGELA. Sem ele, o responsável
    // do lançamento teria de ser reencontrado pelo documento na hora de ler — e o lançamento de
    // janeiro trocaria de devedor sozinho quando o imóvel fosse vendido em março.
    select: { pessoaId: true, papel: true, fracao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } },
  });
  return vs.map((v) => ({ pessoaId: v.pessoaId, papel: v.papel, fracao: v.fracao.toFixed(6), documento: v.pessoa.documento, nome: v.pessoa.versoes[0]?.nome ?? v.pessoa.documento }));
}
