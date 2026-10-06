import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { serializar } from "../../packages/contracts/index.js";
import {
  bloquearDotacaoParaEmendas,
  cadastrarEmendaAoOrcamento,
  EmendaInvalidaError,
  emendasDaProposta,
  revogarBloqueioDeEmenda,
  sancionarEmendaAoOrcamento,
  type SituacaoDaEmenda,
} from "../../modules/m02b-plurianual/emendas";
import { detalharPropostaOrcamentaria, listarPropostasOrcamentarias } from "../../modules/m02-planejamento/proposta-orcamentaria";

/**
 * V36 — A TELA DAS EMENDAS AO PROJETO DA LOA (TR 5.9.3.13 a 5.9.3.15). Leitura sob CONSULTAR_PLANEJAMENTO; os atos
 * sob as ações próprias, cobradas no serviço. Dinheiro sai como string decimal; a conversão do que a pessoa digita
 * ("1.234,56", "-500,00") é desta borda.
 */

export interface DotacaoDaProposta {
  readonly linhaId: string;
  readonly ficha: number;
  readonly unidade: string;
  readonly natureza: string;
  readonly fonte: string;
  readonly vigente: string;
  readonly bloqueio: { readonly id: string; readonly motivo: string } | null;
}

export interface EmendaNaTela {
  readonly id: string;
  readonly numero: number;
  readonly data: string;
  readonly objetivo: string;
  readonly justificativa: string;
  readonly vereador: string;
  readonly textoJuridico: string;
  readonly situacao: SituacaoDaEmenda;
  readonly ato: string | null;
  readonly dataDaSancao: string | null;
  readonly acrescimos: string;
  readonly reducoes: string;
  readonly itens: readonly { readonly id: string; readonly ficha: number; readonly valor: string; readonly sancionado: boolean | null }[];
}

export interface TelaDeEmendas {
  readonly propostas: readonly { readonly id: string; readonly exercicio: number; readonly descricao: string; readonly efetivada: boolean }[];
  readonly escolhida: {
    readonly id: string;
    readonly exercicio: number;
    readonly descricao: string;
    readonly efetivada: boolean;
    readonly dotacoes: readonly DotacaoDaProposta[];
    readonly emendas: readonly EmendaNaTela[];
  } | null;
}

