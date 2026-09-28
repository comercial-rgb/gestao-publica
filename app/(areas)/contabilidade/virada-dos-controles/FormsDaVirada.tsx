"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_AREA_TEXTO as AREA,
  CLASSE_BOTAO_PRIMARIO as BOTAO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO as PAINEL,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  classificarContaAction,
  encerrarControlesAction,
  estornarEncerramentoAction,
  type EstadoDaVirada,
} from "./actions";

/**
 * OS TRÊS FORMULÁRIOS DA VIRADA DOS CONTROLES.
 *
 * ⚠️ A ORDEM NA TELA É A ORDEM DO RITO: primeiro classificar (a régua), depois encerrar (o ato),
 * depois estornar (o desfazimento). Pôr o ato antes da régua convidaria ao clique que recusa.
 */

function Resultado({
  estado,
  acao,
}: {
  readonly estado: EstadoDaVirada;
  readonly acao: string;
}): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p
        className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        data-resultado-da-acao={acao}
        role="alert"
      >
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p
        className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        data-resultado-da-acao={acao}
      >
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

export interface OpcaoDeConta {
  readonly codigo: string;
  readonly rotulo: string;
  readonly destinoSugerido: "ENCERRA" | "TRANSFERE";
  readonly razaoDaSugestao: string;
}

/**
 * CLASSIFICAR uma conta de controle.
 *
 * ⚠️ O ROL É O DAS CONTAS COM SALDO, e só. O plano tem milhares de contas; oferecer todas seria o
 * `select` bonito e inútil que a regra de interface proíbe. O que precisa de decisão é o que tem
 * saldo em 31 de dezembro.
 *
 * ⚠️ E A SUGESTÃO APARECE ESCRITA, com a razão — mas ela NÃO é aplicada em silêncio: o campo nasce
 * com o valor sugerido e a justificativa nasce VAZIA e obrigatória. Quem confirma escreve por quê.
 */
