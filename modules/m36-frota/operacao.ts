import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { COMBUSTIVEIS, exigirQuantidade, situacaoNoDia } from "./dominio.js";

/**
 * V39-R2 (R2-025 a R2-028) — A OPERAÇÃO DA FROTA. Ver `prisma/schema/m36-operacao-da-frota.prisma`.
 *
 *   · CONDUTOR: os dados da habilitação por versão. A categoria aceita por bem é DECLARADA pelo ente
 *     (`ExigenciaDeHabilitacaoDaFrota`): o sistema não deduz do tipo do veículo qual categoria o dirige.
 *   · ORDEM DE ABASTECIMENTO: bem, condutor (ativo, com CNH válida até o fim do prazo e categoria aceita), combustível,
 *     quantidade máxima e prazo. O abastecimento feito por ela confere bem, combustível, prazo e saldo, e a CNH no dia.
 *   · LEITURA DO MARCADOR: não diminui com o tempo; a correção é leitura nova que aponta a errada, com motivo.
 *   · MANUTENÇÃO: pedido, autorização (contrato ou fornecedor, valor estimado), conclusão (custo, documento) ou
 *     cancelamento — cada fase um registro, a situação derivada.
 *
 * Atos do ENTE, como o resto da frota. Trava `BemDaFrota` (posto 35): o bem, o condutor e as numerações.
 */

const zDia = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const br = (dia: string): string => diaCivilBr(meioDiaCivil(dia));
/**
 * V39-R3 (R3-013) — A ACC (Autorização para Conduzir Ciclomotor, CTB art. 140; Resolução CONTRAN 168/2004) é habilitação
 * própria do ciclomotor e entra como CATEGORIA INTEIRA: lida letra a letra, "ACC" viraria A e C. E não equivale a nenhuma
 * outra por conta do sistema: o que o bem aceita é o que o ente declara na exigência dele (ACC, A, ou as duas).
 */
const CATEGORIAS_DA_CNH = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE", "ACC"] as const;
const zCategoria = z.string().trim().toUpperCase().refine((c) => (CATEGORIAS_DA_CNH as readonly string[]).includes(c), "A categoria da CNH é A, B, C, D, E, A combinada com outra (AB, AC, AD, AE), ou a ACC (ciclomotor).");
/** As categorias que a habilitação dá: a ACC é uma só; as demais, uma por letra (AB é A e B). */
export function categoriasDaHabilitacao(cnhCategoria: string): readonly string[] {
  return cnhCategoria === "ACC" ? ["ACC"] : [...cnhCategoria];
}
const zAlvo = { veiculoId: z.string().min(1).optional(), maquinaId: z.string().min(1).optional() };
const umBem = (a: { veiculoId?: string | undefined; maquinaId?: string | undefined }): boolean => (a.veiculoId === undefined) !== (a.maquinaId === undefined);
const MSG_BEM = "Escolha um veículo ou uma máquina.";
const NUMERACAO_ORDEM = "numeracao-da-ordem-de-abastecimento";
const NUMERACAO_MANUTENCAO = "numeracao-da-manutencao-da-frota";

type Alvo = { readonly veiculoId: string } | { readonly maquinaId: string };
interface Bem {
  readonly filtro: Alvo;
  readonly id: string;
  readonly nome: string;
  readonly ehVeiculo: boolean;
}

async function bem(tx: Tx, a: { readonly veiculoId?: string | undefined; readonly maquinaId?: string | undefined }): Promise<Bem> {
  if (a.veiculoId !== undefined) {
    const v = await tx.veiculoDaFrota.findUnique({ where: { id: a.veiculoId }, select: { placa: true } });
    if (v === null) throw new Error("Veículo não encontrado. Nada foi gravado.");
    return { filtro: { veiculoId: a.veiculoId }, id: a.veiculoId, nome: `o veículo ${v.placa}`, ehVeiculo: true };
  }
  const m = await tx.maquinaDaFrota.findUnique({ where: { id: a.maquinaId ?? "" }, select: { codigo: true } });
  if (m === null) throw new Error("Máquina não encontrada. Nada foi gravado.");
  return { filtro: { maquinaId: a.maquinaId ?? "" }, id: a.maquinaId ?? "", nome: `a máquina ${m.codigo}`, ehVeiculo: false };
}

