"use server";

import { revalidatePath } from "next/cache";
import {
  concederAcaoAoPerfilAdmin,
  criarPerfilAdmin,
  revogarAcaoDoPerfilAdmin,
} from "../../../../lib/portas/administracao";

/**
 * AS ESCRITAS DA TELA DE PERFIS (TR 4.56).
 *
 * ⚠️ A MENSAGEM DO DOMÍNIO SOBE COMO VEIO. Cada recusa daqui é nomeada e diz o que fazer —
 * "ação já concedida", "esta é a última chave", "ação inexistente no censo". Traduzi-las
 * para "não foi possível" jogaria fora exatamente a parte que o administrador precisa ler.
 */

const ROTA = "/administracao/perfis";

export interface EstadoPerfil {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function criarPerfilAction(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  const nome = String(formData.get("nome") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  try {
    await criarPerfilAdmin({ nome, descricao });
    revalidatePath(ROTA);
    return { sucesso: `Perfil ${nome} criado. Ele nasce sem permissão nenhuma — conceda as ações uma a uma.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível criar o perfil." };
  }
}

export async function concederAcaoAction(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  const perfilId = String(formData.get("perfilId") ?? "").trim();
  const acao = String(formData.get("acao") ?? "").trim();
  const unidade = String(formData.get("unidadeOrcId") ?? "").trim();
  if (acao === "") return { erro: "Escolha a ação a conceder." };
  try {
    await concederAcaoAoPerfilAdmin({ perfilId, acao, unidadeOrcId: unidade === "" ? null : unidade });
    revalidatePath(ROTA);
    return {
      sucesso:
        unidade === ""
          ? `Ação ${acao} concedida em todas as unidades.`
          : `Ação ${acao} concedida nesta unidade gestora.`,
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível conceder a ação." };
  }
}

export async function revogarAcaoAction(_prev: EstadoPerfil, formData: FormData): Promise<EstadoPerfil> {
  const perfilId = String(formData.get("perfilId") ?? "").trim();
  const acao = String(formData.get("acao") ?? "").trim();
  const unidade = String(formData.get("unidadeOrcId") ?? "").trim();
  try {
    await revogarAcaoDoPerfilAdmin({ perfilId, acao, unidadeOrcId: unidade === "" ? null : unidade });
    revalidatePath(ROTA);
    return { sucesso: `Ação ${acao} revogada.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível revogar a ação." };
  }
}
