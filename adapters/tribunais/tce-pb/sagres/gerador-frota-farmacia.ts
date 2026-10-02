import type { PrismaClient } from "../../../../prisma/generated/client/client.js";
import { serializarArquivo, type LayoutArquivo } from "./registry.js";
import { nomeArquivo } from "./nomenclatura.js";
import { diaCivil } from "../../../../packages/datas/index.js";
import { toMoney } from "../../../../packages/contracts/index.js";
import { baixadoNoMesInteiro, situacoesDoMes, type MudancaNoDia } from "../../../../modules/m36-frota/dominio.js";
import {
  CATEGORIA_FROTA_MAQUINA,
  CATEGORIA_FROTA_VEICULO,
  DEPARA_COMBUSTIVEL_SAGRES,
  DEPARA_SITUACAO_FROTA_SAGRES,
  DEPARA_TIPO_FROTA_SAGRES,
  LAYOUT_ABASTECIMENTO,
  LAYOUT_ESTOQUE_FARMACIA,
  LAYOUT_FARMACIA,
  LAYOUT_LOCADOR_PRESTADOR,
  LAYOUT_MAQUINAS,
  LAYOUT_PROPRIETARIO_FROTA,
  LAYOUT_SITUACAO_FROTA,
  LAYOUT_VEICULOS,
  type AbastecimentoFato,
  type EstoqueFarmaciaFato,
  type FarmaciaFato,
  type MaquinaFato,
  type PessoaDaFrotaFato,
  type SituacaoFrotaFato,
  type VeiculoFato,
} from "./layout-2026v11.js";

/**
 * V27 — §4.50 a §4.57: a frota (M36) e a farmácia pública (M37) da UG, no pacote do mês.
 *
 * Mesmo regime das V24 a V26: cada arquivo sai do fato gravado, ou a recusa (mensagem que começa por "SAGRES") nomeia
 * o registro e o que falta, e SÓ AQUELE arquivo fica fora do pacote.
 *
 * - Proprietários, locadores, veículos e máquinas: o cadastro vai uma vez, e de novo quando muda (o leiaute). Saem as
 *   versões que começaram no mês; o dono e o locador saem com o bem que os cita.
 * - Situação: todo mês, todo bem cadastrado — a situação do dia 1 e cada mudança do mês.
 * - Abastecimento: todo mês, todo bem da situação que não ficou baixado o mês inteiro; sem abastecimento, quantidade
 *   zero no combustível principal (o leiaute exige o registro mesmo sem abastecimento).
 * - Farmácia: as ativas no fim do mês; estoque: o último informe do mês de cada uma.
 */

export interface ArquivoFrotaFarmacia {
  readonly nome: string;
  readonly conteudo: Buffer;
  readonly registros: number;
}

interface Mes {
  readonly codUnidadeGestora: string;
  readonly cnpjGerenciadora: string;
  readonly competencia: Date;
}

const prefixoDoMes = (c: Date): string => `${String(c.getUTCFullYear())}-${String(c.getUTCMonth() + 1).padStart(2, "0")}`;
const fimDoMes = (c: Date): string => {
  const ultimo = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0)).getUTCDate();
  return `${prefixoDoMes(c)}-${String(ultimo).padStart(2, "0")}`;
};
/** Meio-dia UTC do dia civil: o formatador de data do leiaute lê em UTC, e meio-dia não troca de dia. */
const diaDoLeiaute = (dia: string): Date => new Date(`${dia}T12:00:00.000Z`);

function empacotar<T>(layout: LayoutArquivo<T>, p: Mes, entidade: string, fatos: readonly T[]): ArquivoFrotaFarmacia {
  return { nome: nomeArquivo({ codUnidadeGestora: p.codUnidadeGestora, periodicidade: "MENSAL", entidade, competencia: p.competencia }), conteudo: serializarArquivo(layout, fatos), registros: fatos.length };
}

async function nomeVigente(prisma: PrismaClient, pessoaId: string): Promise<{ readonly documento: string; readonly nome: string }> {
  const p = await prisma.pessoa.findUniqueOrThrow({ where: { id: pessoaId }, select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } });
  return { documento: p.documento, nome: p.versoes[0]?.nome ?? "" };
}

// ── O cadastro do mês: versões que começaram nele ─────────────────────────────────────────────────

