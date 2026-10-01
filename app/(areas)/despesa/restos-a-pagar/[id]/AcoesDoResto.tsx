"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  CLASSE_AREA_TEXTO as AREA,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import {
  AvisosDosAtos,
  ResultadosDosAtos,
  useResultadoDoAto,
} from "../../../../../components/ui/ResultadosDosAtos";
import {
  anularCancelamentoAction,
  anularPagamentoAction,
  cancelarAction,
  liquidarAction,
  pagarAction,
  type EstadoDaOperacao,
} from "./actions";

/**
 * AS OPERAÇÕES DE UM RESTO A PAGAR, NA TELA (V15).
 *
 * ⚠️ ELEGIBILIDADE, NÃO OCULTAMENTO DE BOTÃO. O que não cabe não é oferecido — liquidar só existe
 * para resto NÃO processado, anular só existe onde há ato a anular —, mas a proteção de verdade
 * está no servidor: cada ação cobra a sua permissão e o domínio cobra o saldo dentro da
 * transação. Esconder um botão nunca foi proteção.
 *
 * ⚠️ A FONTE VEM DA CONTA BANCÁRIA ESCOLHIDA, e não de um campo livre: a fonte do pagamento tem
 * de casar com a da conta, e digitá-la à parte só criaria a chance de divergir.
 */

/**
 * ⚠️ DINHEIRO EM `<option>` TAMBÉM É DINHEIRO NA TELA. As opções mostravam `5000.00` — o formato
 * interno —, e um servidor municipal escolhendo entre atos a anular lê valores em reais, não
 * decimais de banco. Quem achou foi o percurso, procurando `5.000,00` e não encontrando; o defeito
 * era da tela, não do percurso.
 */
function reais(valor: string): string {
  return formatarMoeda(valor).texto;
}

export interface ContaParaPagar {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
}
export interface LiquidacaoParaPagar {
  readonly id: string;
  readonly numero: string;
  readonly valor: string;
}
export interface AtoParaAnular {
  readonly id: string;
  readonly rotulo: string;
  readonly valor: string;
}

/**
 * ⚠️ O RESULTADO SAI PELO CONTRATO DECLARADO, e as DUAS metades são necessárias.
 *
 * A primeira corrida do percurso reportou **silêncio** nas cinco operações, com `POST 200` no log
 * do servidor — as ações funcionavam. Eu havia escrito o aviso como um `<p>` de classes próprias,
 * que o percurso não lê: o contrato desta obra é `[data-resultado-da-acao]` com
 * `data-resultado-seq`, e a sequência existe para impedir que se leia o resultado do envio
 * ANTERIOR como se fosse deste.
 *
 * ⚠️ E O SEGUNDO SILÊNCIO ENSINOU O RESTO. Passar tudo para `AvisosDosAtos` também calou: aquele
 * componente mostra um aviso **só quando o formulário que o produziu desmontou**
 * (`montados[instancia] === 0`), porque enquanto ele está na tela é ELE quem deve mostrar. As duas
 * metades cobrem casos diferentes e nenhuma cobre as duas: o formulário que FICA confirma dentro
 * de si; o que DESAPARECE — anular um pagamento remove o próprio formulário de anulação — confirma
 * na barra. Foi por isso que eu errei duas vezes na mesma peça: cada conserto cobriu uma metade.
 */