/** O bem estava na frota e não baixado no dia (a mesma régua do abastecimento). */
async function exigirBemEmUso(tx: Tx, b: Bem, dia: string): Promise<void> {
  const ms = await tx.mudancaDeSituacaoDaFrota.findMany({ where: { ...b.filtro, anulacao: null }, orderBy: { desde: "asc" }, select: { desde: true, situacao: true } });
  const s = situacaoNoDia(ms.map((m) => ({ dia: diaCivil(m.desde), situacao: m.situacao })), dia);
  if (s === null) throw new Error(`${cap(b.nome)} não estava na frota em ${br(dia)}. Nada foi gravado.`);
  if (s === "BAIXADA") throw new Error(`${cap(b.nome)} estava baixado da frota em ${br(dia)}. Nada foi gravado.`);
}
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ═══ CONDUTOR ═══

const zDadosDoCondutor = {
  cnhNumero: z.string().trim().transform((s) => s.replace(/\D/g, "")).refine((s) => s.length === 11, "O número da CNH tem 11 dígitos."),
  cnhCategoria: zCategoria,
  cnhValidade: zDia,
  vinculo: z.string().trim().min(3, "Informe o vínculo (servidor efetivo, comissionado, terceirizado...).").max(60),
  vigenteDesde: zDia,
  fundamento: z.string().trim().min(5, "Diga de onde vêm os dados (CNH apresentada, ato de designação)."),
  criadoPor: z.string().min(1),
};
export const zCadastrarCondutor = z.object({
  nome: z.string().trim().min(3, "Informe o nome do condutor.").max(80),
  matricula: z.string().trim().min(1, "Informe a matrícula ou o registro do vínculo.").max(20),
  ...zDadosDoCondutor,
});

export async function cadastrarCondutor(prisma: PrismaClient, input: z.input<typeof zCadastrarCondutor>): Promise<{ readonly id: string }> {
  const d = zCadastrarCondutor.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarCondutor, "ENTE");
    const ja = await tx.condutorDaFrota.findUnique({ where: { matricula: d.matricula }, select: { nome: true } });
    if (ja !== null) throw new Error(`A matrícula ${d.matricula} já é do condutor ${ja.nome}: publique uma versão dele. Nada foi gravado.`);
    return tx.condutorDaFrota.create({
      data: {
        nome: d.nome, matricula: d.matricula, criadoPor: d.criadoPor,
        versoes: { create: [{ versao: 1, cnhNumero: d.cnhNumero, cnhCategoria: d.cnhCategoria, cnhValidade: meioDiaCivil(d.cnhValidade), vinculo: d.vinculo, ativo: true, vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: d.fundamento, criadoPor: d.criadoPor }] },
      },
      select: { id: true },
    });
  });
}

export const zPublicarVersaoDoCondutor = z.object({ condutorId: z.string().min(1), ativo: z.boolean(), ...zDadosDoCondutor });

export async function publicarVersaoDoCondutor(prisma: PrismaClient, input: z.input<typeof zPublicarVersaoDoCondutor>): Promise<{ readonly versao: number }> {
  const d = zPublicarVersaoDoCondutor.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarVersaoDoCondutor, "ENTE");
    await travar(tx, "BemDaFrota", [d.condutorId]);
    const ultima = await tx.versaoDoCondutor.findFirst({ where: { condutorId: d.condutorId }, orderBy: { versao: "desc" }, select: { versao: true, vigenteDesde: true } });
    if (ultima === null) throw new Error("Condutor não encontrado. Nada foi gravado.");
    if (d.vigenteDesde < diaCivil(ultima.vigenteDesde)) throw new Error(`A versão ${String(ultima.versao)} vale desde ${diaCivilBr(ultima.vigenteDesde)}: a nova não pode valer antes. Nada foi gravado.`);
    const versao = ultima.versao + 1;
    await tx.versaoDoCondutor.create({ data: { condutorId: d.condutorId, versao, cnhNumero: d.cnhNumero, cnhCategoria: d.cnhCategoria, cnhValidade: meioDiaCivil(d.cnhValidade), vinculo: d.vinculo, ativo: d.ativo, vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: d.fundamento, criadoPor: d.criadoPor } });
    return { versao };
  });
}