async function versoesDoMes(prisma: PrismaClient, p: Mes) {
  const prefixo = prefixoDoMes(p.competencia);
  const ug = await prisma.unidadeGestora.findUnique({ where: { codigoTce: p.codUnidadeGestora }, select: { id: true, nome: true } });
  if (ug === null) return { ug: null, veiculos: [], maquinas: [] };
  const janela = { gte: new Date(`${prefixo}-01T00:00:00.000Z`), lt: new Date(new Date(`${fimDoMes(p.competencia)}T00:00:00.000Z`).getTime() + 30 * 3_600_000) };
  const vs = await prisma.versaoDoVeiculo.findMany({
    where: { veiculo: { ugId: ug.id }, vigenteDesde: janela },
    orderBy: [{ veiculoId: "asc" }, { versao: "asc" }],
    select: { veiculoId: true, versao: true, vigenteDesde: true, anoModelo: true, renavam: true, numeroModelo: true, tipoFrota: true, proprietarioId: true, locadorId: true, veiculo: { select: { placa: true } } },
  });
  const ms = await prisma.versaoDaMaquina.findMany({
    where: { maquina: { ugId: ug.id }, vigenteDesde: janela },
    orderBy: [{ maquinaId: "asc" }, { versao: "asc" }],
    select: { maquinaId: true, versao: true, vigenteDesde: true, anoFabricacao: true, descricao: true, tipoFrota: true, proprietarioId: true, locadorId: true, maquina: { select: { codigo: true } } },
  });
  // A última versão do mês de cada bem (a chave do arquivo é a placa / o código: um registro por bem).
  const ultima = <T extends { readonly vigenteDesde: Date }>(xs: readonly T[], chave: (x: T) => string): T[] => {
    const m = new Map<string, T>();
    for (const x of xs.filter((v) => diaCivil(v.vigenteDesde).startsWith(prefixo))) m.set(chave(x), x);
    return [...m.values()];
  };
  return { ug, veiculos: ultima(vs, (v) => v.veiculoId), maquinas: ultima(ms, (m) => m.maquinaId) };
}

async function pessoasDoMes(prisma: PrismaClient, p: Mes, papel: "proprietarioId" | "locadorId"): Promise<PessoaDaFrotaFato[]> {
  const { ug, veiculos, maquinas } = await versoesDoMes(prisma, p);
  if (ug === null) return [];
  const saida = new Map<string, PessoaDaFrotaFato>();
  const bens = [...veiculos, ...maquinas];
  if (papel === "proprietarioId" && bens.some((b) => b.tipoFrota === "PROPRIO")) {
    // O dono do bem próprio é a própria UG (o leiaute manda o CNPJ dela).
    saida.set(p.cnpjGerenciadora, { codUnidadeGestora: p.codUnidadeGestora, cpfcnpj: p.cnpjGerenciadora, nome: ug.nome });
  }
  for (const b of bens) {
    const id = b[papel];
    if (id === null) continue;
    const pessoa = await nomeVigente(prisma, id);
    saida.set(pessoa.documento, { codUnidadeGestora: p.codUnidadeGestora, cpfcnpj: pessoa.documento, nome: pessoa.nome });
  }
  return [...saida.values()].sort((a, b) => a.cpfcnpj.localeCompare(b.cpfcnpj));
}

export async function lerFatosProprietarioFrota(prisma: PrismaClient, p: Mes): Promise<PessoaDaFrotaFato[]> {
  return pessoasDoMes(prisma, p, "proprietarioId");
}
export async function lerFatosLocadorPrestador(prisma: PrismaClient, p: Mes): Promise<PessoaDaFrotaFato[]> {
  return pessoasDoMes(prisma, p, "locadorId");
}

async function documentoDe(prisma: PrismaClient, id: string | null): Promise<string | null> {
  return id === null ? null : (await nomeVigente(prisma, id)).documento;
}