function useAto(
  acao: string,
  action: (anterior: EstadoDaOperacao, dados: FormData) => Promise<EstadoDaOperacao>
): {
  readonly disparar: (f: FormData) => void;
  readonly pendente: boolean;
  readonly marca: React.ReactElement | null;
  /**
   * ⚠️ O PREFIXO DOS `id` DOS CAMPOS, do `useId`. Ele sai daqui porque esta tela tem CINCO
   * formulários, e um id literal repetiria no segundo: o `<label for>` passaria a apontar para o
   * campo do primeiro, o leitor de tela anunciaria o rótulo errado e o foco iria para o lugar
   * errado. O censo de UI (`formularios-na-mesma-pagina`) cobra isso, e foi ele que apontou.
   */
  readonly uid: string;
} {
  const uid = useId();
  const publicar = useResultadoDoAto(acao);
  const [seq, setSeq] = useState(0);
  const [estado, disparar, pendente] = useActionState<EstadoDaOperacao, FormData>(async (ant, dados) => {
    const r = await action(ant, dados);
    if (r.erro !== undefined) publicar("erro", r.erro);
    else if (r.sucesso !== undefined) publicar("ok", r.sucesso);
    return r;
  }, {});
  const texto = estado.erro ?? estado.sucesso;
  const ultimo = useRef<string | undefined>(undefined);
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }
  const marca =
    texto === undefined ? null : (
      <p
        className={
          estado.erro !== undefined
            ? "mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
            : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        }
        data-resultado-da-acao={acao}
        data-resultado-seq={seq}
        role={estado.erro !== undefined ? "alert" : "status"}
      >
        {texto}
      </p>
    );
  return { disparar, pendente, marca, uid };
}

function Bloco({
  titulo,
  descricao,
  children,
}: {
  readonly titulo: string;
  readonly descricao: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] p-4">
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">{titulo}</h3>
      <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{descricao}</p>
      {children}
    </section>
  );
}

export function FormLiquidar({
  inscricaoId,
  empenhoId,
}: {
  readonly inscricaoId: string;
  readonly empenhoId: string;
}): React.ReactElement {
  const { disparar: action, pendente, marca, uid } = useAto("liquidar-resto", liquidarAction);
  return (
    <Bloco
      titulo="Liquidar"
      descricao="Registra a liquidação da despesa empenhada no exercício anterior, sem novo empenho e sem consumir dotação do exercício corrente."
    >
      <form action={action} className="mt-3 grid gap-3" data-acao="liquidar-resto">
        <ChaveDeComando />
        <input type="hidden" name="inscricaoId" value={inscricaoId} />
        <input type="hidden" name="empenhoId" value={empenhoId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={ROTULO} htmlFor={`${uid}-liq-numero`}>Número da liquidação</label>
            <input className={CAMPO} id={`${uid}-liq-numero`} name="numero" type="text" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-liq-valor`}>Valor</label>
            <input className={CAMPO} id={`${uid}-liq-valor`} name="valor" type="text" inputMode="decimal" placeholder="0,00" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-liq-data`}>Data</label>
            <input className={CAMPO} id={`${uid}-liq-data`} name="data" type="date" />
          </div>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-liq-atesto`}>Responsável pelo atesto</label>
          <input className={CAMPO} id={`${uid}-liq-atesto`} name="responsavelAtesto" type="text" />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-liq-hist`}>Histórico</label>
          <input className={CAMPO} id={`${uid}-liq-hist`} name="historico" type="text" />
        </div>
        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Liquidando..." : "Liquidar"}
          </button>
        </div>
      </form>
      {marca}
    </Bloco>
  );
}

