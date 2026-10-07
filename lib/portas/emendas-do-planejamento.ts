import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { pecasDisponiveis } from "./alteracoes-do-planejamento";
import { serializar } from "../../packages/contracts/index.js";
import { linhasAlteraveisDaPeca } from "../../modules/m02b-plurianual/comparativo";
import {
  bloquearLinhaParaEmendas,
  bloqueiosDaPeca,
  cadastrarEmendaAoPlanejamento,
  EmendaDoPlanejamentoInvalidaError,
  emendasDaPeca,
  revogarBloqueioDeEmendaAoPlanejamento,
  sancionarEmendaAoPlanejamento,
  type SituacaoDaEmendaDoPlanejamento,
} from "../../modules/m02b-plurianual/emendas-do-planejamento";

/**
 * V36 — A TELA DAS EMENDAS AO PPA E À LDO. Leitura sob CONSULTAR_PLANEJAMENTO; os atos sob as ações das emendas,
 * cobradas no serviço. A linha vem numa chave só (`alvo::alvoId::grandeza`), montada pelo servidor com as linhas que
 * existem na peça — o mesmo recorte da tela de alterações; o serviço confere tudo de novo na transação.
 */

const ALVOS = ["PREVISAO_RECEITA_PPA", "PROGRAMA_PPA", "ACAO_PPA", "META_ANUAL_LDO"] as const;
type Alvo = (typeof ALVOS)[number];

function lerChave(chave: string): { readonly alvo: Alvo; readonly alvoId: string; readonly grandeza: string } | null {
  const partes = chave.split("::");
  if (partes.length !== 3) return null;
  const [alvo, alvoId, grandeza] = partes as [string, string, string];
  if (!(ALVOS as readonly string[]).includes(alvo) || alvoId === "" || grandeza === "") return null;
  return { alvo: alvo as Alvo, alvoId, grandeza };
}

export interface EmendaDoPlanejamentoNaTela {
  readonly id: string;
  readonly numero: number;
  readonly data: string;
  readonly objetivo: string;
  readonly justificativa: string;
  readonly vereador: string;
  readonly textoJuridico: string;
  readonly situacao: SituacaoDaEmendaDoPlanejamento;
  readonly lei: string | null;
  readonly dataDaSancao: string | null;
  readonly acrescimos: string;
  readonly reducoes: string;
  readonly itens: readonly { readonly id: string; readonly rotulo: string; readonly valor: string; readonly sancionado: boolean | null }[];
}

export interface TelaDasEmendasDoPlanejamento {
  readonly pecas: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly escolhida: {
    readonly valor: string;
    readonly peca: "PPA" | "LDO";
    readonly id: string;
    readonly rotulo: string;
    /** As linhas da peça, uma opção por par linha × valor (o recorte é a peça). */
    readonly linhas: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly emendas: readonly EmendaDoPlanejamentoNaTela[];
    readonly bloqueios: readonly { readonly id: string; readonly rotulo: string; readonly motivo: string }[];
  } | null;
}

export async function lerTelaDasEmendasDoPlanejamento(p: { readonly peca: string }): Promise<TelaDasEmendasDoPlanejamento> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const todas = await pecasDisponiveis();
  const pecas = todas.map((x) => ({ valor: `${x.peca}::${x.id}`, rotulo: x.rotulo }));
  const e = todas.find((x) => `${x.peca}::${x.id}` === p.peca) ?? todas[0];
  if (e === undefined) return { pecas, escolhida: null };
  const prisma = cliente();
  const [alteraveis, emendas, bloqueios] = await Promise.all([
    linhasAlteraveisDaPeca(prisma, { peca: e.peca, pecaId: e.id }),
    emendasDaPeca(prisma, e.peca, e.id),
    bloqueiosDaPeca(prisma, e.peca, e.id),
  ]);
  return {
    pecas,
    escolhida: {
      valor: `${e.peca}::${e.id}`,
      peca: e.peca,
      id: e.id,
      rotulo: e.rotulo,
      linhas: alteraveis.flatMap((l) => l.grandezas.map((g) => ({ valor: `${l.alvo}::${l.alvoId}::${g.grandeza}`, rotulo: `${l.rotulo} — ${g.rotulo}` }))),
      emendas: emendas.map((m) => ({
        id: m.id, numero: m.numero, data: m.data, objetivo: m.objetivo, justificativa: m.justificativa, vereador: m.vereador, textoJuridico: m.textoJuridico,
        situacao: m.situacao, lei: m.lei, dataDaSancao: m.dataDaSancao, acrescimos: serializar(m.acrescimos), reducoes: serializar(m.reducoes),
        itens: m.itens.map((i) => ({ id: i.id, rotulo: i.rotulo, valor: serializar(i.valor), sancionado: i.sancionado })),
      })),
      bloqueios: bloqueios.map((b) => ({ id: b.id, rotulo: b.rotulo, motivo: b.motivo })),
    },
  };
}