export async function lerFatosVeiculos(prisma: PrismaClient, p: Mes): Promise<VeiculoFato[]> {
  const { veiculos } = await versoesDoMes(prisma, p);
  const semModelo = veiculos.filter((v) => v.numeroModelo === null).map((v) => v.veiculo.placa);
  if (semModelo.length > 0) {
    throw new Error(
      `SAGRES/Veiculos §4.52 — veículo(s) sem o número do modelo da tabela do Tribunal: ${semModelo.join(", ")}. ` +
        `Informe-o publicando uma versão do veículo em Patrimônio › Frota.`
    );
  }
  const fatos: VeiculoFato[] = [];
  for (const v of veiculos.sort((a, b) => a.veiculo.placa.localeCompare(b.veiculo.placa))) {
    fatos.push({
      codUnidadeGestora: p.codUnidadeGestora,
      placa: v.veiculo.placa,
      anoModelo: v.anoModelo,
      numeroRenavan: v.renavam,
      numeroModelo: v.numeroModelo ?? "",
      tipoFrota: DEPARA_TIPO_FROTA_SAGRES[v.tipoFrota],
      cpfcnpjProprietario: v.tipoFrota === "PROPRIO" ? p.cnpjGerenciadora : ((await documentoDe(prisma, v.proprietarioId)) ?? ""),
      cpfcnpjLocador: await documentoDe(prisma, v.locadorId),
    });
  }
  return fatos;
}

export async function lerFatosMaquinas(prisma: PrismaClient, p: Mes): Promise<MaquinaFato[]> {
  const { maquinas } = await versoesDoMes(prisma, p);
  const fatos: MaquinaFato[] = [];
  for (const m of maquinas.sort((a, b) => a.maquina.codigo.localeCompare(b.maquina.codigo))) {
    fatos.push({
      codUnidadeGestora: p.codUnidadeGestora,
      codigo: m.maquina.codigo,
      anoFabricacao: m.anoFabricacao,
      descricao: m.descricao,
      tipoMaquina: DEPARA_TIPO_FROTA_SAGRES[m.tipoFrota],
      cpfcnpjProprietario: m.tipoFrota === "PROPRIO" ? p.cnpjGerenciadora : ((await documentoDe(prisma, m.proprietarioId)) ?? ""),
      cpfcnpjLocador: await documentoDe(prisma, m.locadorId),
    });
  }
  return fatos;
}

// ── Situação e abastecimento: todo bem, todo mês ──────────────────────────────────────────────────

interface BemNoMes {
  readonly categoria: string;
  readonly codigo: string;
  readonly situacoes: readonly MudancaNoDia[];
  readonly combustivelPrincipal: keyof typeof DEPARA_COMBUSTIVEL_SAGRES;
  readonly abastecimentos: readonly { readonly combustivel: keyof typeof DEPARA_COMBUSTIVEL_SAGRES; readonly quantidade: string; readonly dia: string }[];
}

async function bensDoMes(prisma: PrismaClient, p: Mes): Promise<BemNoMes[]> {
  const prefixo = prefixoDoMes(p.competencia);
  const fim = fimDoMes(p.competencia);
  const ug = await prisma.unidadeGestora.findUnique({ where: { codigoTce: p.codUnidadeGestora }, select: { id: true } });
  if (ug === null) return [];
  const sel = {
    situacoes: { where: { anulacao: null }, select: { desde: true, situacao: true } },
    abastecimentos: { where: { anulacao: null }, select: { data: true, combustivel: true, quantidade: true } },
  } as const;
  const veiculos = await prisma.veiculoDaFrota.findMany({ where: { ugId: ug.id }, select: { placa: true, ...sel, versoes: { orderBy: { versao: "asc" }, select: { vigenteDesde: true, combustivelPrincipal: true } } } });
  const maquinas = await prisma.maquinaDaFrota.findMany({ where: { ugId: ug.id }, select: { codigo: true, ...sel, versoes: { orderBy: { versao: "asc" }, select: { vigenteDesde: true, combustivelPrincipal: true } } } });
  const montar = (categoria: string, codigo: string, b: (typeof veiculos)[number] | (typeof maquinas)[number]): BemNoMes => {
    const mudancas = b.situacoes.map((s) => ({ dia: diaCivil(s.desde), situacao: s.situacao }));
    const vigente = [...b.versoes].filter((v) => diaCivil(v.vigenteDesde) <= fim).pop() ?? b.versoes[0];
    return {
      categoria,
      codigo,
      situacoes: situacoesDoMes(mudancas, prefixo),
      combustivelPrincipal: vigente?.combustivelPrincipal ?? "GASOLINA",
      abastecimentos: b.abastecimentos.map((a) => ({ combustivel: a.combustivel, quantidade: a.quantidade.toFixed(2), dia: diaCivil(a.data) })).filter((a) => a.dia.startsWith(prefixo)),
    };
  };
  return [
    ...veiculos.map((v) => montar(CATEGORIA_FROTA_VEICULO, v.placa, v)),
    ...maquinas.map((m) => montar(CATEGORIA_FROTA_MAQUINA, m.codigo, m)),
  ]
    .filter((b) => b.situacoes.length > 0)
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.codigo.localeCompare(b.codigo));
}