/** A versão do condutor que vale no dia, e se ele pode dirigir aquele bem naquele dia. Devolve o motivo da recusa. */
async function condutorHabilitado(tx: Tx, condutorId: string, b: Bem, dia: string, ate: string): Promise<{ readonly nome: string }> {
  const c = await tx.condutorDaFrota.findUnique({ where: { id: condutorId }, select: { nome: true, versoes: { orderBy: { versao: "asc" }, select: { vigenteDesde: true, ativo: true, cnhCategoria: true, cnhValidade: true } } } });
  if (c === null) throw new Error("Condutor não encontrado. Nada foi gravado.");
  const v = c.versoes.filter((x) => diaCivil(x.vigenteDesde) <= dia).pop();
  if (v === undefined || !v.ativo) throw new Error(`O condutor ${c.nome} não estava ativo em ${br(dia)}. Nada foi gravado.`);
  if (diaCivil(v.cnhValidade) < ate) {
    throw new Error(`A CNH do condutor ${c.nome} vence em ${diaCivilBr(v.cnhValidade)}, antes de ${br(ate)}: com a habilitação vencida ele não dirige ${b.nome}. Nada foi gravado.`);
  }
  const ex = await tx.exigenciaDeHabilitacaoDaFrota.findFirst({ where: { ...b.filtro, vigenteDesde: { lte: meioDiaCivil(dia) } }, orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }], select: { categoriasAceitas: true } });
  if (ex !== null && !categoriasDaHabilitacao(v.cnhCategoria).some((cat) => ex.categoriasAceitas.includes(cat))) {
    throw new Error(`A CNH do condutor ${c.nome} é da categoria ${v.cnhCategoria}, e ${b.nome} aceita ${ex.categoriasAceitas.join(", ")} (declarado pelo ente). Nada foi gravado.`);
  }
  return { nome: c.nome };
}

export const zDeclararExigenciaDeHabilitacao = z
  .object({
    ...zAlvo,
    categoriasAceitas: z.array(z.enum(["A", "B", "C", "D", "E", "ACC"])).min(1, "Escolha ao menos uma categoria."),
    vigenteDesde: zDia,
    fundamento: z.string().trim().min(5, "Diga de onde vem a exigência (manual do veículo, norma interna, contrato de locação)."),
    criadoPor: z.string().min(1),
  })
  .refine(umBem, MSG_BEM);

export async function declararExigenciaDeHabilitacao(prisma: PrismaClient, input: z.input<typeof zDeclararExigenciaDeHabilitacao>): Promise<{ readonly id: string }> {
  const d = zDeclararExigenciaDeHabilitacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararExigenciaDeHabilitacao, "ENTE");
    const b = await bem(tx, d);
    return tx.exigenciaDeHabilitacaoDaFrota.create({ data: { ...b.filtro, categoriasAceitas: [...new Set(d.categoriasAceitas)].sort(), vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: d.fundamento, criadoPor: d.criadoPor }, select: { id: true } });
  });
}

// ═══ ORDEM DE ABASTECIMENTO ═══

export const zEmitirOrdemDeAbastecimento = z
  .object({
    ...zAlvo,
    condutorId: z.string().min(1, "Escolha o condutor."),
    combustivel: z.enum(COMBUSTIVEIS),
    quantidadeAutorizada: z.string().trim().min(1, "Informe a quantidade máxima."),
    emitidaEm: zDia,
    validaAte: zDia,
    local: z.string().trim().min(3, "Diga onde abastecer (posto, contrato, tanque).").max(120),
    criadoPor: z.string().min(1),
  })
  .refine(umBem, MSG_BEM)
  .refine((x) => x.validaAte >= x.emitidaEm, { message: "O prazo da ordem termina antes da emissão.", path: ["validaAte"] });

