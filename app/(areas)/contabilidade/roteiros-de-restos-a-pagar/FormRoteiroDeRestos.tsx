"use client";

import { createContext, useActionState, useContext, useRef, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_AREA_TEXTO as AREA,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  AvisosDosAtos,
  ResultadosDosAtos,
  useResultadoDoAto,
} from "../../../../components/ui/ResultadosDosAtos";
import { publicarRoteiroDeRestosAction, type EstadoDoRoteiroDeRestos } from "./actions";

/**
 * O FORMULÁRIO DAS CONTAS DAS OPERAÇÕES DE RESTOS A PAGAR (V15).
 *
 * ⚠️ UM PROVEDOR PARA A TABELA INTEIRA, e o aviso mora nele: publicar muda a LINHA da operação, e
 * a confirmação guardada dentro dela morreria junto — mesma cura do guichê.
 *
 * ⚠️ SEM DEFAULT EM NENHUMA CONTA. Estas são exatamente as escolhas que não se tomam no lugar do
 * ente. Um valor pré-selecionado as tomaria em silêncio, e o ente publicaria sem ler.
 */

export interface ContaDoPlano {
  readonly codigo: string;
  readonly nome: string;
}

/**
 * ⚠️ O CONTEXTO CARREGA SÓ AS CONTAS, e não mais a ação. Antes havia UMA ação para as quatro
 * operações, o que fazia o resultado de publicar a liquidação aparecer como se fosse do
 * pagamento — e o percurso, que lê o marcador por nome de ação, não distinguiria os dois. Cada
 * operação publica no seu próprio nome.
 */
interface Ctx {
  readonly patrimoniais: readonly ContaDoPlano[];
  readonly controle: readonly ContaDoPlano[];
}
const C = createContext<Ctx | null>(null);

export function ContasDasOperacoes({
  patrimoniais,
  controle,
  children,
}: {
  readonly patrimoniais: readonly ContaDoPlano[];
  readonly controle: readonly ContaDoPlano[];
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <C.Provider value={{ patrimoniais, controle }}>
      <ResultadosDosAtos>
        <AvisosDosAtos />
        <div className="grid gap-5">{children}</div>
      </ResultadosDosAtos>
    </C.Provider>
  );
}

function usarContexto(): Ctx {
  const c = useContext(C);
  if (c === null) throw new Error("Use dentro de ContasDasOperacoes.");
  return c;
}

function Seletor({
  nome,
  rotulo,
  contas,
}: {
  readonly nome: string;
  readonly rotulo: string;
  readonly contas: readonly ContaDoPlano[];
}): React.ReactElement {
  const id = `${nome}-${rotulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label className={ROTULO} htmlFor={id}>
        {rotulo}
      </label>
      <select className={CAMPO} id={id} name={nome} defaultValue="">
        <option value="">Não informar</option>
        {contas.map((c) => (
          <option key={c.codigo} value={c.codigo}>
            {c.codigo} — {c.nome}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * O formulário de UMA operação.
 *
 * ⚠️ `patrimonialSeInforma` é FALSO no pagamento, e a tela DIZ isso em vez de mostrar dois campos
 * vazios que o ente tentaria preencher: lá a obrigação a baixar é a que a liquidação de origem
 * criou, e a saída de caixa é a conta contábil da conta bancária escolhida no ato.
 */
export function FormDaOperacao({
  evento,
  rotulo,
  patrimonialSeInforma,
}: {
  readonly evento: string;
  readonly rotulo: string;
  readonly patrimonialSeInforma: boolean;
}): React.ReactElement {
  const { patrimoniais, controle } = usarContexto();
  const acao = `publicar-contas-${evento}`;
  const publicar = useResultadoDoAto(acao);
  const [seq, setSeq] = useState(0);
  const ultimo = useRef<string | undefined>(undefined);
  const [estado, action, pendente] = useActionState<EstadoDoRoteiroDeRestos, FormData>(async (ant, dados) => {
    const r = await publicarRoteiroDeRestosAction(ant, dados);
    if (r.erro !== undefined) publicar("erro", r.erro);
    else if (r.sucesso !== undefined) publicar("ok", r.sucesso);
    return r;
  }, {});
  // ⚠️ AS DUAS METADES DO CONTRATO. `AvisosDosAtos` só mostra o aviso de um formulário que
  // DESMONTOU; enquanto este continua na tela, é ele quem confirma. Ver o comentário gêmeo em
  // `AcoesDoResto.tsx`, escrito depois de dois silêncios medidos.
  const texto = estado.erro ?? estado.sucesso;
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }
  return (
    <>
      <form action={action} className="mt-3 grid gap-3 border-t border-slate-200 pt-3" data-acao={acao}>
      <ChaveDeComando />
      <input type="hidden" name="evento" value={evento} />
      {patrimonialSeInforma ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Seletor nome="contaDebitoCodigo" rotulo="Conta de débito" contas={patrimoniais} />
          <Seletor nome="contaCreditoCodigo" rotulo="Conta de crédito" contas={patrimoniais} />
        </div>
      ) : (
        <p className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Nesta operação as contas de débito e crédito não se informam aqui. A obrigação baixada é a
          que a liquidação de origem registrou, e a saída de caixa é a conta contábil da conta
          bancária escolhida no momento do pagamento.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Seletor
          nome="contaControleDebitoCodigo"
          rotulo="Disponibilidade por destinação — débito"
          contas={controle}
        />
        <Seletor
          nome="contaControleCreditoCodigo"
          rotulo="Disponibilidade por destinação — crédito"
          contas={controle}
        />
      </div>
      <div>
        <label className={ROTULO} htmlFor={`fundamento-${evento}`}>
          Por que estas contas
        </label>
        <textarea
          className={AREA}
          id={`fundamento-${evento}`}
          name="fundamento"
          rows={2}
          maxLength={500}
          placeholder="Cite o plano de contas do município, a norma ou a orientação do tribunal."
        />
      </div>
      <div>
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
          {pendente ? "Publicando..." : `Publicar contas — ${rotulo}`}
        </button>
      </div>
      </form>
      {texto === undefined ? null : (
        <p
          className={
            estado.erro !== undefined
              ? "whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
              : "rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
          }
          data-resultado-da-acao={acao}
          data-resultado-seq={seq}
          role={estado.erro !== undefined ? "alert" : "status"}
        >
          {texto}
        </p>
      )}
    </>
  );
}
