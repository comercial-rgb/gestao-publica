import type { AnexoNaLista } from "../../lib/portas/documentos";
import { instanteCivilBr } from "../../packages/datas/index";

/**
 * A LISTA DE ANEXOS DE UM REGISTRO — com download individual e em lote.
 *
 * ⚠️ É UM SERVER COMPONENT, e os links são `<a href>` de verdade. Não há JavaScript aqui:
 * o download de um arquivo é exatamente o que um link faz. Botão com `onClick` que monta
 * um blob e dispara um clique sintético custaria uma ilha client, quebraria "abrir em nova
 * aba" e "salvar como", e não ganharia nada.
 *
 * ⚠️ O HASH APARECE NA TELA, abreviado. Ele é o que torna a integridade VERIFICÁVEL por
 * fora: quem baixou pode conferir o arquivo com um `sha256sum` sem depender do sistema
 * dizer que está tudo bem. O mesmo valor vai no cabeçalho `X-Anexo-Sha256` do download.
 */

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function instante(d: Date): string {
  // ⚠️ SEM `timeZone`, o `Intl` usa o relógio de QUEM RENDERIZA — a máquina, num
  // componente de servidor. `instanteCivilBr` fixa o fuso do ente.
  return instanteCivilBr(d);
}

export function ListaDeAnexos({
  anexos,
  lote,
}: {
  readonly anexos: readonly AnexoNaLista[];
  /**
   * A URL do lote (`/documentos/lote?processo=…`). Ausente ⇒ sem botão de lote.
   *
   * ⚠️ O BOTÃO SÓ APARECE QUANDO HÁ O QUE BAIXAR. Um "baixar tudo" sobre lista vazia
   * levaria a um 404 — e um link que o sistema sabe de antemão que não funciona é a
   * definição de tela que mente.
   */
  readonly lote?: string | undefined;
}): React.ReactElement {
  if (anexos.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-ink-2)]">
        Nenhum documento anexado.
      </p>
    );
  }

  const total = anexos.reduce((s, a) => s + a.tamanhoBytes, 0);

  return (
    <div className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
            <th className="py-2 font-medium">Documento</th>
            <th className="py-2 font-medium">Tamanho</th>
            <th className="py-2 font-medium">Anexado</th>
            <th className="py-2 font-medium">Verificação</th>
          </tr>
        </thead>
        <tbody>
          {anexos.map((a) => (
            <tr
              key={a.id}
              className="border-b border-[color:var(--color-border)] last:border-0"
            >
              <td className="py-2">
                <a
                  href={`/documentos/anexos/${a.id}`}
                  className="text-[color:var(--color-acento)] underline underline-offset-2"
                  data-anexo={a.id}
                >
                  {a.nome}
                </a>
                {a.movimento !== null ? (
                  <span className="ml-2 text-xs text-[color:var(--color-ink-2)]">
                    (do movimento {a.movimento.toLowerCase().replace(/_/g, " ")})
                  </span>
                ) : null}
              </td>
              <td className="py-2 text-[color:var(--color-ink-2)]">
                {tamanhoLegivel(a.tamanhoBytes)}
              </td>
              <td className="py-2 text-xs text-[color:var(--color-ink-2)]">
                {instante(a.criadoEm)} · {a.criadoPor}
              </td>
              <td
                className="py-2 font-mono text-xs text-[color:var(--color-ink-2)]"
                title={a.sha256}
              >
                {a.sha256.slice(0, 12)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-ink-2)]">
        <span>
          {anexos.length} documento(s), {tamanhoLegivel(total)}.
        </span>
        {lote !== undefined ? (
          <a
            href={lote}
            className="text-[color:var(--color-acento)] underline underline-offset-2"
            data-acao="baixar-lote"
          >
            Baixar todos em um arquivo compactado
          </a>
        ) : null}
      </div>
    </div>
  );
}