export async function emitirOrdemDeAbastecimento(prisma: PrismaClient, input: z.input<typeof zEmitirOrdemDeAbastecimento>): Promise<{ readonly id: string; readonly numero: number }> {
  const d = zEmitirOrdemDeAbastecimento.parse(input);
  const quantidade = exigirQuantidade(d.quantidadeAutorizada);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.emitirOrdemDeAbastecimento, "ENTE");
    const b = await bem(tx, d);
    // A MESMA ORDEM DO ABASTECIMENTO: o bem primeiro, depois o condutor (e a numeração). Travar os três numa chamada os
    // ordenaria pelo id, e um abastecimento (bem, depois condutor) concorrente poderia se abraçar com esta emissão.
    await travar(tx, "BemDaFrota", [b.id]);
    await travar(tx, "BemDaFrota", [d.condutorId, NUMERACAO_ORDEM]);
    await exigirBemEmUso(tx, b, d.emitidaEm);
    await condutorHabilitado(tx, d.condutorId, b, d.emitidaEm, d.validaAte);
    const ultimo = await tx.ordemDeAbastecimento.aggregate({ _max: { numero: true } });
    const numero = (ultimo._max.numero ?? 0) + 1;
    const o = await tx.ordemDeAbastecimento.create({
      data: { ...b.filtro, numero, condutorId: d.condutorId, combustivel: d.combustivel, quantidadeAutorizada: quantidade, emitidaEm: meioDiaCivil(d.emitidaEm), validaAte: meioDiaCivil(d.validaAte), local: d.local, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { id: o.id, numero };
  });
}

export const zCancelarOrdemDeAbastecimento = z.object({ ordemId: z.string().min(1), motivo: z.string().trim().min(5, "Diga por que a ordem é cancelada."), criadoPor: z.string().min(1) });

export async function cancelarOrdemDeAbastecimento(prisma: PrismaClient, input: z.input<typeof zCancelarOrdemDeAbastecimento>): Promise<void> {
  const d = zCancelarOrdemDeAbastecimento.parse(input);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarOrdemDeAbastecimento, "ENTE");
    const alvo = await tx.ordemDeAbastecimento.findUnique({ where: { id: d.ordemId }, select: { veiculoId: true, maquinaId: true } });
    if (alvo === null) throw new Error("Ordem de abastecimento não encontrada. Nada foi gravado.");
    await travar(tx, "BemDaFrota", [alvo.veiculoId ?? alvo.maquinaId ?? ""]);
    const o = await tx.ordemDeAbastecimento.findUniqueOrThrow({ where: { id: d.ordemId }, select: { numero: true, cancelamento: { select: { id: true } } } });
    if (o.cancelamento !== null) throw new Error(`A ordem nº ${String(o.numero)} já foi cancelada. Nada foi gravado.`);
    await tx.cancelamentoDaOrdemDeAbastecimento.create({ data: { ordemId: d.ordemId, motivo: d.motivo, criadoPor: d.criadoPor } });
  });
}

/** O quanto da ordem já foi abastecido (abastecimentos não anulados). */
function abastecidoNaOrdem(abs: readonly { readonly quantidade: { toFixed(n: number): string }; readonly anulacao: unknown }[]): Money {
  return abs.filter((a) => a.anulacao === null).reduce<Money>((t, a) => toMoney(t.plus(a.quantidade.toFixed(2))), toMoney(0));
}

/**
 * O ABASTECIMENTO PELA ORDEM: dentro da transação do abastecimento (`servico.ts`), ANTES de gravar. Confere o bem, o
 * combustível, o prazo, o cancelamento, o saldo e a CNH do condutor no dia. FORA_DO_CENSO: quem chama autorizou e travou.
 */
