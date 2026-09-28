"use server";

import { revalidatePath } from "next/cache";
import {
  autorizarSolicitacao,
  cancelarSolicitacao,
  registrarSolicitacaoDeEmpenho,
  rejeitarSolicitacao,
} from "../../../../lib/portas/solicitacao-de-empenho";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { formatarMoeda } from "../../../../lib/format/moeda";

export interface EstadoDaSolicitacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const TIPOS = ["ORDINARIO", "GLOBAL", "ESTIMATIVO"] as const;
const CATEGORIAS = ["FORNECIMENTO_BENS", "LOCACAO", "PRESTACAO_SERVICOS", "REALIZACAO_OBRAS"] as const;
const ehTipo = (v: string): v is (typeof TIPOS)[number] => (TIPOS as readonly string[]).includes(v);
const ehCategoria = (v: string): v is (typeof CATEGORIAS)[number] => (CATEGORIAS as readonly string[]).includes(v);

function revalidar(): void {
  revalidatePath("/despesa/solicitacoes-de-empenho");
  revalidatePath("/despesa/empenhos");
}

const texto = (fd: FormData, nome: string): string => String(fd.get(nome) ?? "").trim();

/**
 * SOLICITAR — ⚠️ nenhuma regra de negócio aqui: a action traduz o `FormData` e devolve o erro do
 * domínio como ele veio (escopo, exercício, vínculos, número repetido).
 */
export async function solicitarAction(_prev: EstadoDaSolicitacao, fd: FormData): Promise<EstadoDaSolicitacao> {
  return comComandoDoFormulario(fd, async () => {
    const tipo = texto(fd, "tipo");
    const categoria = texto(fd, "categoria");
    const numero = texto(fd, "numero");
    const valor = texto(fd, "valor");
    if (!ehTipo(tipo)) return { erro: "Tipo de empenho inválido." };
    if (categoria !== "" && !ehCategoria(categoria)) return { erro: "Categoria da ordem cronológica inválida." };
    // a mesma regra do domínio, dita antes em português: sem contrato não há de quem herdar a categoria
    if (categoria === "" && texto(fd, "contratoId") === "") {
      return { erro: "Escolha a categoria da ordem cronológica (art. 141) — ela só é herdada quando a solicitação indica um contrato." };
    }
    if (texto(fd, "credor") === "") return { erro: "Escolha o credor no cadastro." };
    const opcional = (nome: "contratoId" | "ordemDeCompraId" | "convenioId" | "obraId" | "dividaId") => {
      const v = texto(fd, nome);
      return v !== "" ? { [nome]: v } : {};
    };
    try {
      await registrarSolicitacaoDeEmpenho({
        fichaId: texto(fd, "fichaId"),
        numero,
        credorCpfCnpj: texto(fd, "credor"),
        valor,
        tipo,
        ...(categoria !== "" && ehCategoria(categoria) ? { categoriaOrdemCronologica: categoria } : {}),
        historico: texto(fd, "historico"),
        ...opcional("contratoId"),
        ...opcional("ordemDeCompraId"),
        ...opcional("convenioId"),
        ...opcional("obraId"),
        ...opcional("dividaId"),
      });
      revalidar();
      return { sucesso: `Solicitação ${numero} registrada (R$ ${formatarMoeda(valor).texto}). Aguardando autorização.` };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível registrar a solicitação." };
    }
  });
}

/** AUTORIZAR — quem solicitou não autoriza: a recusa vem do domínio, com o motivo. */
export async function autorizarSolicitacaoAction(_prev: EstadoDaSolicitacao, fd: FormData): Promise<EstadoDaSolicitacao> {
  return comComandoDoFormulario(fd, async () => {
    const solicitacaoId = texto(fd, "solicitacaoId");
    const motivo = texto(fd, "motivo");
    if (solicitacaoId === "") return { erro: "Solicitação não identificada." };
    try {
      await autorizarSolicitacao({ solicitacaoId, ...(motivo !== "" ? { motivo } : {}) });
      revalidar();
      return { sucesso: "Solicitação autorizada. O empenho já pode ser emitido a partir dela." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível autorizar a solicitação." };
    }
  });
}

export async function rejeitarSolicitacaoAction(_prev: EstadoDaSolicitacao, fd: FormData): Promise<EstadoDaSolicitacao> {
  return comComandoDoFormulario(fd, async () => {
    const solicitacaoId = texto(fd, "solicitacaoId");
    if (solicitacaoId === "") return { erro: "Solicitação não identificada." };
    try {
      await rejeitarSolicitacao({ solicitacaoId, motivo: texto(fd, "motivo") });
      revalidar();
      return { sucesso: "Solicitação rejeitada. O motivo fica registrado com o seu nome." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível rejeitar a solicitação." };
    }
  });
}

export async function cancelarSolicitacaoAction(_prev: EstadoDaSolicitacao, fd: FormData): Promise<EstadoDaSolicitacao> {
  return comComandoDoFormulario(fd, async () => {
    const solicitacaoId = texto(fd, "solicitacaoId");
    if (solicitacaoId === "") return { erro: "Solicitação não identificada." };
    try {
      await cancelarSolicitacao({ solicitacaoId, motivo: texto(fd, "motivo") });
      revalidar();
      return { sucesso: "Solicitação cancelada." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível cancelar a solicitação." };
    }
  });
}