export async function lerFatosSituacaoFrota(prisma: PrismaClient, p: Mes): Promise<SituacaoFrotaFato[]> {
  return (await bensDoMes(prisma, p)).flatMap((b) =>
    b.situacoes.map((s) => ({ codUnidadeGestora: p.codUnidadeGestora, data: diaDoLeiaute(s.dia), tipoSituacao: DEPARA_SITUACAO_FROTA_SAGRES[s.situacao], categoria: b.categoria, codigo: b.codigo }))
  );
}

export async function lerFatosAbastecimento(prisma: PrismaClient, p: Mes): Promise<AbastecimentoFato[]> {
  const ano = p.competencia.getUTCFullYear();
  const mes = p.competencia.getUTCMonth() + 1;
  const fatos: AbastecimentoFato[] = [];
  for (const b of await bensDoMes(prisma, p)) {
    if (b.abastecimentos.length === 0) {
      if (baixadoNoMesInteiro(b.situacoes)) continue;
      fatos.push({ codUnidadeGestora: p.codUnidadeGestora, ano, mes, quantidade: toMoney("0"), tipoCombustivel: DEPARA_COMBUSTIVEL_SAGRES[b.combustivelPrincipal], categoria: b.categoria, codigo: b.codigo });
      continue;
    }
    const porCombustivel = new Map<keyof typeof DEPARA_COMBUSTIVEL_SAGRES, ReturnType<typeof toMoney>>();
    for (const a of b.abastecimentos) porCombustivel.set(a.combustivel, toMoney((porCombustivel.get(a.combustivel) ?? toMoney("0")).plus(a.quantidade)));
    for (const [c, q] of [...porCombustivel.entries()].sort((x, y) => DEPARA_COMBUSTIVEL_SAGRES[x[0]].localeCompare(DEPARA_COMBUSTIVEL_SAGRES[y[0]]))) {
      fatos.push({ codUnidadeGestora: p.codUnidadeGestora, ano, mes, quantidade: q, tipoCombustivel: DEPARA_COMBUSTIVEL_SAGRES[c], categoria: b.categoria, codigo: b.codigo });
    }
  }
  return fatos;
}

// ── Farmácia ──────────────────────────────────────────────────────────────────────────────────────

async function farmaciasAtivas(prisma: PrismaClient, p: Mes) {
  const fim = fimDoMes(p.competencia);
  const fs = await prisma.farmaciaPublica.findMany({
    where: { ug: { codigoTce: p.codUnidadeGestora } },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, versoes: { orderBy: { versao: "asc" }, select: { vigenteDesde: true, ativa: true, descricao: true, endereco: true, nomeResponsavel: true, cpfResponsavel: true, crfResponsavel: true } } },
  });
  return fs
    .map((f) => ({ id: f.id, codigo: f.codigo, vigente: f.versoes.filter((v) => diaCivil(v.vigenteDesde) <= fim).pop() }))
    .filter((f): f is typeof f & { vigente: NonNullable<typeof f.vigente> } => f.vigente !== undefined && f.vigente.ativa);
}

export async function lerFatosFarmacia(prisma: PrismaClient, p: Mes): Promise<FarmaciaFato[]> {
  return (await farmaciasAtivas(prisma, p)).map((f) => ({
    codUnidadeGestora: p.codUnidadeGestora,
    codigo: f.codigo,
    descricao: f.vigente.descricao,
    endereco: f.vigente.endereco,
    nomeResponsavel: f.vigente.nomeResponsavel,
    cpf: f.vigente.cpfResponsavel,
    crf: f.vigente.crfResponsavel,
  }));
}