export async function conferirOrdemNoAbastecimentoNaTx(
  tx: Tx,
  d: { readonly ordemId: string; readonly alvo: Alvo; readonly combustivel: string; readonly quantidade: string; readonly dia: string }
): Promise<void> {
  const o = await tx.ordemDeAbastecimento.findUnique({
    where: { id: d.ordemId },
    select: { numero: true, veiculoId: true, maquinaId: true, condutorId: true, combustivel: true, quantidadeAutorizada: true, emitidaEm: true, validaAte: true, cancelamento: { select: { id: true } }, abastecimentos: { select: { quantidade: true, anulacao: { select: { id: true } } } } },
  });
  if (o === null) throw new Error("Ordem de abastecimento não encontrada. Nada foi gravado.");
  const n = `A ordem nº ${String(o.numero)}`;
  const alvoDaOrdem = o.veiculoId ?? o.maquinaId;
  const alvo = "veiculoId" in d.alvo ? d.alvo.veiculoId : d.alvo.maquinaId;
  if (alvoDaOrdem !== alvo) throw new Error(`${n} é de outro bem. Nada foi gravado.`);
  if (o.cancelamento !== null) throw new Error(`${n} foi cancelada. Nada foi gravado.`);
  if (o.combustivel !== d.combustivel) throw new Error(`${n} autoriza ${o.combustivel.toLowerCase()}, não ${d.combustivel.toLowerCase()}. Nada foi gravado.`);
  if (d.dia < diaCivil(o.emitidaEm) || d.dia > diaCivil(o.validaAte)) throw new Error(`${n} vale de ${diaCivilBr(o.emitidaEm)} a ${diaCivilBr(o.validaAte)}, e o abastecimento é de ${br(d.dia)}. Nada foi gravado.`);
  const ja = abastecidoNaOrdem(o.abastecimentos);
  const autorizado = toMoney(o.quantidadeAutorizada.toFixed(2));
  if (ja.plus(d.quantidade).greaterThan(autorizado)) {
    throw new Error(`${n} autoriza ${autorizado.toFixed(2)}, já foram abastecidos ${ja.toFixed(2)}, e este abastecimento é de ${toMoney(d.quantidade).toFixed(2)}: passa do autorizado. Nada foi gravado.`);
  }
  const b = await bem(tx, "veiculoId" in d.alvo ? { veiculoId: d.alvo.veiculoId } : { maquinaId: d.alvo.maquinaId });
  // O condutor travado: uma versão "inativo" concorrente não passa entre a conferência e a gravação (posto 35 de novo,
  // depois do bem que quem chama já travou).
  await travar(tx, "BemDaFrota", [o.condutorId]);
  await condutorHabilitado(tx, o.condutorId, b, d.dia, d.dia);
}

// ═══ LEITURA DO MARCADOR ═══

/**
 * As leituras que valem: as não corrigidas (a correção substitui a errada; a errada fica guardada). Ordenadas por data e
 * gravação. A que está sendo corrigida sai da conta da conferência.
 */
async function leiturasQueValem(tx: Tx, alvo: Alvo, excetoId?: string) {
  const ls = await tx.leituraDoMarcadorDaFrota.findMany({ where: { ...alvo }, orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { id: true, data: true, valor: true, abastecimentoId: true, corrigeId: true, corrigidaPor: { select: { id: true } }, abastecimento: { select: { anulacao: { select: { id: true } } } } } });
  // A leitura de abastecimento ANULADO sai da conta junto com ele (o lançamento no bem errado não trava o hodômetro), e
  // as correções dela também: a cadeia de correções volta até a leitura original para saber de qual abastecimento é.
  const porId = new Map(ls.map((l) => [l.id, l]));
  const anulada = (l: (typeof ls)[number]): boolean => {
    let raiz = l;
    for (let passo = 0; passo < 1000 && raiz.corrigeId !== null; passo += 1) raiz = porId.get(raiz.corrigeId) ?? raiz;
    return raiz.abastecimento !== null && raiz.abastecimento.anulacao !== null;
  };
  return ls.filter((l) => l.corrigidaPor === null && l.id !== excetoId && !anulada(l));
}

