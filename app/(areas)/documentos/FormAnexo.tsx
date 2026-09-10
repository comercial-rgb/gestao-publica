"use client";

import { useActionState, useId, useRef } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO,
  CLASSE_ROTULO,
} from "../../../components/ui/Formulario";
import { anexarArquivoAction, type EstadoDoAnexo } from "./actions";

/**
 * O FORMULÁRIO DE ANEXO — uma ilha client, compartilhada por processo, pessoa e
 * comunicado.
 *
 * ⚠️ AS CONSTANTES DO SERVIDOR CHEGAM POR PROPS, e não por import. `EXTENSOES_ACEITAS` e
 * `TAMANHO_MAXIMO_BYTES` moram na porta, e uma ilha `"use client"` não pode importar porta
 * — a fronteira de `test/ui/fronteira-ui.test.ts` recusa, e com razão: o import arrastaria
 * o Prisma para o bundle do browser. Quem lê os valores é o Server Component pai.
 *
 * ⚠️ O `id` VEM DO `useId`, e não de uma constante. Esta mesma ilha aparece MAIS DE UMA VEZ
 * na mesma página (o processo tem um anexo por movimento). Um id literal repetido quebraria
 * o `label for`: o leitor de tela anunciaria o rótulo errado, e o clique no rótulo do
 * segundo formulário focaria o campo do primeiro.
 *
 * ⚠️ E O `accept` É CONVENIÊNCIA, NÃO FECHADURA. Ele filtra o seletor de arquivos do
 * sistema; quem postar por fora manda o que quiser. Quem recusa de verdade é
 * `recusaDoArquivo`, no servidor, e é ele que produz a mensagem que aparece abaixo.
 */

export interface DonoDoAnexo {
  readonly processoId?: string | undefined;
  readonly movimentoProcessoId?: string | undefined;
  readonly pessoaId?: string | undefined;
  readonly comunicadoId?: string | undefined;
}

export function FormAnexo({
  dono,
  accept,
  tamanhoMaximoBytes,
  rotulo = "Anexar documento",
}: {
  readonly dono: DonoDoAnexo;
  readonly accept: string;
  readonly tamanhoMaximoBytes: number;
  readonly rotulo?: string | undefined;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAnexo, FormData>(
    anexarArquivoAction,
    {}
  );
  const gerado = useId();
  const idArquivo = `arquivo-${gerado}`;
  const idAjuda = `${idArquivo}-ajuda`;
  const formulario = useRef<HTMLFormElement>(null);

  const mb = (tamanhoMaximoBytes / 1024 / 1024).toFixed(0);

  return (
    <form
      ref={formulario}
      action={action}
      data-acao="anexar"
      className="flex flex-col gap-3"
    >
      {dono.processoId !== undefined ? (
        <input type="hidden" name="processoId" value={dono.processoId} />
      ) : null}
      {dono.movimentoProcessoId !== undefined ? (
        <input
          type="hidden"
          name="movimentoProcessoId"
          value={dono.movimentoProcessoId}
        />
      ) : null}
      {dono.pessoaId !== undefined ? (
        <input type="hidden" name="pessoaId" value={dono.pessoaId} />
      ) : null}
      {dono.comunicadoId !== undefined ? (
        <input type="hidden" name="comunicadoId" value={dono.comunicadoId} />
      ) : null}

      <div>
        <label htmlFor={idArquivo} className={CLASSE_ROTULO}>
          {rotulo}
        </label>
        <input
          id={idArquivo}
          aria-describedby={idAjuda}
          type="file"
          name="arquivo"
          accept={accept}
          required
          className={CLASSE_CAMPO}
        />
        <p id={idAjuda} className="mt-1 text-xs text-[color:var(--color-ink-2)]">
          Até {mb} MB. PDF, DOC, DOCX, XLS, XLSX, ODT, JPG ou PNG. O sistema calcula uma
          verificação (SHA-256) do arquivo no momento do envio — é ela que prova, depois,
          que o documento não foi trocado.
        </p>
      </div>

      <div>
        <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
          {pendente ? "Enviando…" : "Anexar"}
        </button>
      </div>

      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
    </form>
  );
}
