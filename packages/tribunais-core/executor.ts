import type { Competencia, Inconsistencia, PacoteExport } from "./porta.js";
import { resolverTribunal } from "./registro.js";

/**
 * O EXECUTOR — validar, decidir, e só então gerar.
 *
 * ═══ ⚠️ BLOQUEIO NÃO É EXCEÇÃO ═══
 * Quando há inconsistência que BLOQUEIA, esta função **NÃO LANÇA**: ela devolve `ok: false` com os
 * bloqueios na mão. A diferença é a razão de o tipo existir.
 *
 * Um `throw` diz "algo deu errado no programa" e o chamador natural é um `catch` genérico que
 * mostra "erro ao exportar". Mas um bloqueio NÃO é falha de programa — é o resultado NORMAL e
 * esperado de validar uma competência que ainda não está pronta. É a informação que a Comissão
 * precisa ler, campo a campo, para consertar a massa. Enfiá-la num `Error` a reduziria a uma
 * string, e a tela perderia exatamente o que a torna útil: arquivo, linha, campo.
 *
 * Exceção fica para o que de fato é excepcional — tribunal inexistente (`resolverTribunal`) ou o
 * gerador quebrando. Essas sobem, porque nenhuma decisão do operador as conserta.
 *
 * ═══ POR QUE UNIÃO DISCRIMINADA ═══
 * `ok: true` traz `pacote`; `ok: false` NÃO traz campo de pacote nenhum. O compilador passa a
 * impedir o acesso a um pacote que não existe — em vez de um `pacote?: PacoteExport` que todo
 * chamador teria de lembrar de checar, e que um dia alguém não checaria.
 */

/** O resultado de uma exportação. Ou saiu o pacote, ou saíram os motivos de não ter saído. */
export type ResultadoExport =
  | {
      readonly ok: true;
      readonly pacote: PacoteExport;
      /** Alertas acompanham o pacote: não impedem a remessa, mas vão à vista de quem assina. */
      readonly alertas: readonly Inconsistencia[];
    }
  | {
      readonly ok: false;
      /** Ao menos um. É o que impediu a remessa. */
      readonly bloqueios: readonly Inconsistencia[];
      readonly alertas: readonly Inconsistencia[];
    };

/**
 * EXPORTA A COMPETÊNCIA PARA O TRIBUNAL DO CÓDIGO.
 *
 * ⚠️ NADA É GERADO ENQUANTO HOUVER BLOQUEIO. A ordem (validar → decidir → gerar) não é estética:
 * gerar antes produziria um pacote que não pode ser entregue, e um artefato inválido no disco é um
 * convite a ser entregue mesmo assim.
 *
 * ⚠️ ESTA FUNÇÃO NÃO TRANSMITE (DIRETIVA §7). Ela produz o formato oficial, gerado e validado
 * LOCALMENTE — é o que o `natureza` do pacote carrega. Não há recibo nem protocolo aqui.
 *
 * @throws Error `TRIBUNAL_NAO_SUPORTADO: <codigo>` quando o código não tem exportador.
 */
export async function exportarParaTribunal(
  codigo: string,
  competencia: Competencia
): Promise<ResultadoExport> {
  const exportador = resolverTribunal(codigo);

  const inconsistencias = await exportador.validar(competencia);
  const bloqueios = inconsistencias.filter((i) => i.severidade === "BLOQUEIA");
  const alertas = inconsistencias.filter((i) => i.severidade === "ALERTA");

  if (bloqueios.length > 0) {
    return { ok: false, bloqueios, alertas };
  }

  const pacote = await exportador.gerar(competencia);
  return { ok: true, pacote, alertas };
}
