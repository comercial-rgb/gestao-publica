"use client";

import { createContext, useActionState, useContext, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { cadastrarAction, desativarAction, redefinirAction, type EstadoDoAto } from "./actions";

/**
 * OS FORMULÁRIOS DA CONSIGNAÇÃO (V11 V8.3).
 *
 * ⚠️ A CONTA ENTRA POR `select` DE ANALÍTICAS DE PASSIVO, e o recorte é do servidor. Despejar o
 * PCASP inteiro ofereceria sintéticas que a gravação recusa — e mandaria a pessoa descobrir isso
 * pelo erro, que é o oposto de ajudá-la a escolher.
 *
 * ⚠️ SEM DEFAULT NA CONTA. Esta é a decisão contábil que a pendência `CONSIGNACAO-CONTA-SINTETICA`
 * existia para não tomar no lugar do ente; um default a tomaria de novo, só que em silêncio.
 *
 * ⚠️ OS ATOS SOBRE UM TIPO CONFIRMAM ACIMA DA LINHA que eles fazem mudar — a mesma cura do
 * guichê (V8): redefinir e desativar mudam a linha, e o aviso guardado dentro dela morreria junto.
 */

export interface ContaDePassivo {
  readonly codigo: string;
  readonly nome: string;
}

function SelectDeConta({ contas }: { readonly contas: readonly ContaDePassivo[] }): React.ReactElement {
  return (
    <label className="text-xs sm:col-span-2">
      <span className={ROTULO}>Conta do passivo (onde a dívida nasce)</span>
      <select name="contaPassivoCodigo" required defaultValue="" className={CAMPO}>
        <option value="">Escolha a conta analítica…</option>
        {contas.map((c) => (
          <option key={c.codigo} value={c.codigo}>
            {c.codigo} — {c.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FormCadastrar({ contas }: { readonly contas: readonly ContaDePassivo[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(cadastrarAction, {});
  const [aberto, setAberto] = useState(false);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  const [seq, setSeq] = useState(0);

  if (estado.sucesso !== undefined && estado.sucesso !== ultimo) {
    setUltimo(estado.sucesso);
    setSeq((n) => n + 1);
    setAberto(false);
  }

  const confirmacao =
    estado.sucesso === undefined ? null : (
      <p
        role="status"
        data-resultado-da-acao="cadastrar-consignacao"
        data-resultado-seq={String(seq)}
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
      >
        {estado.sucesso}
      </p>
    );

  if (contas.length === 0) {
    return (
      <div className={`${CLASSE_PAINEL_FORMULARIO} text-xs text-[color:var(--color-ink-2)]`}>
        <strong className="text-[color:var(--color-ink)]">Nenhuma conta analítica de passivo no plano</strong> —
        carregue o plano de contas do ente antes de cadastrar consignações. Sem conta onde a dívida
        nasça, a retenção seria recusada no meio de um pagamento.
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Cadastrar uma consignação</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
              INSS, IRRF, ISS, pensão, caução — e as que o ente criar. É aqui que se diz em que conta
              do plano a retenção vira dívida com o consignatário.
            </p>
          </div>
          <button type="button" onClick={() => setAberto(true)} className={CLASSE_BOTAO_PRIMARIO}>
            Cadastrar consignação
          </button>
        </div>
        {confirmacao}
      </div>
    );
  }

  return (
    <form action={action} data-acao="cadastrar-consignacao" className={CLASSE_PAINEL_FORMULARIO} aria-label="Cadastrar uma consignação">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Cadastrar uma consignação</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">
          <span className={ROTULO}>Código</span>
          <input name="codigo" required maxLength={24} placeholder="INSS" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Descrição</span>
          <input name="descricao" required maxLength={160} placeholder="Retenção previdenciária - INSS" className={CAMPO} />
        </label>
        <SelectDeConta contas={contas} />
        <label className="text-xs sm:col-span-4">
          <span className={ROTULO}>Por que esta conta</span>
          <input
            name="fundamento"
            required
            minLength={20}
            maxLength={500}
            placeholder="Plano de contas do ente, quadro das consignações previdenciárias, item 4.2"
            className={CAMPO}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
        A escolha fica registrada com o seu nome e a data. Trocar a conta depois <strong>não
        reescreve</strong> o que já foi retido — o que já está no razão continua onde foi
        escriturado.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Gravando…" : "Cadastrar consignação"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-[color:var(--color-ink-3)] hover:underline">
          Cancelar
        </button>
        {estado.erro !== undefined ? (
          <span role="alert" className="text-xs whitespace-pre-line text-[color:var(--color-status-erro-fg)]">{estado.erro}</span>
        ) : null}
      </div>
    </form>
  );
}

interface AtosCtx {
  readonly aRed: (f: FormData) => void;
  readonly aDes: (f: FormData) => void;
  readonly pRed: boolean;
  readonly pDes: boolean;
  readonly contas: readonly ContaDePassivo[];
}
const Ctx = createContext<AtosCtx | null>(null);

/**
 * ⚠️ O PROVEDOR ENVOLVE A LISTA, e o aviso mora nele. Redefinir e desativar mudam a linha do tipo
 * — guardar a confirmação dentro dela a mataria junto, e quem enviou leria silêncio. É a mesma
 * cura do guichê, pela mesma razão medida.
 */
export function AtosDaConsignacao({
  contas,
  children,
}: {
  readonly contas: readonly ContaDePassivo[];
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [eRed, aRed, pRed] = useActionState<EstadoDoAto, FormData>(redefinirAction, {});
  const [eDes, aDes, pDes] = useActionState<EstadoDoAto, FormData>(desativarAction, {});
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);

  const sucesso = eRed.sucesso ?? eDes.sucesso;
  if (sucesso !== undefined && sucesso !== ultimo) {
    setUltimo(sucesso);
    setSeq((n) => n + 1);
  }
  const erro = eRed.erro ?? eDes.erro;

  return (
    <Ctx.Provider value={{ aRed, aDes, pRed, pDes, contas }}>
      {([["redefinir-consignacao", eRed.sucesso], ["desativar-consignacao", eDes.sucesso]] as const).map(([nome, msg]) =>
        msg === undefined ? null : (
          <p
            key={nome}
            role="status"
            data-resultado-da-acao={nome}
            data-resultado-seq={String(seq)}
            className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
          >
            {msg}
          </p>
        )
      )}
      {erro !== undefined ? (
        <p role="alert" className="mb-3 text-sm whitespace-pre-line text-[color:var(--color-status-erro-fg)]">{erro}</p>
      ) : null}
      {children}
    </Ctx.Provider>
  );
}

export function AtosDoTipo({ tipoId }: { readonly tipoId: string }): React.ReactElement {
  const ctx = useContext(Ctx);
  const [qual, setQual] = useState<"nenhum" | "redefinir" | "desativar">("nenhum");

  if (ctx === null) {
    return <span className="text-xs text-[color:var(--color-status-erro-fg)]">Atos indisponíveis nesta tela.</span>;
  }

  if (qual === "nenhum") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => setQual("redefinir")} className="underline">Trocar a conta</button>
        <button type="button" onClick={() => setQual("desativar")} className="underline">Desativar</button>
      </div>
    );
  }

  const voltar = (
    <button type="button" onClick={() => setQual("nenhum")} className="text-xs underline">Voltar</button>
  );

  if (qual === "redefinir") {
    return (
      <form action={ctx.aRed} data-acao="redefinir-consignacao" className="mt-2 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4" aria-label="Trocar a conta da consignação">
        <ChaveDeComando />
        <input type="hidden" name="tipoId" value={tipoId} />
        <SelectDeConta contas={ctx.contas} />
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Por que está mudando</span>
          <input name="fundamento" required minLength={20} maxLength={500} className={CAMPO} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-4">
          <button type="submit" disabled={ctx.pRed} className={CLASSE_BOTAO_PRIMARIO}>{ctx.pRed ? "Gravando…" : "Trocar a conta"}</button>
          {voltar}
        </div>
      </form>
    );
  }

  return (
    <form action={ctx.aDes} data-acao="desativar-consignacao" className="mt-2 flex flex-wrap items-end gap-3 text-xs" aria-label="Desativar a consignação">
      <ChaveDeComando />
      <input type="hidden" name="tipoId" value={tipoId} />
      <label className="text-xs">
        <span className={ROTULO}>Por que está desativando</span>
        <input name="fundamento" required minLength={20} maxLength={500} className={CAMPO} />
      </label>
      <button type="submit" disabled={ctx.pDes} className={CLASSE_BOTAO_PRIMARIO}>{ctx.pDes ? "Gravando…" : "Desativar"}</button>
      {voltar}
    </form>
  );
}
