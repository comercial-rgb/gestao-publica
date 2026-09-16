"use server";

import { revalidatePath } from "next/cache";
import { mensagemDoErro } from "../../../lib/portas/mensagem-do-erro";
import { acompanharManifestacaoPublica, opinarPublicamente, registrarManifestacaoPublica, type AcompanhamentoPublico } from "../../../lib/portas/ouvidoria";

/**
 * AS AÇÕES PÚBLICAS DA OUVIDORIA E DA OPINIÃO (V7 M1 U4) — sem sessão.
 *
 * ⚠️ NENHUM GUARD DE NEGÓCIO AQUI: serviço publicado, natureza, formulário da versão e quota são
 * conferidos na transação. Esta camada só traduz `FormData`.
 * ⚠️ O SEGREDO não é logado, não vai para a URL e só volta no estado da ilha que o pediu.
 */

export interface EstadoDaManifestacao {
  readonly erro?: string;
  readonly protocolo?: string;
  readonly segredo?: string;
}

export interface EstadoDoAcompanhamento {
  readonly erro?: string;
  readonly resultado?: AcompanhamentoPublico;
  readonly naoEncontrada?: boolean;
}

export interface EstadoDaOpiniao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * NA TELA PÚBLICA SÓ SOBE A RECUSA DO DOMÍNIO (código em maiúsculas, ou a do formulário). Erro de
 * infraestrutura vira a mensagem padrão: o público não lê nome de tabela nem pilha.
 */
function mensagemPublica(e: unknown, padrao: string): string {
  const m = mensagemDoErro(e, padrao);
  return e instanceof Error && !/^[A-Z][A-Z0-9-]+: /.test(e.message) && e.name !== "ZodError" ? padrao : m;
}

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const nota = (f: FormData, k: string): number => Number.parseInt(texto(f, k), 10);

export async function manifestarAction(_prev: EstadoDaManifestacao, formData: FormData): Promise<EstadoDaManifestacao> {
  const respostas: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (k.startsWith("resposta.") && typeof v === "string") respostas[k.slice("resposta.".length)] = v;
  try {
    const r = await registrarManifestacaoPublica({ slug: texto(formData, "__servico"), tipo: texto(formData, "tipo"), respostas, contato: texto(formData, "contato"), aceitouTermo: texto(formData, "aceitouTermo") === "sim" });
    return { protocolo: r.protocolo, segredo: r.segredo };
  } catch (e) {
    return { erro: mensagemPublica(e, "Não foi possível registrar a manifestação. Nada foi registrado.") };
  }
}

export async function acompanharAction(_prev: EstadoDoAcompanhamento, formData: FormData): Promise<EstadoDoAcompanhamento> {
  try {
    const r = await acompanharManifestacaoPublica(texto(formData, "protocolo"), texto(formData, "segredo"));
    // ⚠️ Protocolo inexistente e segredo errado respondem a MESMA coisa.
    return r === null ? { naoEncontrada: true } : { resultado: r };
  } catch (e) {
    return { erro: mensagemPublica(e, "Não foi possível consultar agora.") };
  }
}

export async function opinarAction(_prev: EstadoDaOpiniao, formData: FormData): Promise<EstadoDaOpiniao> {
  const slug = texto(formData, "__servico");
  try {
    const r = await opinarPublicamente({ slug, satisfacao: nota(formData, "satisfacao"), atendimento: nota(formData, "atendimento"), prazos: nota(formData, "prazos"), descricao: texto(formData, "descricao") });
    revalidatePath(`/servicos/${slug}`);
    return { sucesso: r.revisao ? "Sua opinião foi revisada. Só a mais recente conta no resultado." : "Opinião registrada. Obrigado." };
  } catch (e) {
    return { erro: mensagemPublica(e, "Não foi possível registrar a opinião. Nada foi gravado.") };
  }
}
