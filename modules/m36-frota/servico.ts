import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { anoCivil, diaCivil, diaCivilBr, meioDiaCivil } from "../../packages/datas/index.js";
import { normalizarDocumento } from "../../packages/documento/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { ugVigenteNoDia } from "../m01-core-contabil/unidade-gestora.js";
import {
  COMBUSTIVEIS,
  ROTULO_SITUACAO,
  SITUACOES_DA_FROTA,
  TIPOS_DE_FROTA,
  exigirAno,
  exigirDonoELocador,
  exigirQuantidade,
  normalizarCodigoDaMaquina,
  normalizarNumeroDoModelo,
  normalizarPlaca,
  normalizarRenavam,
  situacaoNoDia,
  type MudancaNoDia,
} from "./dominio.js";

/**
 * V27 — M36 FROTA: os serviços. Cada ato confere a autorização no servidor, trava o bem antes de ler o estado, e
 * recusa com o motivo antes de gravar. Ver `prisma/schema/m36-frota.prisma` e `MODULO.md`.
 */

const zDia = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const zDocumentoOpcional = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional()
  .transform((s) => s ?? null);

const zDadosDoBem = {
  tipoFrota: z.enum(TIPOS_DE_FROTA),
  proprietarioDocumento: zDocumentoOpcional,
  locadorDocumento: zDocumentoOpcional,
  combustivelPrincipal: z.enum(COMBUSTIVEIS),
  vigenteDesde: zDia,
  fundamento: z.string().trim().min(5, "Diga de onde vêm os dados (documento do veículo, contrato de locação, termo de cessão)."),
  criadoPor: z.string().min(1),
};

/** A pessoa do cadastro único pelo CPF/CNPJ; ausente, a recusa diz onde cadastrar. */
async function pessoaPeloDocumento(tx: Tx, documento: string | null, papel: string): Promise<string | null> {
  if (documento === null) return null;
  const doc = normalizarDocumento(documento);
  const p = await tx.pessoa.findUnique({ where: { documento: doc }, select: { id: true } });
  if (p === null) throw new Error(`O ${papel} ${documento} não está no cadastro de pessoas. Cadastre-o em Cadastros › Pessoas e tente de novo. Nada foi gravado.`);
  return p.id;
}

/** A UG tem de ser escriturada aqui e valer no dia em que o bem passa a ser dela. */
async function exigirUgOperada(tx: Tx, ugId: string, dia: string): Promise<{ readonly codigoTce: string }> {
  const ug = await tx.unidadeGestora.findUnique({
    where: { id: ugId },
    select: { codigoTce: true, nome: true, entidadeContabilId: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } },
  });
  if (ug === null) throw new Error("Unidade gestora não encontrada. Nada foi gravado.");
  if (ug.entidadeContabilId === null) throw new Error(`A unidade gestora ${ug.codigoTce} (${ug.nome}) não é escriturada neste sistema: a frota dela é informada por ela. Nada foi gravado.`);
  if (!ugVigenteNoDia(ug, meioDiaCivil(dia))) throw new Error(`A unidade gestora ${ug.codigoTce} não vale em ${dia.split("-").reverse().join("/")}. Nada foi gravado.`);
  return { codigoTce: ug.codigoTce };
}

async function mudancasVivas(tx: Tx, alvo: { readonly veiculoId: string } | { readonly maquinaId: string }): Promise<readonly (MudancaNoDia & { readonly id: string })[]> {
  const ms = await tx.mudancaDeSituacaoDaFrota.findMany({ where: { ...alvo, anulacao: null }, orderBy: { desde: "asc" }, select: { id: true, desde: true, situacao: true } });
  return ms.map((m) => ({ id: m.id, dia: diaCivil(m.desde), situacao: m.situacao }));
}

// ── Veículo ────────────────────────────────────────────────────────────────────────────────────────

export const zDadosDoVeiculo = z.object({
  anoModelo: z.coerce.number().int(),
  renavam: z.string().trim().min(1, "Informe o RENAVAM."),
  numeroModelo: z.string().trim().nullable().optional(),
  ...zDadosDoBem,
});

export const zCadastrarVeiculo = zDadosDoVeiculo.extend({
  ugId: z.string().min(1),
  placa: z.string().trim().min(1, "Informe a placa."),
  situacaoInicial: z.enum(SITUACOES_DA_FROTA),
});
export type CadastrarVeiculoInput = z.input<typeof zCadastrarVeiculo>;

