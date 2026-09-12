"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO as BOTAO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { concederAcaoAction, revogarAcaoAction, type EstadoPerfil } from "./actions";

/**
 * CONCEDER E REVOGAR AÇÕES DE UM PERFIL (TR 4.56 · 6.5).
 *
 * ⚠️ DUAS ESCOLHAS, NÃO UMA LISTA DE DUZENTAS. A ação se escolhe pela ÁREA primeiro, e o
 * segundo seletor só mostra as daquela área. Um `select` único com o censo inteiro em ordem
 * alfabética seria um formulário bonito e inútil: quem administra procura "o que a
 * tesouraria faz", não uma palavra que já sabe escrever.
 *
 * ⚠️ E NÃO HÁ "CONCEDER TODAS". Seria a chave-mestra com cara de rotina — um clique
 * tornaria onipotente um perfil limitado, e a segregação do TR 6.4 morreria por conveniência
 * de interface. Cada ação é escolhida, e cada concessão fica com o nome de quem a fez.
 */

export interface GrupoDeAcoesUI {
  readonly slug: string;
  readonly rotulo: string;
  readonly acoes: readonly string[];
}
export interface UnidadeUI {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
}
export interface PermissaoUI {
  readonly acao: string;
  readonly unidadeOrc: string | null;
  readonly unidadeOrcId: string | null;
}

function Mensagem({ estado }: { readonly estado: EstadoPerfil }): React.ReactElement | null {
  if (estado.erro !== undefined)
    return (
      <p role="alert" className="mt-2 whitespace-pre-line text-xs text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  if (estado.sucesso !== undefined)
    return <p className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

export function GerenciarPerfil({
  perfilId,
  permissoes,
  grupos,
  unidades,
  podeConceder,
  podeRevogar,
}: {
  readonly perfilId: string;
  readonly permissoes: readonly PermissaoUI[];
  readonly grupos: readonly GrupoDeAcoesUI[];
  readonly unidades: readonly UnidadeUI[];
  readonly podeConceder: boolean;
  readonly podeRevogar: boolean;
}): React.ReactElement | null {
  const [estConceder, actConceder, pendConceder] = useActionState<EstadoPerfil, FormData>(concederAcaoAction, {});
  const [estRevogar, actRevogar, pendRevogar] = useActionState<EstadoPerfil, FormData>(revogarAcaoAction, {});
  const [area, setArea] = useState<string>(grupos[0]?.slug ?? "");

  // ⚠️ O SERVIDOR MANDA. Quem não tem a ação não vê o formulário — e não é a tela que
  // decide isso: `acoesPermitidas` lê a MESMA tabela que `autorizar` cobra no ato.
  if (!podeConceder && !podeRevogar) return null;

  const doGrupo = grupos.find((g) => g.slug === area)?.acoes ?? [];
  const jaConcedidasGlobais = new Set(
    permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao)
  );

  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer select-none text-[color:var(--color-primary)] hover:underline">
        Gerenciar permissões
      </summary>
      <div className="mt-2 space-y-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
        {/* ⚠️ `data-perfil` RECORTA O FORMULÁRIO POR CARTÃO. Há um destes por perfil na
            mesma página, e um seletor que casasse só por `data-acao` pegaria o PRIMEIRO — o
            defeito que `test/ui/formularios-na-mesma-pagina.test.tsx` documenta, e que já fez
            um smoke apertar o botão de outro formulário.

            ⚠️ E ESTE COMENTÁRIO JÁ DERRUBOU O BUILD DUAS VEZES, pelas duas causas que ele
            mesmo tinha de explicar. Primeiro ele estava dentro do operador ternário abaixo —
            posição de expressão, onde uma chave com barra-asterisco não é comentário e sim um
            objeto literal. Depois, ao explicar isso, ele GRAFOU a sequência que fecha
            comentário, e se encerrou no meio: o resto do texto virou código, e o compilador
            acusou o atributo seguinte.

            É a mesma anatomia que o guard de rótulos deste repositório já documenta sobre si:
            a regra se enuncia, não se escreve. */}
        {podeConceder ? (
          <form
            action={actConceder}
            className="flex flex-wrap items-end gap-2"
            data-acao="conceder-acao"
            data-perfil={perfilId}
          >
            <input type="hidden" name="perfilId" value={perfilId} />
            <label>
              <span className={ROTULO}>Área</span>
              <select
                name="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className={CAMPO}
              >
                {grupos.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={ROTULO}>Ação a conceder</span>
              <select name="acao" defaultValue="" className={CAMPO}>
                <option value="" disabled>
                  escolha a ação…
                </option>
                {doGrupo.map((a) => (
                  <option key={a} value={a} disabled={jaConcedidasGlobais.has(a)}>
                    {a}
                    {jaConcedidasGlobais.has(a) ? " (já concedida)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={ROTULO}>Onde vale</span>
              <select name="unidadeOrcId" defaultValue="" className={CAMPO}>
                <option value="">Todas as unidades gestoras</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} — {u.descricao}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={pendConceder} className={BOTAO}>
              {pendConceder ? "Concedendo…" : "Conceder"}
            </button>
            <Mensagem estado={estConceder} />
          </form>
        ) : null}

        {/* ⚠️ A CONDIÇÃO ERA `podeRevogar && permissoes.length > 0`, E ISSO APAGAVA A
            RESPOSTA. Revogar a ÚLTIMA ação esvazia a lista, o bloco inteiro deixa de ser
            renderizado e leva junto a mensagem de sucesso — a confirmação sumia exatamente
            na revogação que mais precisa dela. O percurso pegou: leu silêncio onde o
            servidor tinha respondido. Agora a lista é que é condicional; a resposta fica. */}
        {podeRevogar ? (
          <div>
            {permissoes.length > 0 ? (
              <span className="uppercase tracking-wide text-[color:var(--color-ink-2)]">
                Revogar uma ação deste perfil
              </span>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {permissoes.map((p) => (
                <form
                  key={`${p.acao}-${p.unidadeOrcId ?? "G"}`}
                  action={actRevogar}
                  className="inline"
                  data-acao="revogar-acao"
                  data-perfil={perfilId}
                  data-alvo={`${p.acao}-${p.unidadeOrcId ?? "G"}`}
                >
                  <input type="hidden" name="perfilId" value={perfilId} />
                  <input type="hidden" name="acao" value={p.acao} />
                  <input type="hidden" name="unidadeOrcId" value={p.unidadeOrcId ?? ""} />
                  <button
                    type="submit"
                    disabled={pendRevogar}
                    title={p.unidadeOrc === null ? "vale em todas as unidades" : `unidade ${p.unidadeOrc}`}
                    className="h-7 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-2 text-xs hover:bg-[color:var(--color-surface)]"
                  >
                    {p.acao}
                    {p.unidadeOrc !== null ? ` · ${p.unidadeOrc}` : ""} — revogar
                  </button>
                </form>
              ))}
            </div>
            {/* ⚠️ A MENSAGEM DA REVOGAÇÃO É UMA POR CARTÃO, e não uma por botão: os botões
                compartilham o mesmo estado de ação, e repeti-la em cada um faria todos
                anunciarem o resultado de um. A âncora existe para que a resposta possa ser
                lida onde ela de fato aparece. */}
            <div data-mensagem="revogar">
              <Mensagem estado={estRevogar} />
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
