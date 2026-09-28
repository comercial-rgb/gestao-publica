"use client";

import { createContext, useActionState, useContext, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  publicarEixoAction,
  publicarPorFonteAction,
  publicarRoteiroAction,
  type EstadoDoRoteiro,
} from "./actions";

/**
 * O FORMULÁRIO DO ROTEIRO (V11 V8.4).
 *
 * ⚠️ UM PROVEDOR PARA A TABELA INTEIRA, e o aviso mora nele: publicar muda a LINHA do par, e a
 * confirmação guardada dentro dela morreria junto. Mesma cura do guichê (V8), pela mesma razão
 * medida.
 *
 * ⚠️ SEM DEFAULT NAS CONTAS. Estas são exatamente as escolhas que duas pendências existiam para
 * não tomar no lugar do ente; um default as tomaria de novo, em silêncio.
 */

export interface ContaDoPlano {
  readonly codigo: string;
  readonly nome: string;
}

interface Ctx {
  readonly action: (f: FormData) => void;
  readonly pendente: boolean;
  readonly contas: readonly ContaDoPlano[];
  /** V11 V8.9 — o eixo e o roteiro por fonte têm ações próprias, no MESMO provedor. */
  readonly acaoDoEixo: (f: FormData) => void;
  readonly pendenteDoEixo: boolean;
  readonly acaoDaFonte: (f: FormData) => void;
  readonly pendenteDaFonte: boolean;
}
const C = createContext<Ctx | null>(null);

export function RoteirosDoEnte({
  contas,
  children,
}: {
  readonly contas: readonly ContaDoPlano[];
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoRoteiro, FormData>(publicarRoteiroAction, {});
  const [eixoEstado, acaoDoEixo, pendenteDoEixo] = useActionState<EstadoDoRoteiro, FormData>(publicarEixoAction, {});
  const [fonteEstado, acaoDaFonte, pendenteDaFonte] = useActionState<EstadoDoRoteiro, FormData>(publicarPorFonteAction, {});
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);

  // ⚠️ UM SÓ CONTADOR PARA OS TRÊS ATOS, e um só aviso: os três mudam a MESMA tabela, e a
  // confirmação guardada dentro da linha morreria com ela. Mesma cura do guichê (V8).
  const sucesso = estado.sucesso ?? eixoEstado.sucesso ?? fonteEstado.sucesso;
  const erro = estado.erro ?? eixoEstado.erro ?? fonteEstado.erro;
  if (sucesso !== undefined && sucesso !== ultimo) {
    setUltimo(sucesso);
    setSeq((n) => n + 1);
  }

  return (
    <C.Provider value={{ action, pendente, contas, acaoDoEixo, pendenteDoEixo, acaoDaFonte, pendenteDaFonte }}>
      {sucesso !== undefined ? (
        <p
          role="status"
          data-resultado-da-acao="publicar-roteiro"
          data-resultado-seq={String(seq)}
          className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        >
          {sucesso}
        </p>
      ) : null}
      {erro !== undefined ? (
        <p role="alert" className="mb-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
          {erro}
        </p>
      ) : null}
      {children}
    </C.Provider>
  );
}

export function FormDoPar({
  tipo,
  tipoCredito,
  abertura,
  debito,
  credito,
}: {
  readonly tipo: string;
  readonly tipoCredito: string | null;
  /** ⚠️ VEM DA LINHA, e não de um campo escolhível (V11 V8.8): quem diz se um crédito é ABERTO
   *  ou REABERTO é a CF art. 167 § 2º, lida do decreto contra a lei. Oferecer a escolha aqui
   *  seria pedir de novo o que o sistema já sabe — e o que se pede, se erra. */
  readonly abertura: string | null;
  readonly debito: string | null;
  readonly credito: string | null;
}): React.ReactElement {
  const ctx = useContext(C);
  const [aberto, setAberto] = useState(false);

  if (ctx === null) {
    return <span className="text-xs text-[color:var(--color-status-erro-fg)]">Configuração indisponível nesta tela.</span>;
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mt-1 text-xs underline">
        {debito === null ? "Configurar este roteiro" : "Trocar as contas"}
      </button>
    );
  }

  return (
    <form
      action={ctx.action}
      data-acao="publicar-roteiro"
      className="mt-2 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"
      aria-label={`Publicar o roteiro de ${tipo}`}
    >
      <ChaveDeComando />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="tipoCredito" value={tipoCredito ?? ""} />
      <input type="hidden" name="abertura" value={abertura ?? ""} />

      <label className="text-xs sm:col-span-2">
        <span className={ROTULO}>Conta de débito</span>
        <select name="contaDebitoCodigo" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a conta…</option>
          {ctx.contas.map((c) => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>
          ))}
        </select>
      </label>
      <label className="text-xs sm:col-span-2">
        <span className={ROTULO}>Conta de crédito</span>
        <select name="contaCreditoCodigo" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a conta…</option>
          {ctx.contas.map((c) => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>
          ))}
        </select>
      </label>
      <label className="text-xs sm:col-span-4">
        <span className={ROTULO}>Fundamento</span>
        <input
          name="fundamento"
          required
          minLength={20}
          maxLength={500}
          placeholder="Plano de contas do ente ou orientação do tribunal"
          className={CAMPO}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-4">
        <button type="submit" disabled={ctx.pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {ctx.pendente ? "Publicando…" : "Publicar roteiro"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs underline">Cancelar</button>
        {credito !== null ? (
          <span className="text-xs text-[color:var(--color-ink-3)]">
            Contas atuais: {debito} / {credito}. A publicação cria uma nova versão; a anterior permanece no histórico.
          </span>
        ) : null}
      </div>
    </form>
  );
}

