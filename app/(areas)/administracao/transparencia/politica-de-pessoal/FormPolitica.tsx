"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { politicaDePessoalAction, type EstadoDaPolitica } from "./actions";
import type { PainelDaPolitica } from "../../../../../lib/portas/politica-de-pessoal";

/**
 * A POLÍTICA DE PUBLICAÇÃO DE PESSOAL (V11 V4.2).
 *
 * ⚠️ A TELA DIZ O EFEITO ANTES DO BOTÃO, e o efeito é forte: aprovar esta política faz o nome e a
 * remuneração de cada servidor aparecerem num portal aberto, sem cadastro. Um formulário que
 * pedisse "marque as colunas" sem dizer isso transformaria uma decisão do ente numa configuração
 * de tela.
 */
export function FormPolitica({ p }: { readonly p: PainelDaPolitica }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaPolitica, FormData>(politicaDePessoalAction, {});

  return (
    <section data-papel="politica-de-pessoal" className="space-y-5">
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4">
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">O que esta política decide</h2>
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Enquanto não houver uma política <strong>aprovada</strong> vigente, o portal público
          mostra apenas os <strong>totais por unidade</strong> — que não contêm dado pessoal — e
          nenhuma linha por servidor. Aprovar esta política é o ato do ente que autoriza a
          exposição das colunas marcadas. Dependentes, plano de saúde, pensão alimentícia,
          tributação individual, CPF e a memória de cálculo <strong>não podem ser marcados</strong>:
          eles não existem neste formulário porque não existem no sistema de publicação.
        </p>
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}

      <ol role="list" className="space-y-2" data-papel="lista-de-politicas">
        {p.politicas.length === 0 ? (
          <li className="text-xs text-[color:var(--color-ink-3)]">
            Nenhuma política registrada. O portal público não publica nenhuma linha por servidor.
          </li>
        ) : (
          p.politicas.map((x) => (
            <li key={x.id} data-versao={x.versao} data-situacao={x.situacao} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-xs">
              <p className="font-semibold text-[color:var(--color-ink)]">Política {x.versao} — {x.situacao} — {x.vigencia}</p>
              <p className="mt-1 text-[color:var(--color-ink)]">Colunas publicadas: {x.colunas.join(", ")}</p>
              <p className="mt-1 text-[color:var(--color-ink-2)]">Fundamento: {x.fundamentacaoLegal}</p>
              <p className="mt-1 text-[color:var(--color-ink-3)]">{x.autoria}</p>

              {x.podeAprovar ? (
                <form action={action} className="mt-2" data-acao="aprovar">
                  <ChaveDeComando />
                  <input type="hidden" name="__acao" value="aprovar" />
                  <input type="hidden" name="__politica" value={x.id} />
                  <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
                    {pendente ? "Gravando…" : `Aprovar a política ${x.versao} e publicar`}
                  </button>
                  <span className="ml-2 text-[color:var(--color-ink-3)]">Quem redigiu esta política não pode aprová-la.</span>
                </form>
              ) : null}

              {x.podeRevogar ? (
                <form action={action} className="mt-2 grid gap-2 sm:grid-cols-4" data-acao="revogar">
                  <ChaveDeComando />
                  <input type="hidden" name="__acao" value="revogar" />
                  <input type="hidden" name="__politica" value={x.id} />
                  <label className="sm:col-span-3">
                    <span className={ROTULO}>Motivo da revogação da política {x.versao}</span>
                    <input name="motivo" required minLength={10} maxLength={500} className={CAMPO} />
                  </label>
                  <div className="self-end">
                    <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>Revogar e parar de publicar</button>
                  </div>
                </form>
              ) : null}
            </li>
          ))
        )}
      </ol>

      {p.podeCadastrar ? (
        <form action={action} className="grid gap-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4 sm:grid-cols-4" data-acao="cadastrar">
          <ChaveDeComando />
          <input type="hidden" name="__acao" value="cadastrar" />

          <label className="text-xs">
            <span className={ROTULO}>Vigência — competência inicial (AAAA-MM)</span>
            <input name="competenciaInicio" required pattern="[0-9]{4}-(0[1-9]|1[0-2])" placeholder="2026-01" className={CAMPO} />
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Competência final (AAAA-MM, opcional)</span>
            <input name="competenciaFim" pattern="[0-9]{4}-(0[1-9]|1[0-2])" className={CAMPO} />
          </label>
          <label className="text-xs sm:col-span-4">
            <span className={ROTULO}>Fundamentação legal — o ato do ente que autoriza a publicação</span>
            <input name="fundamentacaoLegal" required minLength={10} maxLength={500} placeholder="ex.: Lei municipal 1.234/2026, art. 4" className={CAMPO} />
          </label>

          <fieldset className="sm:col-span-4">
            <legend className={ROTULO}>Colunas publicáveis — marque o que o ato autoriza</legend>
            <ul role="list" className="mt-1 space-y-1.5">
              {p.colunasDisponiveis.map((c) => (
                <li key={c.valor} className="text-xs">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name="coluna" value={c.valor} className="mt-0.5" />
                    <span>
                      <strong className="text-[color:var(--color-ink)]">{c.rotulo}</strong>
                      <span className="block text-[color:var(--color-ink-3)]">{c.fundamento}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="sm:col-span-4">
            <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
              {pendente ? "Gravando…" : "Gravar como rascunho"}
            </button>
            <span className="ml-2 text-xs text-[color:var(--color-ink-3)]">
              A política nasce em rascunho e não publica nada até que outra pessoa a aprove.
            </span>
          </div>
        </form>
      ) : (
        <p className="text-xs text-[color:var(--color-ink-3)]">O seu perfil consulta a política, mas não a redige.</p>
      )}
    </section>
  );
}
