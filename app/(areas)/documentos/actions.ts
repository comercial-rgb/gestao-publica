"use server";

import { revalidatePath } from "next/cache";
import { anexarNaTela } from "../../../lib/portas/documentos";
import { comComandoDoFormulario } from "../../../lib/portas/comando";

import { mensagemDoErro } from "../../../lib/portas/mensagem-do-erro";
/**
 * A AÇÃO DE ANEXAR — uma só, para todos os registros que aceitam anexo.
 *
 * ═══ ⚠️ POR QUE UMA AÇÃO COMPARTILHADA, E NÃO UMA EM CADA TELA ═══
 * O processo, a pessoa e o comunicado anexam do mesmo jeito: um arquivo, um dono, o
 * `criadoPor` da sessão. Três cópias desta função divergiriam na primeira correção — e a
 * divergência interessante seria justamente na conferência, que é o que protege o disco.
 *
 * ⚠️ E NENHUM GUARD DE NEGÓCIO AQUI. Tipo, tamanho, dono único e autorização por registro
 * são do domínio, dentro da transação. O que esta camada faz é tirar o `File` do FormData
 * e traduzir o erro do domínio em mensagem de tela.
 */

export interface EstadoDoAnexo {
  readonly erro?: string;
  readonly sucesso?: string;
}

const texto = (f: FormData, campo: string): string =>
  String(f.get(campo) ?? "").trim();

/**
 * ⚠️ O CAMINHO A REVALIDAR É DERIVADO DO DONO, e não recebido do formulário.
 *
 * Um campo `retorno` no FormData seria mais flexível e permitiria ao cliente escolher o
 * que invalidar no cache do servidor. Não há dano de segurança nisso — mas também não há
 * razão: o dono do anexo já diz de qual tela ele veio, e um dado a menos vindo do cliente
 * é um dado a menos para conferir.
 */
function revalidarDono(dono: {
  readonly processoId?: string | undefined;
  readonly pessoaId?: string | undefined;
  readonly comunicadoId?: string | undefined;
  readonly termoPatrimonialId?: string | undefined;
  readonly documentoFiscalId?: string | undefined;
  readonly liquidacaoId?: string | undefined;
  readonly leiOrcamentariaAnualId?: string | undefined;
  readonly decretoCreditoId?: string | undefined;
  readonly atoDeRealocacaoId?: string | undefined;
  readonly normaOrcamentariaId?: string | undefined;
  readonly pagamentoId?: string | undefined;
  readonly movimentoBancarioId?: string | undefined;
  readonly obraId?: string | undefined;
}): void {
  if (dono.obraId !== undefined) {
    revalidatePath(`/licitacoes/obras/${dono.obraId}`);
    return;
  }
  if (dono.pagamentoId !== undefined) {
    revalidatePath(`/despesa/pagamentos/${dono.pagamentoId}`);
    return;
  }
  if (dono.movimentoBancarioId !== undefined) {
    revalidatePath(`/financeiro/movimentacao/${dono.movimentoBancarioId}`);
    return;
  }
  if (dono.normaOrcamentariaId !== undefined) {
    revalidatePath("/planejamento/creditos-adicionais/normas-no-tribunal");
    return;
  }
  if (dono.atoDeRealocacaoId !== undefined) {
    revalidatePath("/planejamento/realocacoes");
    return;
  }
  if (dono.decretoCreditoId !== undefined) {
    revalidatePath("/planejamento/creditos-adicionais");
    return;
  }
  if (dono.leiOrcamentariaAnualId !== undefined) {
    revalidatePath(`/planejamento/leis-orcamentarias/${dono.leiOrcamentariaAnualId}`);
    return;
  }
  if (dono.liquidacaoId !== undefined) {
    revalidatePath("/despesa/liquidacoes");
    return;
  }
  if (dono.documentoFiscalId !== undefined) {
    revalidatePath(`/licitacoes/documentos-fiscais/${dono.documentoFiscalId}`);
    revalidatePath("/licitacoes/documentos-fiscais");
    return;
  }
  if (dono.termoPatrimonialId !== undefined) {
    revalidatePath(`/patrimonio/termos/${dono.termoPatrimonialId}`);
    return;
  }
  if (dono.processoId !== undefined) {
    revalidatePath(`/protocolo/processos/${dono.processoId}`);
    return;
  }
  if (dono.pessoaId !== undefined) {
    revalidatePath(`/cadastros/pessoas/${dono.pessoaId}`);
    return;
  }
  if (dono.comunicadoId !== undefined) {
    revalidatePath(`/comunicacao/comunicados/${dono.comunicadoId}`);
  }
}