function dadosDoVeiculo(d: z.output<typeof zDadosDoVeiculo>) {
  exigirAno(d.anoModelo, "ano do modelo", anoCivil(new Date()));
  exigirDonoELocador(d.tipoFrota, d.proprietarioDocumento, d.locadorDocumento);
  return { renavam: normalizarRenavam(d.renavam), numeroModelo: normalizarNumeroDoModelo(d.numeroModelo) };
}

export async function cadastrarVeiculo(prisma: PrismaClient, input: CadastrarVeiculoInput): Promise<{ readonly id: string }> {
  const d = zCadastrarVeiculo.parse(input);
  const placa = normalizarPlaca(d.placa);
  const { renavam, numeroModelo } = dadosDoVeiculo(d);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarVeiculo, "ENTE");
    await exigirUgOperada(tx, d.ugId, d.vigenteDesde);
    const ja = await tx.veiculoDaFrota.findUnique({ where: { placa }, select: { ug: { select: { codigoTce: true } } } });
    if (ja !== null) throw new Error(`O veículo de placa ${placa} já está cadastrado na unidade gestora ${ja.ug.codigoTce}. Para mudar dono, locador ou dados, publique uma versão dele. Passar o veículo para outra unidade gestora ainda não está disponível. Nada foi gravado.`);
    const proprietarioId = await pessoaPeloDocumento(tx, d.proprietarioDocumento, "proprietário");
    const locadorId = await pessoaPeloDocumento(tx, d.locadorDocumento, "locador");
    const desde = meioDiaCivil(d.vigenteDesde);
    const v = await tx.veiculoDaFrota.create({ data: { ugId: d.ugId, placa, criadoPor: d.criadoPor }, select: { id: true } });
    await tx.versaoDoVeiculo.create({
      data: { veiculoId: v.id, versao: 1, anoModelo: d.anoModelo, renavam, numeroModelo, tipoFrota: d.tipoFrota, proprietarioId, locadorId, combustivelPrincipal: d.combustivelPrincipal, vigenteDesde: desde, fundamento: d.fundamento, criadoPor: d.criadoPor },
    });
    await tx.mudancaDeSituacaoDaFrota.create({ data: { veiculoId: v.id, situacao: d.situacaoInicial, desde, motivo: "Situação no cadastro do veículo", criadoPor: d.criadoPor } });
    return { id: v.id };
  });
}

export const zPublicarVersaoDoVeiculo = zDadosDoVeiculo.extend({ veiculoId: z.string().min(1) });

export async function publicarVersaoDoVeiculo(prisma: PrismaClient, input: z.input<typeof zPublicarVersaoDoVeiculo>): Promise<{ readonly versao: number }> {
  const d = zPublicarVersaoDoVeiculo.parse(input);
  const { renavam, numeroModelo } = dadosDoVeiculo(d);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarVersaoDoVeiculo, "ENTE");
    await travar(tx, "BemDaFrota", [d.veiculoId]);
    const ultima = await tx.versaoDoVeiculo.findFirst({ where: { veiculoId: d.veiculoId }, orderBy: { versao: "desc" }, select: { versao: true, vigenteDesde: true, veiculo: { select: { placa: true } } } });
    if (ultima === null) throw new Error("Veículo não encontrado. Nada foi gravado.");
    if (d.vigenteDesde < diaCivil(ultima.vigenteDesde)) {
      throw new Error(`A versão vigente do veículo ${ultima.veiculo.placa} vale desde ${diaCivilBr(ultima.vigenteDesde)}; a nova não pode começar antes. Nada foi gravado.`);
    }
    const proprietarioId = await pessoaPeloDocumento(tx, d.proprietarioDocumento, "proprietário");
    const locadorId = await pessoaPeloDocumento(tx, d.locadorDocumento, "locador");
    const versao = ultima.versao + 1;
    await tx.versaoDoVeiculo.create({
      data: { veiculoId: d.veiculoId, versao, anoModelo: d.anoModelo, renavam, numeroModelo, tipoFrota: d.tipoFrota, proprietarioId, locadorId, combustivelPrincipal: d.combustivelPrincipal, vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: d.fundamento, criadoPor: d.criadoPor },
    });
    return { versao };
  });
}

// ── Máquina ────────────────────────────────────────────────────────────────────────────────────────

export const zDadosDaMaquina = z.object({
  anoFabricacao: z.coerce.number().int(),
  descricao: z.string().trim().min(3, "Descreva a máquina.").max(50, "A descrição da máquina tem até 50 caracteres."),
  ...zDadosDoBem,
});