export function FormPagar({
  inscricaoId,
  liquidacoes,
  contas,
}: {
  readonly inscricaoId: string;
  readonly liquidacoes: readonly LiquidacaoParaPagar[];
  readonly contas: readonly ContaParaPagar[];
}): React.ReactElement {
  const { disparar: action, pendente, marca, uid } = useAto("pagar-resto", pagarAction);
  const [conta, setConta] = useState("");
  const escolhida = contas.find((c) => c.codigo === conta);
  return (
    <Bloco
      titulo="Pagar"
      descricao="Registra o pagamento e quita a obrigação correspondente à liquidação escolhida."
    >
      {liquidacoes.length === 0 ? (
        <p className="mt-3 rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">
          Não há liquidação disponível para pagar neste resto a pagar.
        </p>
      ) : (
        <form action={action} className="mt-3 grid gap-3" data-acao="pagar-resto">
          <ChaveDeComando />
          <input type="hidden" name="inscricaoId" value={inscricaoId} />
          <input type="hidden" name="fonteId" value={escolhida?.fonteId ?? ""} />
          <div>
            <label className={ROTULO} htmlFor={`${uid}-pag-liq`}>Liquidação de origem</label>
            <select className={CAMPO} id={`${uid}-pag-liq`} name="liquidacaoId" defaultValue="">
              <option value="">Escolha</option>
              {liquidacoes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.numero} — {reais(l.valor)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={ROTULO} htmlFor={`${uid}-pag-numero`}>Número do pagamento</label>
              <input className={CAMPO} id={`${uid}-pag-numero`} name="numero" type="text" />
            </div>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-pag-valor`}>Valor</label>
              <input className={CAMPO} id={`${uid}-pag-valor`} name="valor" type="text" inputMode="decimal" placeholder="0,00" />
            </div>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-pag-data`}>Data</label>
              <input className={CAMPO} id={`${uid}-pag-data`} name="data" type="date" />
            </div>
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-pag-conta`}>Conta bancária</label>
            <select
              className={CAMPO}
              id={`${uid}-pag-conta`}
              name="contaBancaria"
              value={conta}
              onChange={(e) => setConta(e.target.value)}
            >
              <option value="">Escolha</option>
              {contas.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.descricao} (fonte {c.fonteCodigo})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-pag-hist`}>Histórico</label>
            <input className={CAMPO} id={`${uid}-pag-hist`} name="historico" type="text" />
          </div>
          <div>
            <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
              {pendente ? "Pagando..." : "Pagar"}
            </button>
          </div>
        </form>
      )}
      {marca}
    </Bloco>
  );
}