export async function lerTelaDeEmendas(p: { readonly propostaId: string }): Promise<TelaDeEmendas> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const prisma = cliente();
  const lista = await listarPropostasOrcamentarias(prisma);
  const propostas = lista.map((x) => ({ id: x.id, exercicio: x.exercicio, descricao: x.descricao, efetivada: x.efetivadaEm !== null }));
  if (p.propostaId === "") return { propostas, escolhida: null };
  const d = await detalharPropostaOrcamentaria(prisma, p.propostaId);
  if (d === null) throw new Error("A proposta orçamentária pedida não existe.");
  const bloqueios = await prisma.bloqueioDeEmenda.findMany({
    where: { linhaDeDespesa: { propostaOrcamentariaId: d.id }, revogaDeId: null, revogadoPor: null },
    select: { id: true, linhaDeDespesaId: true, motivo: true },
  });
  const bloqueioDa = new Map(bloqueios.map((b) => [b.linhaDeDespesaId, { id: b.id, motivo: b.motivo }]));
  const fichaDa = new Map(d.despesas.map((l) => [l.id, l.numero]));
  const emendas = await emendasDaProposta(prisma, d.id);
  return {
    propostas,
    escolhida: {
      id: d.id,
      exercicio: d.exercicio,
      descricao: d.descricao,
      efetivada: propostas.find((x) => x.id === d.id)?.efetivada ?? false,
      dotacoes: d.despesas.map((l) => ({
        linhaId: l.id, ficha: l.numero, unidade: `${l.unidadeCodigo} ${l.unidadeNome}`, natureza: l.naturezaCodigo, fonte: l.fonteCodigo,
        vigente: l.valorVigente, bloqueio: bloqueioDa.get(l.id) ?? null,
      })),
      emendas: emendas.map((e) => ({
        id: e.id, numero: e.numero, data: e.data, objetivo: e.objetivo, justificativa: e.justificativa, vereador: e.vereador, textoJuridico: e.textoJuridico,
        situacao: e.situacao, ato: e.ato, dataDaSancao: e.dataDaSancao, acrescimos: serializar(e.acrescimos), reducoes: serializar(e.reducoes),
        itens: e.itens.map((i) => ({ id: i.id, ficha: fichaDa.get(i.linhaDeDespesaId) ?? 0, valor: serializar(i.valor), sancionado: i.sancionado })),
      })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A borda: o que a pessoa digita
// ─────────────────────────────────────────────────────────────────────────────

/** "1.234,56", "-1.234,56", "1234.56" → decimal com sinal. Separador de milhar só sai com vírgula decimal. */
export function valorComSinalDoFormulario(t: string): string | null {
  const s = t.trim().replace(/\s/g, "").replace(/^R\$/, "");
  const negativo = s.startsWith("-");
  const corpo = negativo ? s.slice(1) : s;
  const normalizado = corpo.includes(",") ? corpo.replace(/\./g, "").replace(",", ".") : corpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return `${negativo ? "-" : ""}${normalizado}`;
}

/** "dd/mm/aaaa" → "aaaa-mm-dd"; outro formato fica como veio (o serviço recusa com o motivo). */
function diaDoFormulario(t: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t.trim());
  return m === null ? t.trim() : `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Os itens da emenda, um por linha: "ficha; valor" (redução com sinal de menos). A ficha é o número da dotação na
 * proposta. Todas as linhas ruins são recusadas de uma vez, cada uma com o número dela.
 */
export async function cadastrarEmendaPelaTela(input: {
  readonly propostaId: string;
  readonly data: string;
  readonly objetivo: string;
  readonly justificativa: string;
  readonly vereador: string;
  readonly textoJuridico: string;
  readonly itens: string;
}): Promise<string> {
  const d = await detalharPropostaOrcamentaria(cliente(), input.propostaId);
  if (d === null) throw new EmendaInvalidaError("A proposta orçamentária não existe. Nada foi gravado.");
  const linhaDaFicha = new Map(d.despesas.map((l) => [l.numero, l.id]));
  const erros: string[] = [];
  const itens: { linhaDeDespesaId: string; valor: string }[] = [];
  input.itens.split(/\r?\n/).forEach((bruta, i) => {
    if (bruta.trim() === "") return;
    const [fichaT = "", valorT = "", ...resto] = bruta.split(/;|\t/).map((c) => c.trim());
    const linha = /^\d+$/.test(fichaT) ? linhaDaFicha.get(Number(fichaT)) : undefined;
    const valor = valorComSinalDoFormulario(valorT);
    if (resto.length > 0 || linha === undefined || valor === null) {
      erros.push(`linha ${String(i + 1)}: ${linha === undefined ? `a ficha "${fichaT}" não está na proposta` : `valor "${valorT}" (use 1.234,56, com - na redução)`}`);
      return;
    }
    itens.push({ linhaDeDespesaId: linha, valor });
  });
  if (erros.length > 0) throw new EmendaInvalidaError(`As dotações da emenda não foram lidas:\n${erros.join("\n")}\nNada foi gravado.`);
  const r = await comEscritaAutenticada("CADASTRAR_EMENDA_AO_ORCAMENTO", (criadoPor) =>
    cadastrarEmendaAoOrcamento(cliente(), {
      propostaOrcamentariaId: input.propostaId, data: diaDoFormulario(input.data), objetivo: input.objetivo, justificativa: input.justificativa,
      vereador: input.vereador, textoJuridico: input.textoJuridico, itens, criadoPor,
    })
  );
  return `Emenda nº ${String(r.numero)} registrada, aguardando sanção. A proposta só muda quando a emenda for sancionada.`;
}

/** O bloqueio pede o NÚMERO da ficha: o projeto tem uma dotação por ficha (centenas), e uma lista delas seria inútil. */
export async function bloquearDotacaoPelaTela(input: { readonly propostaId: string; readonly ficha: string; readonly motivo: string }): Promise<string> {
  const numero = /^\d+$/.test(input.ficha.trim()) ? Number(input.ficha.trim()) : NaN;
  const linha = Number.isNaN(numero)
    ? null
    : await cliente().linhaDeDespesaDaProposta.findFirst({ where: { propostaOrcamentariaId: input.propostaId, fichaDeOrigem: { numero } }, select: { id: true } });
  if (linha === null) throw new EmendaInvalidaError(`A ficha "${input.ficha}" não está neste projeto. Nada foi gravado.`);
  await comEscritaAutenticada("CADASTRAR_EMENDA_AO_ORCAMENTO", (criadoPor) => bloquearDotacaoParaEmendas(cliente(), { linhaDeDespesaId: linha.id, motivo: input.motivo, criadoPor }));
  return `Ficha ${String(numero)} bloqueada para emendas.`;
}

export async function liberarDotacaoPelaTela(input: { readonly bloqueioId: string; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_EMENDA_AO_ORCAMENTO", (criadoPor) => revogarBloqueioDeEmenda(cliente(), { bloqueioId: input.bloqueioId, motivo: input.motivo, criadoPor }));
  return "Dotação liberada para emendas. O bloqueio fica no histórico.";
}

export async function sancionarEmendaPelaTela(input: {
  readonly emendaId: string;
  readonly resultado: string;
  readonly itensAprovados: readonly string[];
  readonly data: string;
  readonly ato: string;
}): Promise<string> {
  if (input.resultado !== "APROVADA" && input.resultado !== "REJEITADA" && input.resultado !== "PARCIAL") {
    throw new EmendaInvalidaError("Escolha o resultado da sanção: aprovação total, reprovação total ou sanção parcial. Nada foi gravado.");
  }
  const resultado = input.resultado;
  const r = await comEscritaAutenticada("SANCIONAR_EMENDA_AO_ORCAMENTO", (criadoPor) =>
    sancionarEmendaAoOrcamento(cliente(), { emendaId: input.emendaId, resultado, itensAprovados: [...input.itensAprovados], data: diaDoFormulario(input.data), ato: input.ato, criadoPor })
  );
  return resultado === "REJEITADA"
    ? "Reprovação registrada. A proposta não mudou."
    : `Sanção registrada: ${String(r.itensAprovados)} dotação(ões) levada(s) à proposta.`;
}
