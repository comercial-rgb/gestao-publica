"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { importarLicitacoesPelaTela, informarTramita, informarTramitaPelaLista } from "../../../../../lib/portas/tramita";

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function informarTramitaAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await informarTramita({
        processoId: t(f, "processoId"),
        numeroNoTramita: t(f, "numeroNoTramita"),
        codUnidadeGestora: t(f, "codUnidadeGestora"),
        modalidadeSagres: t(f, "modalidadeSagres"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath(`/licitacoes/processos/${t(f, "processoId")}`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar. Nada foi gravado.") };
    }
  });
}

export async function informarTramitaPelaListaAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "licitacaoNoTribunalId") === "") return { erro: "Escolha a licitação do Tribunal." };
    try {
      const sucesso = await informarTramitaPelaLista({ processoId: t(f, "processoId"), licitacaoNoTribunalId: t(f, "licitacaoNoTribunalId") });
      revalidatePath(`/licitacoes/processos/${t(f, "processoId")}`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar. Nada foi gravado.") };
    }
  });
}

export async function importarLicitacoesAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    const arquivo = f.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo de licitações baixado dos dados abertos do Tribunal." };
    if (arquivo.size > 5 * 1024 * 1024) return { erro: "O arquivo passa de 5 MB. Confira se é o de licitações do município." };
    try {
      const sucesso = await importarLicitacoesPelaTela(await arquivo.text());
      revalidatePath(`/licitacoes/processos/${t(f, "processoId")}`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível importar. Nada foi gravado.") };
    }
  });
}