export async function anexarArquivoAction(
  _prev: EstadoDoAnexo,
  formData: FormData
): Promise<EstadoDoAnexo> {
  return comComandoDoFormulario(formData, async () => {
    const arquivo = formData.get("arquivo");

    // ⚠️ `instanceof File` E O TAMANHO ZERO, separados. Um input de arquivo vazio submete um
    // `File` com nome "" e zero bytes — não `null`. Sem esta conferência, o domínio receberia
    // um `Uint8Array` vazio e recusaria com "Arquivo vazio", que é verdade mas não é útil:
    // quem esqueceu de escolher o arquivo precisa ouvir isso.
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return { erro: "Escolha um arquivo para anexar." };
    }

    const processoId = texto(formData, "processoId");
    const pessoaId = texto(formData, "pessoaId");
    const comunicadoId = texto(formData, "comunicadoId");
    const movimentoProcessoId = texto(formData, "movimentoProcessoId");
    const termoPatrimonialId = texto(formData, "termoPatrimonialId");
    const documentoFiscalId = texto(formData, "documentoFiscalId");
    const liquidacaoId = texto(formData, "liquidacaoId");
    const leiOrcamentariaAnualId = texto(formData, "leiOrcamentariaAnualId");
    const decretoCreditoId = texto(formData, "decretoCreditoId");
    const atoDeRealocacaoId = texto(formData, "atoDeRealocacaoId");
    const normaOrcamentariaId = texto(formData, "normaOrcamentariaId");
    const pagamentoId = texto(formData, "pagamentoId");
    const movimentoBancarioId = texto(formData, "movimentoBancarioId");
    const obraId = texto(formData, "obraId");

    const dono = {
      ...(termoPatrimonialId !== "" ? { termoPatrimonialId } : {}),
      ...(processoId !== "" ? { processoId } : {}),
      ...(pessoaId !== "" ? { pessoaId } : {}),
      ...(comunicadoId !== "" ? { comunicadoId } : {}),
      ...(movimentoProcessoId !== "" ? { movimentoProcessoId } : {}),
      ...(documentoFiscalId !== "" ? { documentoFiscalId } : {}),
      ...(liquidacaoId !== "" ? { liquidacaoId } : {}),
      ...(leiOrcamentariaAnualId !== "" ? { leiOrcamentariaAnualId } : {}),
      ...(decretoCreditoId !== "" ? { decretoCreditoId } : {}),
      ...(atoDeRealocacaoId !== "" ? { atoDeRealocacaoId } : {}),
      ...(normaOrcamentariaId !== "" ? { normaOrcamentariaId } : {}),
      ...(pagamentoId !== "" ? { pagamentoId } : {}),
      ...(movimentoBancarioId !== "" ? { movimentoBancarioId } : {}),
      ...(obraId !== "" ? { obraId } : {}),
    };

    try {
      // ⚠️ O MIME VEM DO BROWSER, e o servidor NÃO confia nele — ele o CONFERE contra o rol
      // em `recusaDoArquivo`. Um arquivo com `type` mentiroso é recusado pelo rol; o que o
      // rol não pega (um .exe renomeado para .pdf com o type certo) é justamente por isso que
      // o download responde `attachment` + `nosniff`, e nada executa.
      const origem =
        texto(formData, "origem") === "DIGITALIZACAO" ? "DIGITALIZACAO" : "UPLOAD";

      const r = await anexarNaTela({
        nomeOriginal: arquivo.name,
        mimeType:
          arquivo.type !== ""
            ? arquivo.type
            : documentoFiscalId !== ""
              ? "application/octet-stream"
              : arquivo.type,
        conteudo: new Uint8Array(await arquivo.arrayBuffer()),
        origem,
        ...dono,
      });

      revalidarDono(dono);
      return {
        sucesso:
          `"${arquivo.name}" anexado. Código de verificação: ${r.sha256.slice(0, 12)}…, ` +
          `que permite confirmar posteriormente a integridade do arquivo.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : String(e) };
    }
  });
}