function pecaDaChave(v: string): { readonly peca: "PPA" | "LDO"; readonly pecaId: string } {
  const [peca, pecaId = ""] = v.split("::");
  if ((peca !== "PPA" && peca !== "LDO") || pecaId === "") throw new EmendaDoPlanejamentoInvalidaError("Escolha o PPA ou a LDO da emenda. Nada foi gravado.");
  return { peca, pecaId };
}

/** As linhas da emenda chegam em pares (linha, valor); par vazio é ignorado, par pela metade é recusado. */
export async function cadastrarEmendaDoPlanejamentoPelaTela(input: {
  readonly peca: string;
  readonly data: string;
  readonly objetivo: string;
  readonly justificativa: string;
  readonly vereador: string;
  readonly textoJuridico: string;
  readonly linhas: readonly string[];
  readonly valores: readonly string[];
}): Promise<string> {
  const { peca, pecaId } = pecaDaChave(input.peca);
  const itens: { alvo: Alvo; alvoId: string; grandeza: string; valor: string }[] = [];
  for (const [k, linha] of input.linhas.entries()) {
    const valor = (input.valores[k] ?? "").trim();
    if (linha === "" && valor === "") continue;
    const chave = lerChave(linha);
    if (chave === null || valor === "") throw new EmendaDoPlanejamentoInvalidaError(`O item ${String(k + 1)} está pela metade: escolha a linha e informe o valor. Nada foi gravado.`);
    itens.push({ ...chave, valor });
  }
  const r = await comEscritaAutenticada("CADASTRAR_EMENDA_AO_ORCAMENTO", (criadoPor) =>
    cadastrarEmendaAoPlanejamento(cliente(), {
      peca, pecaId, data: input.data, objetivo: input.objetivo, justificativa: input.justificativa, vereador: input.vereador, textoJuridico: input.textoJuridico, itens, criadoPor,
    })
  );
  return `Emenda nº ${String(r.numero)} registrada, aguardando sanção. ${peca === "PPA" ? "O plano" : "A LDO"} só muda quando a emenda for sancionada.`;
}

export async function bloquearLinhaPelaTela(input: { readonly linha: string; readonly motivo: string }): Promise<string> {
  const chave = lerChave(input.linha);
  if (chave === null) throw new EmendaDoPlanejamentoInvalidaError("Escolha a linha a bloquear. Nada foi gravado.");
  await comEscritaAutenticada("CADASTRAR_EMENDA_AO_ORCAMENTO", (criadoPor) => bloquearLinhaParaEmendas(cliente(), { ...chave, motivo: input.motivo, criadoPor }));
  return "Linha bloqueada para emendas.";
}

export async function liberarLinhaPelaTela(input: { readonly bloqueioId: string; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_EMENDA_AO_ORCAMENTO", (criadoPor) => revogarBloqueioDeEmendaAoPlanejamento(cliente(), { bloqueioId: input.bloqueioId, motivo: input.motivo, criadoPor }));
  return "Linha liberada para emendas. O bloqueio fica no histórico.";
}

export async function sancionarEmendaDoPlanejamentoPelaTela(input: {
  readonly emendaId: string;
  readonly resultado: string;
  readonly itensAprovados: readonly string[];
  readonly leiNumero: string;
  readonly leiAno: string;
  readonly data: string;
  readonly dataPublicacao: string;
}): Promise<string> {
  if (input.resultado !== "APROVADA" && input.resultado !== "REJEITADA" && input.resultado !== "PARCIAL") {
    throw new EmendaDoPlanejamentoInvalidaError("Escolha o resultado da sanção: aprovação total, reprovação total ou sanção parcial. Nada foi gravado.");
  }
  const ano = /^\d{4}$/.test(input.leiAno.trim()) ? Number(input.leiAno.trim()) : NaN;
  if (Number.isNaN(ano)) throw new EmendaDoPlanejamentoInvalidaError("Informe o ano da lei com quatro dígitos. Nada foi gravado.");
  const resultado = input.resultado;
  const r = await comEscritaAutenticada("SANCIONAR_EMENDA_AO_ORCAMENTO", (criadoPor) =>
    sancionarEmendaAoPlanejamento(cliente(), {
      emendaId: input.emendaId, resultado, itensAprovados: [...input.itensAprovados], leiNumero: input.leiNumero, leiAno: ano, data: input.data, dataPublicacao: input.dataPublicacao, criadoPor,
    })
  );
  return resultado === "REJEITADA"
    ? "Reprovação registrada. A peça não mudou."
    : `Sanção registrada: ${String(r.itensAprovados)} linha(s) alterada(s) pela lei ${input.leiNumero}/${String(ano)}. Os valores aparecem em Alterações do planejamento.`;
}
