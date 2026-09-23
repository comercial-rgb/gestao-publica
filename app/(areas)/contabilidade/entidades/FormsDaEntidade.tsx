"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { cadastrarEntidadeAction, publicarVersaoAction, type EstadoDaEntidade } from "./actions";

/**
 * OS FORMULÁRIOS DA ENTIDADE CONTÁBIL (V11 V9).
 *
 * ⚠️ O ATO É CINCO CAMPOS, E ISSO É O DESENHO. Um `textarea` chamado "fundamento" recebe
 * "Lei 1.234/2005" e passa em qualquer piso de comprimento — e depois ninguém acha o dispositivo.
 * Separado, a pessoa vê o que ainda falta enquanto digita, e o servidor pode conferir COERÊNCIA
 * em vez de tamanho.
 *
 * ⚠️ RÓTULO EM TODO CAMPO. Campo sem rótulo é caixa muda para leitor de tela.
 *
 * ⚠️ SEM DEFAULT NO TIPO E NO ATO. Um `defaultValue` no tipo faria toda entidade nascer
 * "Prefeitura" para quem passou batido pelo campo — e é justamente a distinção entre prefeitura,
 * autarquia e fundo que dá sentido a este cadastro.
 */

export interface OpcaoSimples {
  readonly codigo: string;
  readonly rotulo: string;
}

function CamposDoAto({ tipos }: { readonly tipos: readonly OpcaoSimples[] }): React.ReactElement {
  return (
    <>
      <p className="sm:col-span-2 text-xs text-[color:var(--color-ink-2)]">
        O <strong>ato do ente</strong> que cria ou autoriza esta entidade. O sistema confere se o
        ano não é futuro, se o dispositivo é mesmo um dispositivo e se o trecho citado{" "}
        <strong>fala desta entidade</strong> — pelo nome ou pelo CNPJ. Não é um campo de texto
        livre com tamanho mínimo: é a prova de que o ato citado é sobre isto.
      </p>
      <label className="text-xs">
        <span className={ROTULO}>Tipo do ato</span>
        <select name="atoTipo" required defaultValue="" className={CAMPO}>
          <option value="">Escolha…</option>
          {tipos.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className={ROTULO}>Número do ato</span>
        <input name="atoNumero" required className={CAMPO} placeholder="1.234" />
      </label>
      <label className="text-xs">
        <span className={ROTULO}>Ano do ato</span>
        <input name="atoAno" required inputMode="numeric" className={CAMPO} placeholder="2005" />
      </label>
      <label className="text-xs">
        <span className={ROTULO}>Dispositivo</span>
        <input name="atoDispositivo" required className={CAMPO} placeholder="art. 2º" />
      </label>
      <label className="text-xs sm:col-span-2">
        <span className={ROTULO}>Trecho citado do ato</span>
        <textarea name="atoCitacao" required rows={3} className={CAMPO} />
      </label>
    </>
  );
}

function Resultado({
  estado,
  papel,
  seq,
}: {
  readonly estado: EstadoDaEntidade;
  readonly papel: string;
  readonly seq: number;
}): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p
        role="alert"
        data-resultado-da-acao={papel}
        data-resultado-seq={String(seq)}
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
      >
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p
        role="status"
        data-resultado-da-acao={papel}
        data-resultado-seq={String(seq)}
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
      >
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

export function FormCadastrarEntidade({
  tiposDeEntidade,
  tiposDeAto,
}: {
  readonly tiposDeEntidade: readonly OpcaoSimples[];
  readonly tiposDeAto: readonly OpcaoSimples[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaEntidade, FormData>(
    cadastrarEntidadeAction,
    {}
  );
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  const marca = estado.sucesso ?? estado.erro;
  if (marca !== undefined && marca !== ultimo) {
    setUltimo(marca);
    setSeq((n) => n + 1);
  }

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-papel="form-cadastrar-entidade">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold">Cadastrar entidade contábil</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className={ROTULO}>Código</span>
          <input name="codigo" required maxLength={4} className={CAMPO} placeholder="02" />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Nome</span>
          <input name="nome" required className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>CNPJ próprio (deixe em branco se não tiver)</span>
          <input name="cnpj" className={CAMPO} inputMode="numeric" placeholder="somente dígitos" />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Tipo da entidade</span>
          <select name="tipoManad" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {tiposDeEntidade.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} — {t.rotulo}
              </option>
            ))}
          </select>
        </label>
        <CamposDoAto tipos={tiposDeAto} />
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>
        {pendente ? "Cadastrando…" : "Cadastrar entidade"}
      </button>
      <Resultado estado={estado} papel="cadastrar-entidade" seq={seq} />
    </form>
  );
}

export function FormPublicarVersao({
  entidadeId,
  nome,
  cnpj,
  tipoManad,
  tiposDeEntidade,
  tiposDeAto,
}: {
  readonly entidadeId: string;
  readonly nome: string;
  readonly cnpj: string | null;
  readonly tipoManad: string;
  readonly tiposDeEntidade: readonly OpcaoSimples[];
  readonly tiposDeAto: readonly OpcaoSimples[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaEntidade, FormData>(
    publicarVersaoAction,
    {}
  );
  const [aberto, setAberto] = useState(false);
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  const marca = estado.sucesso ?? estado.erro;
  if (marca !== undefined && marca !== ultimo) {
    setUltimo(marca);
    setSeq((n) => n + 1);
  }

  if (!aberto) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-xs underline"
          data-papel={`corrigir-${entidadeId}`}
        >
          Corrigir dados desta entidade
        </button>
        <Resultado estado={estado} papel="publicar-versao-entidade" seq={seq} />
      </div>
    );
  }

  return (
    <form action={action} className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
      <ChaveDeComando />
      <input type="hidden" name="entidadeId" value={entidadeId} />
      {/*
        ⚠️ A CORREÇÃO PUBLICA UMA VERSÃO NOVA — ela NÃO apaga a anterior, e NÃO move nenhuma guia
        já carimbada. Quem lê esta tela precisa saber disso antes de clicar, senão vai supor que
        está "consertando" a história.
      */}
      <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">
        Isto publica uma <strong>versão nova</strong>. A anterior continua no histórico, e as guias
        já arrecadadas <strong>não mudam de entidade</strong> — elas apontam para a identidade, não
        para o nome.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className={ROTULO}>Nome</span>
          <input name="nome" required defaultValue={nome} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>CNPJ próprio (deixe em branco se não tiver)</span>
          <input name="cnpj" defaultValue={cnpj ?? ""} className={CAMPO} inputMode="numeric" />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Tipo da entidade</span>
          <select name="tipoManad" required defaultValue={tipoManad} className={CAMPO}>
            {tiposDeEntidade.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} — {t.rotulo}
              </option>
            ))}
          </select>
        </label>
        <CamposDoAto tipos={tiposDeAto} />
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>
        {pendente ? "Publicando…" : "Publicar versão"}
      </button>
      <Resultado estado={estado} papel="publicar-versao-entidade" seq={seq} />
    </form>
  );
}