/** Grava a leitura conferindo que ela não diminui: não menor que a anterior, nem maior que a seguinte. FORA_DO_CENSO. */
export async function registrarLeituraNaTx(
  tx: Tx,
  d: { readonly alvo: Alvo; readonly nome: string; readonly ehVeiculo: boolean; readonly dia: string; readonly valor: string; readonly abastecimentoId?: string; readonly corrigeId?: string; readonly motivo?: string; readonly criadoPor: string }
): Promise<{ readonly id: string }> {
  // Formato brasileiro: o ponto só agrupa milhares ("45.230,5"); "45230.5" é recusado (o ponto seria lido como milhar).
  if (!/^\d{1,3}(\.\d{3})*(,\d)?$|^\d+(,\d)?$/.test(d.valor.trim())) throw new Error("Informe a leitura com vírgula na casa decimal (ex.: 45.230,5), até uma casa. Nada foi gravado.");
  const valor = toMoney(d.valor.trim().replace(/\./g, "").replace(",", "."));
  const unidade = d.ehVeiculo ? "km" : "h";
  const marcador = d.ehVeiculo ? "hodômetro" : "horímetro";
  if (d.corrigeId !== undefined) {
    const errada = await tx.leituraDoMarcadorDaFrota.findUnique({ where: { id: d.corrigeId }, select: { veiculoId: true, maquinaId: true, corrigidaPor: { select: { id: true } } } });
    const alvo = "veiculoId" in d.alvo ? d.alvo.veiculoId : d.alvo.maquinaId;
    if (errada === null || (errada.veiculoId ?? errada.maquinaId) !== alvo) throw new Error("A leitura a corrigir não é deste bem. Nada foi gravado.");
    if (errada.corrigidaPor !== null) throw new Error("Esta leitura já foi corrigida: corrija a correção. Nada foi gravado.");
  }
  const valem = await leiturasQueValem(tx, d.alvo, d.corrigeId);
  const antes = valem.filter((l) => diaCivil(l.data) <= d.dia).pop();
  const depois = valem.find((l) => diaCivil(l.data) > d.dia);
  if (antes !== undefined && valor.lessThan(antes.valor.toFixed(1))) {
    throw new Error(`A leitura de ${valor.toFixed(1)} ${unidade} é menor que a de ${diaCivilBr(antes.data)} (${antes.valor.toFixed(1)} ${unidade}): o ${marcador} ${d.nome.startsWith("o ") ? `do ${d.nome.slice(2)}` : `da ${d.nome.slice(2)}`} não volta. Se a anterior está errada, corrija-a. Nada foi gravado.`);
  }
  if (depois !== undefined && valor.greaterThan(depois.valor.toFixed(1))) {
    throw new Error(`A leitura de ${valor.toFixed(1)} ${unidade} é maior que a de ${diaCivilBr(depois.data)} (${depois.valor.toFixed(1)} ${unidade}), posterior: o ${marcador} não volta. Nada foi gravado.`);
  }
  return tx.leituraDoMarcadorDaFrota.create({
    data: { ...d.alvo, data: meioDiaCivil(d.dia), valor: valor.toFixed(1), abastecimentoId: d.abastecimentoId ?? null, corrigeId: d.corrigeId ?? null, motivo: d.motivo ?? null, criadoPor: d.criadoPor },
    select: { id: true },
  });
}

export const zRegistrarLeituraDoMarcador = z
  .object({
    ...zAlvo,
    data: zDia,
    valor: z.string().trim().min(1, "Informe a leitura."),
    corrigeId: z.string().min(1).optional(),
    motivo: z.string().trim().optional(),
    criadoPor: z.string().min(1),
  })
  .refine(umBem, MSG_BEM)
  .refine((x) => x.corrigeId === undefined || (x.motivo !== undefined && x.motivo.length >= 5), { message: "A correção diz por que a leitura anterior está errada.", path: ["motivo"] });

export async function registrarLeituraDoMarcador(prisma: PrismaClient, input: z.input<typeof zRegistrarLeituraDoMarcador>): Promise<{ readonly id: string }> {
  const d = zRegistrarLeituraDoMarcador.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarLeituraDoMarcador, "ENTE");
    const b = await bem(tx, d);
    await travar(tx, "BemDaFrota", [b.id]);
    await exigirBemEmUso(tx, b, d.data);
    return registrarLeituraNaTx(tx, { alvo: b.filtro, nome: b.nome, ehVeiculo: b.ehVeiculo, dia: d.data, valor: d.valor, ...(d.corrigeId !== undefined ? { corrigeId: d.corrigeId, motivo: d.motivo ?? "" } : {}), criadoPor: d.criadoPor });
  });
}

export interface ConsumoNoAbastecimento {
  readonly data: string;
  readonly quantidade: string;
  readonly leitura: string | null;
  /** km (veículo) ou horas (máquina) desde a leitura anterior que vale. */
  readonly percorrido: string | null;
  /** km por litro (veículo) ou litros por hora (máquina); nulo sem as duas leituras. */
  readonly consumo: string | null;
}

/**
 * O CONSUMO, DERIVADO DAS LEITURAS QUE VALEM: em cada abastecimento não anulado com leitura, o percorrido desde a leitura
 * anterior e o consumo (km/L no veículo, L/h na máquina). Só leitura; nenhum limite de consumo é presumido aqui.
 */
