"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import {
  adjudicarPelaTela,
  cadastrarItemPelaTela,
  contratoDaAtaPelaTela,
  contratoDoResultadoPelaTela,
  homologarPorAtoPelaTela,
  registrarAtaPelaTela,
  registrarPropostaPelaTela,
  registrarResultadoPelaTela,
  vincularParticipantePelaTela,
} from "../../../../../lib/portas/resultado-da-licitacao";

/**
 * V39-R2 (R2-014 a 020) — AS AÇÕES DO PROCESSO AO CONTRATO. Só traduzem o formulário para os tipos do domínio (números
 * com vírgula viram ponto); nenhuma regra aqui, e a recusa do domínio sobe como veio.
 */

export interface EstadoDoResultado {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
/** "1.234,5678" ou "1234.5678" → "1234.5678". Vazio fica vazio. */
const num = (v: string): string => (v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v).trim();
const dia = (v: string): Date => new Date(`${v}T15:00:00.000Z`);
/** As chaves `prefixo<id>` preenchidas do formulário. */
function porId(f: FormData, prefixo: string): { id: string; valor: string }[] {
  const saida: { id: string; valor: string }[] = [];
  for (const [k, v] of f.entries()) if (k.startsWith(prefixo) && typeof v === "string" && v.trim() !== "") saida.push({ id: k.slice(prefixo.length), valor: v.trim() });
  return saida;
}

async function ato(f: FormData, fazer: (processoId: string) => Promise<string>): Promise<EstadoDoResultado> {
  return comComandoDoFormulario(f, async () => {
    const processoId = t(f, "processoId");
    try {
      const sucesso = await fazer(processoId);
      revalidatePath(`/licitacoes/processos/${processoId}`);
      revalidatePath("/licitacoes/contratos");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar. Nada foi gravado.") };
    }
  });
}

export async function cadastrarItemAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async (processoId) => {
    const lote = t(f, "lote");
    await cadastrarItemPelaTela({ processoId, numero: t(f, "numero"), ...(lote === "" ? {} : { lote }), descricao: t(f, "descricao"), unidade: t(f, "unidade"), quantidade: num(t(f, "quantidade")) });
    return `Item ${t(f, "numero")} cadastrado.`;
  });
}

export async function vincularParticipanteAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async (processoId) => {
    await vincularParticipantePelaTela({ processoId, documento: t(f, "documento") });
    return "Participante vinculado ao processo.";
  });
}

export async function registrarPropostaAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async () => {
    const valores = porId(f, "valor_").map((x) => ({ itemId: x.id, valorUnitario: num(x.valor) }));
    const motivo = t(f, "motivo");
    const r = await registrarPropostaPelaTela({ participanteId: t(f, "participanteId"), abrangencia: t(f, "abrangencia") as "ITEM" | "LOTE", valores, documento: t(f, "documento"), ...(motivo === "" ? {} : { motivo }) });
    return `Proposta registrada (${r.propostas.map((p) => `versão ${String(p.versao)}`).join(", ")}).`;
  });
}

export async function registrarResultadoAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async (processoId) => {
    const itens = porId(f, "situacao_").map(({ id, valor }) => {
      const situacao = valor as "VENCEDOR" | "FRACASSADO" | "DESERTO";
      const participanteId = t(f, `participante_${id}`);
      const valorUnitario = num(t(f, `valorfinal_${id}`));
      const justificativa = t(f, `justificativa_${id}`);
      return {
        itemId: id, situacao,
        ...(situacao === "VENCEDOR" && participanteId !== "" ? { participanteId } : {}),
        ...(situacao === "VENCEDOR" && valorUnitario !== "" ? { valorUnitario } : {}),
        ...(justificativa === "" ? {} : { justificativa }),
      };
    });
    if (itens.length === 0) return "Nenhum item escolhido: nada foi gravado.";
    const r = await registrarResultadoPelaTela({ processoId, data: dia(t(f, "data")), criterio: t(f, "criterio") as never, fundamento: t(f, "fundamento"), documento: t(f, "documento"), itens });
    return r.corrigidos > 0 ? `Resultado registrado; ${String(r.corrigidos)} item(ns) corrigido(s), com a decisão anterior no histórico.` : "Resultado registrado.";
  });
}

export async function adjudicarAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async (processoId) => {
    await adjudicarPelaTela({ processoId, data: dia(t(f, "data")), autoridade: t(f, "autoridade"), documento: t(f, "documento"), itensDoResultado: f.getAll("linha").map(String) });
    return "Adjudicação registrada.";
  });
}

export async function homologarAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async (processoId) => {
    const corrigeId = t(f, "corrigeId");
    const motivo = t(f, "motivo");
    await homologarPorAtoPelaTela({ processoId, data: dia(t(f, "data")), autoridade: t(f, "autoridade"), documento: t(f, "documento"), itensAdjudicados: f.getAll("adjudicado").map(String), ...(corrigeId === "" ? {} : { corrigeId }), ...(motivo === "" ? {} : { motivo }) });
    return corrigeId === "" ? "Homologação registrada." : "Homologação corrigida por novo ato; o ato anterior continua no histórico.";
  });
}

const dadosDoContrato = (f: FormData) => ({
  numeroContrato: t(f, "numeroContrato"),
  vigenciaInicio: dia(t(f, "vigenciaInicio")),
  vigenciaFimInicial: dia(t(f, "vigenciaFimInicial")),
  categoriaOrdemCronologica: t(f, "categoriaOrdemCronologica") as "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS",
});

export async function contratoDoResultadoAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async (processoId) => {
    const itens = porId(f, "qtd_").map((x) => ({ id: x.id, quantidade: num(x.valor) }));
    const r = await contratoDoResultadoPelaTela({ processoId, participanteId: t(f, "participanteId"), itens, ...dadosDoContrato(f) });
    return `Contrato ${t(f, "numeroContrato")} cadastrado com os itens do resultado (valor ${r.valor.replace(".", ",")}).`;
  });
}

export async function registrarAtaAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async (processoId) => {
    const itens = porId(f, "qtdata_").map((x) => ({ id: x.id, quantidade: num(x.valor) }));
    await registrarAtaPelaTela({ processoId, numero: t(f, "numero"), vigenciaInicio: dia(t(f, "vigenciaInicio")), vigenciaFim: dia(t(f, "vigenciaFim")), documento: t(f, "documento"), itens });
    return `Ata ${t(f, "numero")} registrada.`;
  });
}

export async function contratoDaAtaAction(_p: EstadoDoResultado, f: FormData): Promise<EstadoDoResultado> {
  return ato(f, async () => {
    const itens = porId(f, "qtdcontratoata_").map((x) => ({ id: x.id, quantidade: num(x.valor) }));
    const r = await contratoDaAtaPelaTela({ ataId: t(f, "ataId"), participanteId: t(f, "participanteId"), itens, ...dadosDoContrato(f) });
    return `Contrato ${t(f, "numeroContrato")} cadastrado pela ata (valor ${r.valor.replace(".", ",")}).`;
  });
}