export function FormClassificarConta({
  contas,
}: {
  readonly contas: readonly OpcaoDeConta[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaVirada, FormData>(
    classificarContaAction,
    {}
  );

  return (
    <details className={PAINEL} data-forma="classificar-conta-na-virada">
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">
        Classificar o destino de uma conta de controle
      </summary>
      <form action={action} className="mt-4 space-y-4" data-acao="classificar-conta-na-virada">
        <ChaveDeComando />

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          <strong>ENCERRA</strong>: o saldo é encerrado em 31 de dezembro, como a dotação e o crédito
          não empenhado. <strong>TRANSFERE</strong>: o saldo passa ao exercício seguinte, como o
          controle dos restos a pagar. A justificativa é obrigatória e fica registrada com o
          responsável.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={ROTULO}>Conta de controle (somente as que têm saldo)</span>
            <select className={CAMPO} defaultValue="" name="contaCodigo" required>
              <option disabled value="">
                Escolha a conta
              </option>
              {contas.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ROTULO}>Destino no encerramento</span>
            <select className={CAMPO} defaultValue="ENCERRA" name="destino" required>
              <option value="ENCERRA">ENCERRA: saldo encerrado em 31 de dezembro</option>
              <option value="TRANSFERE">TRANSFERE: saldo transferido ao exercício seguinte</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={ROTULO}>Justificativa</span>
            <textarea
              className={AREA}
              minLength={15}
              name="justificativa"
              placeholder="Ex.: crédito orçamentário não empenhado, extinto ao fim do exercício (CF, art. 167, II)."
              required
            />
          </label>
        </div>

        <Resultado acao="classificar-conta-na-virada" estado={estado} />

        <button className={BOTAO} disabled={pendente} type="submit">
          {pendente ? "Gravando…" : "Gravar o destino desta conta"}
        </button>
      </form>
    </details>
  );
}

/**
 * ENCERRAR os controles do exercício.
 *
 * ⚠️ CONFIRMAÇÃO POR DIGITAR O ANO, conferida no servidor — a mesma do encerramento do exercício, e
 * pelo mesmo motivo: é lançamento no razão que zera o orçamento inteiro de um ano. Um botão simples
 * aqui seria um clique acidental com muitas casas decimais.
 */
export function FormEncerrarControles({
  exercicio,
  podeEncerrar,
  impedimento,
}: {
  readonly exercicio: number;
  readonly podeEncerrar: boolean;
  readonly impedimento: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaVirada, FormData>(
    encerrarControlesAction,
    {}
  );

  return (
    <details className={PAINEL} data-forma="encerrar-controles">
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">
        Encerrar os controles orçamentários de {exercicio}
      </summary>
      <form action={action} className="mt-4 space-y-3" data-acao="encerrar-controles">
        <ChaveDeComando />
        <input name="ano" type="hidden" value={exercicio} />

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          Registra um lançamento em 31 de dezembro de {exercicio} que zera as contas classificadas
          como <strong>ENCERRA</strong> e mantém as classificadas como <strong>TRANSFERE</strong>.{" "}
          <strong>Todas as contas com saldo devem estar classificadas.</strong> O encerramento pode
          ser desfeito por estorno.
        </div>

        {podeEncerrar ? null : (
          <p
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]"
            data-impedimento-da-virada={String(exercicio)}
          >
            {impedimento}
          </p>
        )}

        <label className="block text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Para confirmar, digite o ano do exercício</span>
          <input
            className={`${CAMPO} w-32`}
            inputMode="numeric"
            name="confirmacao"
            placeholder={String(exercicio)}
            required
          />
        </label>

        <Resultado acao="encerrar-controles" estado={estado} />

        <button
          className="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] px-4 text-sm font-semibold text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
          disabled={pendente}
          type="submit"
        >
          {pendente ? "Encerrando…" : `Encerrar os controles de ${exercicio}`}
        </button>
      </form>
    </details>
  );
}

/**
 * ESTORNAR um encerramento já feito.
 *
 * ⚠️ UM FORMULÁRIO NÃO PODE DESAPARECER COM O PRÓPRIO SUCESSO — e o percurso ensinou isso DUAS vezes,
 * no mesmo ato. Na primeira versão o formulário ficava DENTRO da linha do encerramento: estornar
 * re-renderizava a linha como "Estornado", o formulário saía da tela e levava a mensagem de sucesso
 * com ele. Movido para fora da tabela, o defeito voltou um nível acima: a página só o montava quando
 * havia encerramento VIGENTE, e depois de estornar o último não havia mais nenhum — o formulário
 * sumia de novo.
 *
 * As duas vezes o percurso leu a MESMA coisa: `silencio`, com o estorno GRAVADO e o saldo já de
 * volta. Silêncio é indistinguível de "nada aconteceu", e é o pior retorno possível para um ato que
 * mexe no razão. Agora o formulário fica MONTADO enquanto existir qualquer encerramento, e quando
 * não há mais nenhum vigente ele diz isso em vez de desaparecer.
 *
 * ⚠️ E O ESTORNO É LANÇAMENTO NOVO: o original permanece no razão. Um desfazimento que apagasse o
 * lançamento seria um razão que não sabe contar a própria história.
 */
export function FormEstornarEncerramento({
  encerramentos,
}: {
  readonly encerramentos: readonly { readonly operacaoId: string; readonly rotulo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaVirada, FormData>(
    estornarEncerramentoAction,
    {}
  );

  return (
    <details className={PAINEL} data-forma="estornar-encerramento">
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">
        Estornar um encerramento de controles
      </summary>
      <form action={action} className="mt-4 space-y-3" data-acao="estornar-encerramento">
        <ChaveDeComando />

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          O estorno registra um lançamento inverso e o <strong>original permanece no razão</strong>.
          Os saldos das contas são restabelecidos e o encerramento pode ser refeito.
        </div>

        <label className="block">
          <span className={ROTULO}>Encerramento a estornar</span>
          <select
            className={CAMPO}
            defaultValue=""
            disabled={encerramentos.length === 0}
            name="operacaoId"
            required
          >
            <option disabled value="">
              {encerramentos.length === 0
                ? "Nenhum encerramento vigente para estornar"
                : "Escolha o encerramento"}
            </option>
            {encerramentos.map((e) => (
              <option key={e.operacaoId} value={e.operacaoId}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </label>
        {encerramentos.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-sem-encerramento-vigente>
            Todos os encerramentos de controles foram estornados. Os saldos foram restabelecidos e o
            encerramento pode ser refeito no formulário abaixo.
          </p>
        ) : null}
        <label className="block">
          <span className={ROTULO}>Motivo do estorno</span>
          <textarea className={AREA} minLength={10} name="motivo" required />
        </label>

        <Resultado acao="estornar-encerramento" estado={estado} />

        <button
          className="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-4 text-sm font-semibold text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
          disabled={pendente || encerramentos.length === 0}
          type="submit"
        >
          {pendente ? "Estornando…" : "Confirmar o estorno"}
        </button>
      </form>
    </details>
  );
}