export async function consumoDoBemDaFrota(tx: Tx, alvo: Alvo, ehVeiculo: boolean): Promise<readonly ConsumoNoAbastecimento[]> {
  const valem = await leiturasQueValem(tx, alvo);
  const abs = await tx.abastecimentoDaFrota.findMany({ where: { ...alvo, anulacao: null }, orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { id: true, data: true, quantidade: true, leitura: { select: { id: true } } } });
  // A correção pode ser corrigida: segue a cadeia até a leitura que vale (a última correção).
  const correcoes = await tx.leituraDoMarcadorDaFrota.findMany({ where: { ...alvo, corrigeId: { not: null } }, select: { id: true, corrigeId: true } });
  const corrigidaPor = new Map(correcoes.map((c) => [c.corrigeId ?? "", c.id]));
  const queVale = (id: string): string => {
    let atual = id;
    for (let passo = 0; passo < 1000 && corrigidaPor.has(atual); passo += 1) atual = corrigidaPor.get(atual) ?? atual;
    return atual;
  };
  return abs.map((a) => {
    const idQueVale = a.leitura === null ? null : queVale(a.leitura.id);
    const i = idQueVale === null ? -1 : valem.findIndex((l) => l.id === idQueVale);
    const atual = i >= 0 ? valem[i] : undefined;
    const anterior = i > 0 ? valem[i - 1] : undefined;
    const litros = toMoney(a.quantidade.toFixed(2));
    const percorrido = atual !== undefined && anterior !== undefined ? toMoney(atual.valor.toFixed(1)).minus(anterior.valor.toFixed(1)) : null;
    const consumo = percorrido === null || percorrido.isZero() || litros.isZero() ? null : ehVeiculo ? percorrido.dividedBy(litros) : litros.dividedBy(percorrido);
    return {
      data: diaCivilBr(a.data), quantidade: litros.toFixed(2), leitura: atual === undefined ? null : atual.valor.toFixed(1),
      percorrido: percorrido === null ? null : percorrido.toFixed(1), consumo: consumo === null ? null : consumo.toDecimalPlaces(2).toFixed(2),
    };
  });
}

// ═══ MANUTENÇÃO ═══

export const zAbrirManutencao = z
  .object({
    ...zAlvo,
    tipo: z.enum(["PREVENTIVA", "CORRETIVA"]),
    descricao: z.string().trim().min(5, "Descreva o serviço pedido."),
    solicitante: z.string().trim().min(3, "Informe quem pediu.").max(80),
    dataDoPedido: zDia,
    criadoPor: z.string().min(1),
  })
  .refine(umBem, MSG_BEM);

export async function abrirManutencaoDaFrota(prisma: PrismaClient, input: z.input<typeof zAbrirManutencao>): Promise<{ readonly id: string; readonly numero: number }> {
  const d = zAbrirManutencao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.abrirManutencaoDaFrota, "ENTE");
    const b = await bem(tx, d);
    await travar(tx, "BemDaFrota", [b.id, NUMERACAO_MANUTENCAO]);
    await exigirBemEmUso(tx, b, d.dataDoPedido);
    const ultimo = await tx.manutencaoDaFrota.aggregate({ _max: { numero: true } });
    const numero = (ultimo._max.numero ?? 0) + 1;
    const m = await tx.manutencaoDaFrota.create({ data: { ...b.filtro, numero, tipo: d.tipo, descricao: d.descricao, solicitante: d.solicitante, dataDoPedido: meioDiaCivil(d.dataDoPedido), criadoPor: d.criadoPor }, select: { id: true } });
    return { id: m.id, numero };
  });
}

async function manutencaoAberta(tx: Tx, id: string) {
  // TRAVA ANTES DE LER O ESTADO: as fases moram em tabelas diferentes, e só a trava do bem impede que a conclusão e o
  // cancelamento da mesma manutenção, concorrentes, leiam "aberta" e gravem os dois.
  const alvo = await tx.manutencaoDaFrota.findUnique({ where: { id }, select: { veiculoId: true, maquinaId: true } });
  if (alvo === null) throw new Error("Manutenção não encontrada. Nada foi gravado.");
  await travar(tx, "BemDaFrota", [alvo.veiculoId ?? alvo.maquinaId ?? ""]);
  const m = await tx.manutencaoDaFrota.findUnique({
    where: { id },
    select: { numero: true, veiculoId: true, maquinaId: true, dataDoPedido: true, autorizacao: { select: { data: true } }, conclusao: { select: { id: true } }, cancelamento: { select: { id: true } } },
  });
  if (m === null) throw new Error("Manutenção não encontrada. Nada foi gravado.");
  if (m.cancelamento !== null) throw new Error(`A manutenção nº ${String(m.numero)} foi cancelada. Nada foi gravado.`);
  if (m.conclusao !== null) throw new Error(`A manutenção nº ${String(m.numero)} já foi concluída. Nada foi gravado.`);
  return m;
}

