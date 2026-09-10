"use server";

import { revalidatePath } from "next/cache";
import { anexarNaTela } from "../../../lib/portas/documentos";

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
}): void {
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

  const dono = {
    ...(processoId !== "" ? { processoId } : {}),
    ...(pessoaId !== "" ? { pessoaId } : {}),
    ...(comunicadoId !== "" ? { comunicadoId } : {}),
    ...(movimentoProcessoId !== "" ? { movimentoProcessoId } : {}),
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
      mimeType: arquivo.type,
      conteudo: new Uint8Array(await arquivo.arrayBuffer()),
      origem,
      ...dono,
    });

    revalidarDono(dono);
    return {
      sucesso:
        `"${arquivo.name}" anexado. Verificação: ${r.sha256.slice(0, 12)}… — é este ` +
        `valor que prova, depois, que o arquivo é o mesmo.`,
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