export function FormCancelar({ inscricaoId }: { readonly inscricaoId: string }): React.ReactElement {
  const { disparar: action, pendente, marca, uid } = useAto("cancelar-resto", cancelarAction);
  return (
    <Bloco
      titulo="Cancelar"
      descricao="Cancela a obrigação com o credor, no todo ou em parte, sem saída de caixa. O cancelamento pode ser anulado posteriormente."
    >
      <form action={action} className="mt-3 grid gap-3" data-acao="cancelar-resto">
        <ChaveDeComando />
        <input type="hidden" name="inscricaoId" value={inscricaoId} />
        <div>
          <label className={ROTULO} htmlFor={`${uid}-canc-valor`}>Valor a cancelar</label>
          <input className={CAMPO} id={`${uid}-canc-valor`} name="valor" type="text" inputMode="decimal" placeholder="0,00" />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-canc-motivo`}>Motivo</label>
          <textarea className={AREA} id={`${uid}-canc-motivo`} name="motivo" rows={2} />
        </div>
        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Cancelando..." : "Cancelar resto a pagar"}
          </button>
        </div>
      </form>
      {marca}
    </Bloco>
  );
}

export function FormAnularPagamento({
  inscricaoId,
  atos,
}: {
  readonly inscricaoId: string;
  readonly atos: readonly AtoParaAnular[];
}): React.ReactElement {
  const { disparar: action, pendente, marca, uid } = useAto("anular-pagamento-resto", anularPagamentoAction);
  return (
    <Bloco
      titulo="Anular pagamento"
      descricao="O pagamento original é preservado e o valor retorna ao saldo a pagar."
    >
      <form action={action} className="mt-3 grid gap-3" data-acao="anular-pagamento-resto">
        <ChaveDeComando />
        <input type="hidden" name="inscricaoId" value={inscricaoId} />
        <div>
          <label className={ROTULO} htmlFor={`${uid}-anp-alvo`}>Pagamento</label>
          <select className={CAMPO} id={`${uid}-anp-alvo`} name="pagamentoId" defaultValue="">
            <option value="">Escolha</option>
            {atos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo} — {reais(a.valor)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={ROTULO} htmlFor={`${uid}-anp-numero`}>Número do documento da anulação</label>
            <input className={CAMPO} id={`${uid}-anp-numero`} name="numero" type="text" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-anp-data`}>Data da anulação</label>
            <input className={CAMPO} id={`${uid}-anp-data`} name="data" type="date" />
          </div>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-anp-motivo`}>Motivo</label>
          <textarea className={AREA} id={`${uid}-anp-motivo`} name="motivo" rows={2} />
        </div>
        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Anulando..." : "Anular pagamento"}
          </button>
        </div>
      </form>
      {marca}
    </Bloco>
  );
}

export function FormAnularCancelamento({
  inscricaoId,
  atos,
}: {
  readonly inscricaoId: string;
  readonly atos: readonly AtoParaAnular[];
}): React.ReactElement {
  const { disparar: action, pendente, marca, uid } = useAto("anular-cancelamento-resto", anularCancelamentoAction);
  return (
    <Bloco
      titulo="Anular cancelamento"
      descricao="Restabelece a obrigação com o credor e devolve o valor ao saldo a pagar. Utilize para corrigir um cancelamento registrado por engano."
    >
      <form action={action} className="mt-3 grid gap-3" data-acao="anular-cancelamento-resto">
        <ChaveDeComando />
        <input type="hidden" name="inscricaoId" value={inscricaoId} />
        <div>
          <label className={ROTULO} htmlFor={`${uid}-anc-alvo`}>Cancelamento</label>
          <select className={CAMPO} id={`${uid}-anc-alvo`} name="movimentoId" defaultValue="">
            <option value="">Escolha</option>
            {atos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo} — {reais(a.valor)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={ROTULO} htmlFor={`${uid}-anc-numero`}>Número do documento da anulação</label>
            <input className={CAMPO} id={`${uid}-anc-numero`} name="numero" type="text" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-anc-data`}>Data da anulação</label>
            <input className={CAMPO} id={`${uid}-anc-data`} name="data" type="date" />
          </div>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-anc-motivo`}>Motivo</label>
          <textarea className={AREA} id={`${uid}-anc-motivo`} name="motivo" rows={2} />
        </div>
        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Anulando..." : "Anular cancelamento"}
          </button>
        </div>
      </form>
      {marca}
    </Bloco>
  );
}

/**
 * O PAINEL das operações — um provedor de resultados para as cinco.
 *
 * ⚠️ UM SÓ PROVEDOR, e não um por formulário: os cinco atos mudam a MESMA inscrição, e a
 * confirmação guardada dentro de um formulário que a recarga faz desaparecer morreria junto com
 * ele. É a mesma cura do guichê, e é também o que faz a confirmação sobreviver ao
 * `revalidatePath` — anular um pagamento remove o próprio formulário de anulação da tela.
 */
export function PainelDeAcoes({
  inscricaoId,
  empenhoId,
  liquidarVisivel,
  liquidacoes,
  contas,
  pagamentosAnulaveis,
  cancelamentosAnulaveis,
}: {
  readonly inscricaoId: string;
  readonly empenhoId: string;
  readonly liquidarVisivel: boolean;
  readonly liquidacoes: readonly LiquidacaoParaPagar[];
  readonly contas: readonly ContaParaPagar[];
  readonly pagamentosAnulaveis: readonly AtoParaAnular[];
  readonly cancelamentosAnulaveis: readonly AtoParaAnular[];
}): React.ReactElement {
  return (
    <ResultadosDosAtos>
      <AvisosDosAtos />
      <div className="grid gap-4">
        {liquidarVisivel ? <FormLiquidar empenhoId={empenhoId} inscricaoId={inscricaoId} /> : null}
        <FormPagar contas={contas} inscricaoId={inscricaoId} liquidacoes={liquidacoes} />
        <FormCancelar inscricaoId={inscricaoId} />
        {pagamentosAnulaveis.length > 0 ? (
          <FormAnularPagamento atos={pagamentosAnulaveis} inscricaoId={inscricaoId} />
        ) : null}
        {cancelamentosAnulaveis.length > 0 ? (
          <FormAnularCancelamento atos={cancelamentosAnulaveis} inscricaoId={inscricaoId} />
        ) : null}
      </div>
    </ResultadosDosAtos>
  );
}