const zValor = z.string().trim().transform((s) => s.replace(/\./g, "").replace(",", ".")).refine((s) => /^\d+(\.\d{1,2})?$/.test(s), "Informe o valor em reais, com até duas casas.");

export const zAutorizarManutencao = z.object({
  manutencaoId: z.string().min(1),
  data: zDia,
  contratoId: z.string().min(1).optional(),
  fornecedor: z.string().trim().min(3, "Informe quem executa o serviço.").max(120),
  valorEstimado: zValor,
  criadoPor: z.string().min(1),
});

export async function autorizarManutencaoDaFrota(prisma: PrismaClient, input: z.input<typeof zAutorizarManutencao>): Promise<{ readonly id: string }> {
  const d = zAutorizarManutencao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.autorizarManutencaoDaFrota, "ENTE");
    const m = await manutencaoAberta(tx, d.manutencaoId);
    if (m.autorizacao !== null) throw new Error(`A manutenção nº ${String(m.numero)} já foi autorizada. Nada foi gravado.`);
    if (d.data < diaCivil(m.dataDoPedido)) throw new Error(`A autorização não pode ser anterior ao pedido (${diaCivilBr(m.dataDoPedido)}). Nada foi gravado.`);
    if (d.contratoId !== undefined && (await tx.contrato.findUnique({ where: { id: d.contratoId }, select: { id: true } })) === null) throw new Error("O contrato escolhido não existe. Nada foi gravado.");
    return tx.autorizacaoDaManutencaoDaFrota.create({ data: { manutencaoId: d.manutencaoId, data: meioDiaCivil(d.data), contratoId: d.contratoId ?? null, fornecedor: d.fornecedor, valorEstimado: toMoney(d.valorEstimado).toFixed(2), criadoPor: d.criadoPor }, select: { id: true } });
  });
}

export const zConcluirManutencao = z.object({
  manutencaoId: z.string().min(1),
  data: zDia,
  custo: zValor,
  documento: z.string().trim().min(3, "Informe a nota fiscal ou o documento do serviço.").max(120),
  criadoPor: z.string().min(1),
});

export async function concluirManutencaoDaFrota(prisma: PrismaClient, input: z.input<typeof zConcluirManutencao>): Promise<{ readonly id: string }> {
  const d = zConcluirManutencao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.concluirManutencaoDaFrota, "ENTE");
    const m = await manutencaoAberta(tx, d.manutencaoId);
    if (m.autorizacao === null) throw new Error(`A manutenção nº ${String(m.numero)} não foi autorizada: não se conclui serviço que ninguém autorizou. Nada foi gravado.`);
    if (d.data < diaCivil(m.autorizacao.data)) throw new Error(`A conclusão não pode ser anterior à autorização (${diaCivilBr(m.autorizacao.data)}). Nada foi gravado.`);
    return tx.conclusaoDaManutencaoDaFrota.create({ data: { manutencaoId: d.manutencaoId, data: meioDiaCivil(d.data), custo: toMoney(d.custo).toFixed(2), documento: d.documento, criadoPor: d.criadoPor }, select: { id: true } });
  });
}

export const zCancelarManutencao = z.object({ manutencaoId: z.string().min(1), motivo: z.string().trim().min(5, "Diga por que a manutenção é cancelada."), criadoPor: z.string().min(1) });

export async function cancelarManutencaoDaFrota(prisma: PrismaClient, input: z.input<typeof zCancelarManutencao>): Promise<void> {
  const d = zCancelarManutencao.parse(input);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarManutencaoDaFrota, "ENTE");
    await manutencaoAberta(tx, d.manutencaoId);
    await tx.cancelamentoDaManutencaoDaFrota.create({ data: { manutencaoId: d.manutencaoId, motivo: d.motivo, criadoPor: d.criadoPor } });
  });
}