export const zCadastrarMaquina = zDadosDaMaquina.extend({
  ugId: z.string().min(1),
  codigo: z.string().trim().min(1, "Informe o código da máquina."),
  situacaoInicial: z.enum(SITUACOES_DA_FROTA),
});
export type CadastrarMaquinaInput = z.input<typeof zCadastrarMaquina>;

function dadosDaMaquina(d: z.output<typeof zDadosDaMaquina>): void {
  exigirAno(d.anoFabricacao, "ano de fabricação", anoCivil(new Date()));
  exigirDonoELocador(d.tipoFrota, d.proprietarioDocumento, d.locadorDocumento);
}

export async function cadastrarMaquina(prisma: PrismaClient, input: CadastrarMaquinaInput): Promise<{ readonly id: string }> {
  const d = zCadastrarMaquina.parse(input);
  const codigo = normalizarCodigoDaMaquina(d.codigo);
  dadosDaMaquina(d);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarMaquina, "ENTE");
    const ug = await exigirUgOperada(tx, d.ugId, d.vigenteDesde);
    const ja = await tx.maquinaDaFrota.findUnique({ where: { ugId_codigo: { ugId: d.ugId, codigo } }, select: { id: true } });
    if (ja !== null) throw new Error(`A unidade gestora ${ug.codigoTce} já tem a máquina de código ${codigo}. Para mudar dados, publique uma versão nova. Nada foi gravado.`);
    const proprietarioId = await pessoaPeloDocumento(tx, d.proprietarioDocumento, "proprietário");
    const locadorId = await pessoaPeloDocumento(tx, d.locadorDocumento, "locador");
    const desde = meioDiaCivil(d.vigenteDesde);
    const m = await tx.maquinaDaFrota.create({ data: { ugId: d.ugId, codigo, criadoPor: d.criadoPor }, select: { id: true } });
    await tx.versaoDaMaquina.create({
      data: { maquinaId: m.id, versao: 1, anoFabricacao: d.anoFabricacao, descricao: d.descricao, tipoFrota: d.tipoFrota, proprietarioId, locadorId, combustivelPrincipal: d.combustivelPrincipal, vigenteDesde: desde, fundamento: d.fundamento, criadoPor: d.criadoPor },
    });
    await tx.mudancaDeSituacaoDaFrota.create({ data: { maquinaId: m.id, situacao: d.situacaoInicial, desde, motivo: "Situação no cadastro da máquina", criadoPor: d.criadoPor } });
    return { id: m.id };
  });
}

export const zPublicarVersaoDaMaquina = zDadosDaMaquina.extend({ maquinaId: z.string().min(1) });

export async function publicarVersaoDaMaquina(prisma: PrismaClient, input: z.input<typeof zPublicarVersaoDaMaquina>): Promise<{ readonly versao: number }> {
  const d = zPublicarVersaoDaMaquina.parse(input);
  dadosDaMaquina(d);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarVersaoDaMaquina, "ENTE");
    await travar(tx, "BemDaFrota", [d.maquinaId]);
    const ultima = await tx.versaoDaMaquina.findFirst({ where: { maquinaId: d.maquinaId }, orderBy: { versao: "desc" }, select: { versao: true, vigenteDesde: true, maquina: { select: { codigo: true } } } });
    if (ultima === null) throw new Error("Máquina não encontrada. Nada foi gravado.");
    if (d.vigenteDesde < diaCivil(ultima.vigenteDesde)) {
      throw new Error(`A versão vigente da máquina ${ultima.maquina.codigo} vale desde ${diaCivilBr(ultima.vigenteDesde)}; a nova não pode começar antes. Nada foi gravado.`);
    }
    const proprietarioId = await pessoaPeloDocumento(tx, d.proprietarioDocumento, "proprietário");
    const locadorId = await pessoaPeloDocumento(tx, d.locadorDocumento, "locador");
    const versao = ultima.versao + 1;
    await tx.versaoDaMaquina.create({
      data: { maquinaId: d.maquinaId, versao, anoFabricacao: d.anoFabricacao, descricao: d.descricao, tipoFrota: d.tipoFrota, proprietarioId, locadorId, combustivelPrincipal: d.combustivelPrincipal, vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: d.fundamento, criadoPor: d.criadoPor },
    });
    return { versao };
  });
}

// ── Situação ───────────────────────────────────────────────────────────────────────────────────────

