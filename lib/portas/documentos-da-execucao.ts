import { alcanceNoContrato } from "../../modules/m11-licitacoes/acesso-da-fiscalizacao.js";
import type { DocumentoPdf } from "../pdf/documento";
import { documentoDoManifesto, NOME_DO_TIPO, type TipoDoDocumentoDoContrato } from "../pdf/termos-do-contrato";
import { cliente } from "./cliente";
import { sessaoAtual } from "./sessao";

/**
 * O DOCUMENTO DA EXECUÇÃO PARA IMPRIMIR (V7 M2 U4). ⚠️ `sessaoAtual`, não `exigirSessao`: numa rota de arquivo o
 * redirecionamento para o login viraria um "PDF" com a tela de login dentro. Sem sessão, sem alcance, tipo desconhecido,
 * documento inexistente ou de OUTRO contrato: `null`, e a rota responde 404 — a mesma resposta nos cinco casos.
 *
 * Alcance por tipo: a ORDEM e o termo DEFINITIVO lastreiam a liquidação e servem às projeções de fiscalização e
 * financeira; o termo PROVISÓRIO (motivos da controvérsia, verificações) e a DECISÃO são da visão de fiscalização.
 */
export async function documentoDaExecucaoParaImprimir(contratoId: string, tipo: string, docId: string): Promise<{ readonly documento: DocumentoPdf; readonly nomeBase: string } | null> {
  const sessao = await sessaoAtual();
  if (sessao === null) return null;
  if (!(tipo in NOME_DO_TIPO)) return null;
  const t = tipo as TipoDoDocumentoDoContrato;
  const prisma = cliente();
  const alcance = await alcanceNoContrato(prisma, sessao.identificador, contratoId);
  // V7 M2 U7 — a MEMÓRIA da medição lastreia o valor recebido e liquidado: fiscalização e financeira (as evidências dela, não).
  const permitido = t === "ordem" || t === "definitivo" || t === "memoria" ? alcance.fiscalizacao || alcance.financeira : alcance.fiscalizacao;
  if (!permitido) return null;
  const lido =
    t === "ordem"
      ? await prisma.emissaoDaOrdemDeServico.findFirst({ where: { ordemId: docId, ordem: { contratoId } }, select: { manifesto: true, sha256: true } })
      : t === "provisorio"
        ? await prisma.recebimentoProvisorio.findFirst({ where: { id: docId, medicao: { ordem: { contratoId } } }, select: { manifesto: true, sha256: true } })
        : t === "definitivo"
          ? await prisma.recebimentoDefinitivo.findFirst({ where: { id: docId, medicao: { ordem: { contratoId } } }, select: { manifesto: true, sha256: true } })
          : t === "memoria"
            ? // A memória é endereçada pela MEDIÇÃO da ordem (uma memória por medição feita pela planilha).
              await prisma.medicaoDaOrdemNaPlanilha.findFirst({ where: { medicaoId: docId, medicao: { ordem: { contratoId } } }, select: { manifesto: true, sha256: true } })
            : // A decisão é endereçada pelo ITEM MEDIDO (uma decisão por conferência, uma conferência por item medido).
            await prisma.decisaoDeControversia.findFirst({ where: { conferencia: { itemMedidoId: docId, medido: { medicao: { ordem: { contratoId } } } } }, select: { manifesto: true, sha256: true } });
  if (lido === null) return null;
  return { documento: documentoDoManifesto(t, lido.manifesto, lido.sha256), nomeBase: `${NOME_DO_TIPO[t]}-${lido.sha256.slice(0, 8)}` };
}
