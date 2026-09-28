"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { versaoDaRubricaAction, type EstadoDaVersao } from "./actions";
import type { PainelDeVersoes } from "../../../../../lib/portas/versoes-da-rubrica";

/**
 * AS VERSÕES DESTA RUBRICA (V11 V1.1).
 *
 * ⚠️ O EFEITO VEM ANTES DO BOTÃO: uma versão nasce RASCUNHO e não calcula nada; quem escreveu
 * não aprova; aprovar a seguinte FECHA a vigência da anterior sem apagá-la. A tela diz isso
 * porque o servidor cumpre isso — não é texto de ajuda, é o comportamento.
 */
export function VersoesDaRubrica({ p }: { readonly p: PainelDeVersoes }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaVersao, FormData>(versaoDaRubricaAction, {});

  return (
    <section data-papel="versoes-da-rubrica" data-rubrica={p.codigo} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4">
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Versões de {p.codigo} — {p.descricao}</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        O cálculo da folha utiliza a versão vigente na competência, com percentual, incidências, arredondamento,
        fundamentação e fórmula. Uma versão aprovada não pode ser alterada; para mudar a regra, cadastre nova versão.
      </p>

      {estado.erro !== undefined ? (
        <p role="alert" className="mb-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}

      <ol role="list" className="mb-5 space-y-2" data-papel="lista-de-versoes">
        {p.versoes.length === 0 ? (
          <li className="text-xs text-[color:var(--color-ink-3)]">
            {p.ehFormula
              ? "Nenhuma versão cadastrada. Enquanto não houver versão aprovada, esta rubrica não é considerada nos contracheques."
              : "Nenhuma versão cadastrada."}
          </li>
        ) : (
          p.versoes.map((v) => (
            <li key={v.id} data-versao={v.versao} data-situacao={v.situacao} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-xs">
              <p className="font-semibold text-[color:var(--color-ink)]">
                Versão {v.versao} — {v.situacao} — {v.vigencia} — regime {v.regime}
              </p>
              {v.formula !== null ? <p className="mt-1 text-[color:var(--color-ink)]">Fórmula: <code>{v.formula}</code></p> : null}
              {v.percentual !== null ? <p className="mt-1 text-[color:var(--color-ink)]">Percentual: {v.percentual}</p> : null}
              {v.dependencias.length > 0 ? <p className="mt-1 text-[color:var(--color-ink-2)]">Cita: {v.dependencias.join(", ")}</p> : null}
              <p className="mt-1 text-[color:var(--color-ink-2)]">{v.incidencias}; arredondamento em {v.casasDecimais} casa(s).</p>
              <p className="mt-1 text-[color:var(--color-ink-2)]">Fundamento: {v.fundamentacaoLegal}</p>
              <p className="mt-1 text-[color:var(--color-ink-3)]">{v.autoria}</p>

              {v.podeAprovar ? (
                <form action={action} className="mt-2" data-acao="aprovar">
                  <ChaveDeComando />
                  <input type="hidden" name="__acao" value="aprovar" />
                  <input type="hidden" name="__versao" value={v.id} />
                  <input type="hidden" name="__rubrica" value={p.rubricaId} />
                  <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
                    {pendente ? "Gravando…" : `Aprovar a versão ${v.versao}`}
                  </button>
                  <span className="ml-2 text-[color:var(--color-ink-3)]">Quem escreveu esta versão não pode aprová-la.</span>
                </form>
              ) : null}

              {v.podeRevogar ? (
                <form action={action} className="mt-2 grid gap-2 sm:grid-cols-4" data-acao="revogar">
                  <ChaveDeComando />
                  <input type="hidden" name="__acao" value="revogar" />
                  <input type="hidden" name="__versao" value={v.id} />
                  <input type="hidden" name="__rubrica" value={p.rubricaId} />
                  <label className="sm:col-span-3">
                    <span className={ROTULO}>Motivo da revogação da versão {v.versao}</span>
                    <input name="motivo" required minLength={10} maxLength={500} className={CAMPO} />
                  </label>
                  <div className="self-end">
                    <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>Revogar</button>
                  </div>
                </form>
              ) : null}
            </li>
          ))
        )}
      </ol>

      {p.podeCriar ? (
        <form action={action} className="grid gap-3 sm:grid-cols-4" data-acao="criar-versao">
          <ChaveDeComando />
          <input type="hidden" name="__acao" value="criar" />
          <input type="hidden" name="__rubrica" value={p.rubricaId} />

          <label className="text-xs">
            <span className={ROTULO}>Vigência — competência inicial (AAAA-MM)</span>
            <input name="competenciaInicio" required pattern="[0-9]{4}-(0[1-9]|1[0-2])" placeholder="2026-07" className={CAMPO} />
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Competência final (AAAA-MM, opcional)</span>
            <input name="competenciaFim" pattern="[0-9]{4}-(0[1-9]|1[0-2])" className={CAMPO} />
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Regime a que se aplica</span>
            <select name="regime" defaultValue="TODOS" className={CAMPO}>
              <option value="TODOS">Todos os regimes</option>
              <option value="RPPS">Só RPPS</option>
              <option value="RGPS">Só RGPS</option>
              <option value="ISENTO">Só isentos</option>
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Casas do arredondamento</span>
            <input name="casasDecimais" type="number" min={0} max={6} defaultValue={2} className={CAMPO} />
          </label>

          {p.ehFormula ? (
            <label className="text-xs sm:col-span-4">
              <span className={ROTULO}>Fórmula</span>
              <input name="formula" required maxLength={2000} placeholder="(vencimento_base + rubrica.ADNOT) * 0.10" className={CAMPO} />
              <span className="mt-1 block text-[color:var(--color-ink-3)]">
                Variáveis disponíveis: {p.variaveis.map((v) => v.nome).join(", ")}. Para citar outra
                rubrica, escreva {p.prefixo}CÓDIGO
                {p.rubricasCitaveis.length === 0 ? "." : ` — existem: ${p.rubricasCitaveis.join(", ")}.`}
                {" "}Operações: + − * / com parênteses, e as funções min, max, arredondar, teto, piso e se.
                Não é permitida fórmula que faça referência a si mesma, direta ou indiretamente.
              </span>
            </label>
          ) : (
            <label className="text-xs sm:col-span-2">
              <span className={ROTULO}>Percentual (0.20 = 20%) — só para percentual do vencimento</span>
              <input name="percentual" inputMode="decimal" className={CAMPO} />
            </label>
          )}

          <label className="text-xs sm:col-span-4">
            <span className={ROTULO}>Fundamentação legal</span>
            <input name="fundamentacaoLegal" required minLength={3} maxLength={500} className={CAMPO} />
          </label>

          <label className="text-xs">
            <span className={ROTULO}>Compõe base de contribuição</span>
            <select name="incideContribuicao" defaultValue="sim" className={CAMPO}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Compõe base de IRRF</span>
            <select name="incideIrrf" defaultValue="sim" className={CAMPO}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Proporcional aos dias trabalhados</span>
            <select name="proporcionalAosDias" defaultValue="nao" className={CAMPO}>
              <option value="nao">Não — valor cheio</option>
              <option value="sim">Sim</option>
            </select>
            {p.ehFormula ? (
              <span className="mt-1 block text-[color:var(--color-ink-3)]">
                Em fórmulas, use a variável fator_dias para a proporcionalidade; não marque esta opção.
              </span>
            ) : null}
          </label>

          <div className="sm:col-span-4">
            <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
              {pendente ? "Gravando…" : "Gravar como rascunho"}
            </button>
            <span className="ml-2 text-xs text-[color:var(--color-ink-3)]">
              A versão é gravada como rascunho e só passa a valer após aprovação por outro usuário.
            </span>
          </div>
        </form>
      ) : (
        <p className="text-xs text-[color:var(--color-ink-3)]">Seu perfil permite consultar as versões, mas não cadastrá-las.</p>
      )}
    </section>
  );
}