const zAlvo = z.object({ veiculoId: z.string().min(1).optional(), maquinaId: z.string().min(1).optional() }).refine((a) => (a.veiculoId === undefined) !== (a.maquinaId === undefined), "Escolha um veículo ou uma máquina.");

async function nomeDoBem(tx: Tx, alvo: { readonly veiculoId?: string | undefined; readonly maquinaId?: string | undefined }): Promise<{ readonly nome: string; readonly filtro: { readonly veiculoId: string } | { readonly maquinaId: string } }> {
  if (alvo.veiculoId !== undefined) {
    const v = await tx.veiculoDaFrota.findUnique({ where: { id: alvo.veiculoId }, select: { placa: true } });
    if (v === null) throw new Error("Veículo não encontrado. Nada foi gravado.");
    return { nome: `veículo ${v.placa}`, filtro: { veiculoId: alvo.veiculoId } };
  }
  const m = await tx.maquinaDaFrota.findUnique({ where: { id: alvo.maquinaId ?? "" }, select: { codigo: true } });
  if (m === null) throw new Error("Máquina não encontrada. Nada foi gravado.");
  return { nome: `máquina ${m.codigo}`, filtro: { maquinaId: alvo.maquinaId ?? "" } };
}

export const zRegistrarSituacaoDaFrota = z.object({
  veiculoId: z.string().min(1).optional(),
  maquinaId: z.string().min(1).optional(),
  situacao: z.enum(SITUACOES_DA_FROTA),
  desde: zDia,
  motivo: z.string().trim().min(5, "Diga o motivo (a ordem de serviço, o laudo, o ato de baixa)."),
  criadoPor: z.string().min(1),
});

export async function registrarSituacaoDaFrota(prisma: PrismaClient, input: z.input<typeof zRegistrarSituacaoDaFrota>): Promise<{ readonly id: string }> {
  const d = zRegistrarSituacaoDaFrota.parse(input);
  zAlvo.parse(d);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarSituacaoDaFrota, "ENTE");
    await travar(tx, "BemDaFrota", [d.veiculoId ?? d.maquinaId ?? ""]);
    const bem = await nomeDoBem(tx, d);
    const vivas = await mudancasVivas(tx, bem.filtro);
    const primeira = vivas[0];
    if (primeira === undefined || d.desde < primeira.dia) {
      throw new Error(`O ${bem.nome} só passou a ser da frota em ${primeira === undefined ? "data não registrada" : primeira.dia.split("-").reverse().join("/")}: a situação não pode começar antes. Nada foi gravado.`);
    }
    if (vivas.some((m) => m.dia === d.desde)) {
      throw new Error(`O ${bem.nome} já tem situação começando em ${d.desde.split("-").reverse().join("/")}. Anule-a antes de registrar outra no mesmo dia. Nada foi gravado.`);
    }
    if (vivas.some((m) => m.dia > d.desde)) {
      throw new Error(`O ${bem.nome} tem situação registrada depois de ${d.desde.split("-").reverse().join("/")}. Anule as posteriores antes de registrar uma anterior. Nada foi gravado.`);
    }
    const atual = situacaoNoDia(vivas, d.desde);
    if (atual === "BAIXADA") throw new Error(`O ${bem.nome} está baixado. Se a baixa foi engano, anule-a. Nada foi gravado.`);
    if (d.situacao === "BAIXADA") {
      // Baixado não abastece: a baixa não pode começar antes de um abastecimento já registrado.
      const depois = await tx.abastecimentoDaFrota.findMany({ where: { ...bem.filtro, anulacao: null, data: { gte: meioDiaCivil(d.desde) } }, orderBy: { data: "asc" }, select: { data: true, documento: true } });
      if (depois.length > 0) {
        throw new Error(`O ${bem.nome} tem abastecimento registrado a partir de ${d.desde.split("-").reverse().join("/")} (${depois.map((a) => `${diaCivilBr(a.data)}, ${a.documento}`).join("; ")}). Anule-o se foi engano, ou informe a baixa a partir do dia seguinte ao último abastecimento. Nada foi gravado.`);
      }
    }
    if (atual === d.situacao) throw new Error(`O ${bem.nome} já está ${ROTULO_SITUACAO[d.situacao].toLowerCase()}. Nada foi gravado.`);
    const c = await tx.mudancaDeSituacaoDaFrota.create({ data: { ...bem.filtro, situacao: d.situacao, desde: meioDiaCivil(d.desde), motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
    return { id: c.id };
  });
}