export async function lerFatosEstoqueFarmacia(prisma: PrismaClient, p: Mes): Promise<EstoqueFarmaciaFato[]> {
  const ano = p.competencia.getUTCFullYear();
  const mes = p.competencia.getUTCMonth() + 1;
  const fatos: EstoqueFarmaciaFato[] = [];
  const sem: string[] = [];
  for (const f of await farmaciasAtivas(prisma, p)) {
    const informe = await prisma.informeDeEstoqueDaFarmacia.findFirst({
      where: { farmaciaId: f.id, ano, mes },
      orderBy: { criadoEm: "desc" },
      select: { itens: { orderBy: { codigoProduto: "asc" }, select: { codigoProduto: true, descricao: true, unidadeMedida: true, quantidade: true } } },
    });
    if (informe === null) {
      sem.push(`${f.codigo} (${f.vigente.descricao})`);
      continue;
    }
    for (const i of informe.itens) {
      fatos.push({ codUnidadeGestora: p.codUnidadeGestora, mesReferencia: mes, codigoFarmacia: f.codigo, codigoProduto: i.codigoProduto, descricao: i.descricao, unidadeMedida: i.unidadeMedida, quantidade: toMoney(i.quantidade.toFixed(2)) });
    }
  }
  if (sem.length > 0) {
    throw new Error(
      `SAGRES/EstoqueFarmacia §4.57 — farmácia(s) sem o estoque de ${String(mes).padStart(2, "0")}/${String(ano)}: ${sem.join("; ")}. ` +
        `Informe o estoque do mês em Patrimônio › Farmácias públicas.`
    );
  }
  return fatos;
}

// ── O grupo ───────────────────────────────────────────────────────────────────────────────────────

export async function gerarArquivosDaFrotaEFarmacia(
  prisma: PrismaClient,
  p: Mes
): Promise<{ readonly arquivos: readonly { readonly arquivo: ArquivoFrotaFarmacia; readonly layout: LayoutArquivo<never> }[]; readonly recusas: readonly { readonly arquivo: string; readonly detalhe: string }[] }> {
  const tarefas: readonly { readonly entidade: string; readonly layout: LayoutArquivo<never>; readonly ler: () => Promise<readonly unknown[]> }[] = [
    { entidade: "ProprietarioFrota", layout: LAYOUT_PROPRIETARIO_FROTA as LayoutArquivo<never>, ler: () => lerFatosProprietarioFrota(prisma, p) },
    { entidade: "LocadorPrestador", layout: LAYOUT_LOCADOR_PRESTADOR as LayoutArquivo<never>, ler: () => lerFatosLocadorPrestador(prisma, p) },
    { entidade: "Veiculos", layout: LAYOUT_VEICULOS as LayoutArquivo<never>, ler: () => lerFatosVeiculos(prisma, p) },
    { entidade: "Maquinas", layout: LAYOUT_MAQUINAS as LayoutArquivo<never>, ler: () => lerFatosMaquinas(prisma, p) },
    { entidade: "SituacaoFrota", layout: LAYOUT_SITUACAO_FROTA as LayoutArquivo<never>, ler: () => lerFatosSituacaoFrota(prisma, p) },
    { entidade: "Abastecimento", layout: LAYOUT_ABASTECIMENTO as LayoutArquivo<never>, ler: () => lerFatosAbastecimento(prisma, p) },
    { entidade: "Farmacia", layout: LAYOUT_FARMACIA as LayoutArquivo<never>, ler: () => lerFatosFarmacia(prisma, p) },
    { entidade: "EstoqueFarmacia", layout: LAYOUT_ESTOQUE_FARMACIA as LayoutArquivo<never>, ler: () => lerFatosEstoqueFarmacia(prisma, p) },
  ];
  const arquivos: { arquivo: ArquivoFrotaFarmacia; layout: LayoutArquivo<never> }[] = [];
  const recusas: { arquivo: string; detalhe: string }[] = [];
  for (const t of tarefas) {
    try {
      const fatos = await t.ler();
      arquivos.push({ arquivo: empacotar(t.layout, p, t.entidade, fatos as never[]), layout: t.layout });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("SAGRES")) throw e;
      recusas.push({ arquivo: t.entidade, detalhe: e.message });
    }
  }
  return { arquivos, recusas };
}