/**
 * O EIXO DA DOTAÇÃO ADICIONAL (V11 V8.9).
 *
 * ⚠️ SÃO DOIS BOTÕES, NÃO UM `select` COM DEFAULT. O eixo em vigor já está escrito na tela acima;
 * o que este formulário faz é TROCAR para o outro, e nomear o outro é mais claro do que oferecer
 * uma lista onde a opção atual aparece pré-selecionada e um clique distraído a "republica".
 */
export function FormDoEixo({ eixoAtual }: { readonly eixoAtual: string }): React.ReactElement {
  const ctx = useContext(C);
  const [aberto, setAberto] = useState(false);
  const outro = eixoAtual === "POR_FONTE" ? "POR_TIPO_DE_CREDITO" : "POR_FONTE";
  const rotuloDoOutro = outro === "POR_FONTE" ? "por fonte do recurso (5.2.2.1.3)" : "por tipo de crédito (5.2.2.1.2)";

  if (ctx === null) {
    return <span className="text-xs text-[color:var(--color-status-erro-fg)]">Configuração indisponível nesta tela.</span>;
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mt-2 text-xs underline">
        Passar a registrar {rotuloDoOutro}
      </button>
    );
  }

  return (
    <form action={ctx.acaoDoEixo} data-acao="publicar-eixo" className="mt-2 grid gap-3 text-xs" aria-label="Alterar a forma de registro da dotação adicional">
      <ChaveDeComando />
      <input type="hidden" name="eixo" value={outro} />
      <label className="text-xs">
        <span className={ROTULO}>Fundamento da alteração</span>
        <input
          name="fundamento"
          required
          minLength={20}
          maxLength={500}
          placeholder="Orientação do tribunal ou plano de contas do ente"
          className={CAMPO}
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={ctx.pendenteDoEixo} className={CLASSE_BOTAO_PRIMARIO}>
          {ctx.pendenteDoEixo ? "Publicando…" : "Publicar a alteração"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs underline">Cancelar</button>
        <span className="text-xs text-[color:var(--color-ink-3)]">
          A alteração vale para os lançamentos seguintes; os já realizados não são alterados.
        </span>
      </div>
    </form>
  );
}

/** O roteiro de UMA origem do recurso — só é lido quando o eixo em vigor é POR FONTE. */
export function FormDaFonte({
  origem,
  debito,
  credito,
}: {
  readonly origem: string;
  readonly debito: string | null;
  readonly credito: string | null;
}): React.ReactElement {
  const ctx = useContext(C);
  const [aberto, setAberto] = useState(false);

  if (ctx === null) {
    return <span className="text-xs text-[color:var(--color-status-erro-fg)]">Configuração indisponível nesta tela.</span>;
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mt-1 text-xs underline">
        {debito === null ? "Configurar este roteiro" : "Trocar as contas"}
      </button>
    );
  }

  return (
    <form
      action={ctx.acaoDaFonte}
      data-acao="publicar-roteiro-por-fonte"
      className="mt-2 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"
      aria-label={`Publicar o roteiro por fonte de ${origem}`}
    >
      <ChaveDeComando />
      <input type="hidden" name="origem" value={origem} />
      <label className="text-xs sm:col-span-2">
        <span className={ROTULO}>Conta de débito</span>
        <select name="contaDebitoCodigo" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a conta…</option>
          {ctx.contas.map((c) => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>
          ))}
        </select>
      </label>
      <label className="text-xs sm:col-span-2">
        <span className={ROTULO}>Conta de crédito</span>
        <select name="contaCreditoCodigo" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a conta…</option>
          {ctx.contas.map((c) => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>
          ))}
        </select>
      </label>
      <label className="text-xs sm:col-span-4">
        <span className={ROTULO}>Fundamento</span>
        <input name="fundamento" required minLength={20} maxLength={500} className={CAMPO} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-4">
        <button type="submit" disabled={ctx.pendenteDaFonte} className={CLASSE_BOTAO_PRIMARIO}>
          {ctx.pendenteDaFonte ? "Publicando…" : "Publicar roteiro"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs underline">Cancelar</button>
        {credito !== null ? (
          <span className="text-xs text-[color:var(--color-ink-3)]">Contas atuais: {debito} / {credito}.</span>
        ) : null}
      </div>
    </form>
  );
}