export const zAnular = z.object({ id: z.string().min(1), motivo: z.string().trim().min(5, "Diga por que o registro está errado."), criadoPor: z.string().min(1) });

export async function anularSituacaoDaFrota(prisma: PrismaClient, input: z.input<typeof zAnular>): Promise<void> {
  const d = zAnular.parse(input);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.anularSituacaoDaFrota, "ENTE");
    const m0 = await tx.mudancaDeSituacaoDaFrota.findUnique({ where: { id: d.id }, select: { veiculoId: true, maquinaId: true } });
    if (m0 === null) throw new Error("Situação não encontrada. Nada foi gravado.");
    await travar(tx, "BemDaFrota", [m0.veiculoId ?? m0.maquinaId ?? ""]);
    const bem = await nomeDoBem(tx, { veiculoId: m0.veiculoId ?? undefined, maquinaId: m0.maquinaId ?? undefined });
    const vivas = await mudancasVivas(tx, bem.filtro);
    const alvo = vivas.find((m) => m.id === d.id);
    if (alvo === undefined) throw new Error("Esta situação já foi anulada. Nada foi gravado.");
    if (vivas[0]?.id === d.id) throw new Error(`Esta é a situação com que o ${bem.nome} entrou na frota: corrija-a publicando uma versão do cadastro e registrando a situação certa. Nada foi gravado.`);
    if (vivas.some((m) => m.dia > alvo.dia)) throw new Error(`Há situação do ${bem.nome} depois desta: anule a mais recente primeiro. Nada foi gravado.`);
    await tx.anulacaoDeSituacaoDaFrota.create({ data: { mudancaId: d.id, motivo: d.motivo, criadoPor: d.criadoPor } });
  });
}

// ── Abastecimento ──────────────────────────────────────────────────────────────────────────────────

export const zRegistrarAbastecimento = z.object({
  veiculoId: z.string().min(1).optional(),
  maquinaId: z.string().min(1).optional(),
  data: zDia,
  combustivel: z.enum(COMBUSTIVEIS),
  quantidade: z.string().trim().min(1, "Informe a quantidade."),
  documento: z.string().trim().min(1, "Informe o cupom, a nota ou a ordem de abastecimento."),
  criadoPor: z.string().min(1),
});

export async function registrarAbastecimento(prisma: PrismaClient, input: z.input<typeof zRegistrarAbastecimento>): Promise<{ readonly id: string }> {
  const d = zRegistrarAbastecimento.parse(input);
  zAlvo.parse(d);
  const quantidade = exigirQuantidade(d.quantidade);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAbastecimento, "ENTE");
    await travar(tx, "BemDaFrota", [d.veiculoId ?? d.maquinaId ?? ""]);
    const bem = await nomeDoBem(tx, d);
    const situacao = situacaoNoDia(await mudancasVivas(tx, bem.filtro), d.data);
    // O leiaute não admite abastecimento de bem fora do arquivo de situação; e baixado não abastece.
    if (situacao === null) throw new Error(`O ${bem.nome} não estava na frota em ${d.data.split("-").reverse().join("/")}. Nada foi gravado.`);
    if (situacao === "BAIXADA") throw new Error(`O ${bem.nome} estava baixado em ${d.data.split("-").reverse().join("/")}. Nada foi gravado.`);
    const c = await tx.abastecimentoDaFrota.create({ data: { ...bem.filtro, data: meioDiaCivil(d.data), combustivel: d.combustivel, quantidade, documento: d.documento, criadoPor: d.criadoPor }, select: { id: true } });
    return { id: c.id };
  });
}

export async function anularAbastecimento(prisma: PrismaClient, input: z.input<typeof zAnular>): Promise<void> {
  const d = zAnular.parse(input);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.anularAbastecimento, "ENTE");
    const a = await tx.abastecimentoDaFrota.findUnique({ where: { id: d.id }, select: { veiculoId: true, maquinaId: true, anulacao: { select: { id: true } } } });
    if (a === null) throw new Error("Abastecimento não encontrado. Nada foi gravado.");
    await travar(tx, "BemDaFrota", [a.veiculoId ?? a.maquinaId ?? ""]);
    if (a.anulacao !== null) throw new Error("Este abastecimento já foi anulado. Nada foi gravado.");
    await tx.anulacaoDeAbastecimento.create({ data: { abastecimentoId: d.id, motivo: d.motivo, criadoPor: d.criadoPor } });
  });
}
