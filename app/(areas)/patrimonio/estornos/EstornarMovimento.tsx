"use client";

import { useActionState } from "react";
import { CampoEnvolvido, CampoTextarea } from "../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO as BOTAO, CLASSE_CAMPO } from "../../../../components/ui/Formulario";
import { useChaveDeComando } from "../../../../components/ui/useChaveDeComando";
import { estornarAction, type EstadoDoEstorno } from "./actions";

/**
 * O FORMULÁRIO DO ESTORNO — só é montado quando a análise não tem bloqueio e o servidor
 * autoriza. Data do estorno e motivo são do domínio (a razão é append-only: o estorno é um
 * fato novo com a sua data e o seu porquê). Leva a chave de comando: reenviar não estorna
 * duas vezes.
 */
export function EstornarMovimento({
  eixo,
  movimentoId,
  resumo,
}: {
  readonly eixo: "valor" | "gestao";
  readonly movimentoId: string;
  readonly resumo: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoEstorno, FormData>(estornarAction, {});
  const chave = useChaveDeComando(estado.sucesso);
  return (
    <form action={action} data-acao="estornar-movimento" className="grid gap-3 rounded border border-[color:var(--color-linha)] p-4 md:grid-cols-4">
      <input type="hidden" name="eixo" value={eixo} />
      <input type="hidden" name="movimentoId" value={movimentoId} />
      <input type="hidden" name="__chave" value={chave} />
      <p className="text-sm md:col-span-4">{resumo}</p>
      <CampoEnvolvido name="dataMovimento" rotulo="Data do estorno" required largura={1}>
        {(aria) => <input {...aria} type="date" name="dataMovimento" className={CLASSE_CAMPO} required />}
      </CampoEnvolvido>
      <CampoTextarea
        name="motivo"
        rotulo="Motivo do estorno"
        required
        largura={3}
        linhas={2}
        ajuda="Por que o original não vale. Quem ler o histórico daqui a um ano não terá a quem perguntar."
      />
      <div className="md:col-span-4">
        <button type="submit" className={BOTAO} disabled={pendente || estado.sucesso !== undefined}>
          {pendente ? "Estornando…" : "Estornar"}
        </button>
      </div>
      {estado.erro !== undefined ? (
        <p role="alert" className="whitespace-pre-line text-[color:var(--color-status-erro-fg)] md:col-span-4">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p data-resultado="estornado" className="text-[color:var(--color-status-ok-fg)] md:col-span-4">{estado.sucesso}</p>
      ) : null}
    </form>
  );
}
