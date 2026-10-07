import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { baixarMultaDeTransito, listarMultasDeTransito, registrarMultaDeTransito, ROTULO_DA_BAIXA, TIPOS_DE_BAIXA_DA_MULTA, type TipoDeBaixaDaMulta } from "../../modules/m36-frota/multas.js";

/**
 * V36 — AS MULTAS DE TRÂNSITO na tela (TR 5.10.1.45). A regra é do M36 (`modules/m36-frota/multas.ts`); aqui a sessão,
 * os veículos para escolher e o formato. Leitura: CONSULTAR_PATRIMONIO no ente.
 */

export { ROTULO_DA_BAIXA, TIPOS_DE_BAIXA_DA_MULTA };
export type { TipoDeBaixaDaMulta };

export interface MultaDaTela {
  readonly id: string;
  readonly placa: string;
  readonly auto: string;
  readonly diaDaInfracao: string;
  readonly diaDaNotificacao: string;
  readonly diaDoVencimento: string | null;
  readonly local: string;
  readonly infracao: string;
  readonly valor: string;
  readonly infrator: string;
  readonly baixa: { readonly rotulo: string; readonly dia: string; readonly observacao: string } | null;
}

export interface TelaDasMultas {
  readonly multas: readonly MultaDaTela[];
  readonly emAberto: { readonly quantidade: number; readonly valor: string };
  readonly porInfrator: readonly { readonly infrator: string; readonly quantidade: number; readonly valor: string }[];
  readonly veiculos: readonly { readonly id: string; readonly rotulo: string }[];
}

const cpf = (d: string): string => (d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d);
/** Quem só consulta o patrimônio vê o CPF do infrator mascarado (o meio, como na publicação de dados pessoais); quem gere a frota, inteiro. */
const cpfMascarado = (d: string): string => (d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : d);

export async function lerMultasDeTransito(filtro: { readonly soEmAberto: boolean }): Promise<TelaDasMultas> {
  await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const prisma = cliente();
  const documento = (await acoesPermitidas(["CADASTRAR_FROTA"])).has("CADASTRAR_FROTA") ? cpf : cpfMascarado;
  const [q, veiculos] = await Promise.all([
    listarMultasDeTransito(prisma, { soEmAberto: filtro.soEmAberto }),
    prisma.veiculoDaFrota.findMany({ orderBy: { placa: "asc" }, select: { id: true, placa: true, ug: { select: { codigoTce: true } } } }),
  ]);
  return {
    multas: q.multas.map((m) => ({
      id: m.id,
      placa: m.placa,
      auto: `${m.numeroDoAuto} (${m.orgaoAutuador})`,
      diaDaInfracao: m.diaDaInfracao,
      diaDaNotificacao: m.diaDaNotificacao,
      diaDoVencimento: m.diaDoVencimento,
      local: m.local,
      infracao: m.infracao,
      valor: m.valor.toFixed(2),
      infrator: `${m.infrator.nome} (${documento(m.infrator.documento)})`,
      baixa: m.baixa === null ? null : { rotulo: ROTULO_DA_BAIXA[m.baixa.tipo], dia: m.baixa.dia, observacao: m.baixa.observacao },
    })),
    emAberto: { quantidade: q.emAberto.quantidade, valor: q.emAberto.valor.toFixed(2) },
    porInfrator: q.porInfrator.map((i) => ({ infrator: `${i.nome} (${documento(i.documento)})`, quantidade: i.quantidade, valor: i.valor.toFixed(2) })),
    veiculos: veiculos.map((v) => ({ id: v.id, rotulo: `${v.placa} · UG ${v.ug.codigoTce}` })),
  };
}

export async function registrarMultaPelaTela(input: {
  readonly veiculoId: string;
  readonly orgaoAutuador: string;
  readonly numeroDoAuto: string;
  readonly diaDaInfracao: string;
  readonly diaDaNotificacao: string;
  readonly diaDoVencimento: string;
  readonly local: string;
  readonly infracao: string;
  readonly valor: string;
  readonly infratorDocumento: string;
}): Promise<void> {
  await comEscritaAutenticada("CADASTRAR_FROTA", async (criadoPor) => {
    const { diaDoVencimento, ...resto } = input;
    await registrarMultaDeTransito(cliente(), { ...resto, ...(diaDoVencimento !== "" ? { diaDoVencimento } : {}), criadoPor });
  });
}

export async function baixarMultaPelaTela(input: { readonly multaId: string; readonly tipo: string; readonly dia: string; readonly observacao: string }): Promise<void> {
  const tipo = TIPOS_DE_BAIXA_DA_MULTA.find((t) => t === input.tipo);
  if (tipo === undefined) throw new Error("Escolha como a multa terminou. Nada foi gravado.");
  await comEscritaAutenticada("CADASTRAR_FROTA", async (criadoPor) => {
    await baixarMultaDeTransito(cliente(), { multaId: input.multaId, tipo, dia: input.dia, observacao: input.observacao, criadoPor });
  });
}
