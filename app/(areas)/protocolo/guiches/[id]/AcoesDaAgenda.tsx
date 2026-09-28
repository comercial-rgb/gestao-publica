"use client";

import { createContext, useActionState, useContext, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  cancelarAction,
  confirmarAction,
  marcarAction,
  registrarAtendimentoAction,
  remarcarAction,
  type EstadoDoAto,
} from "../actions";

/**
 * OS ATOS DA AGENDA DE UM DIA (V11 V8).
 *
 * ⚠️ OS HORÁRIOS DO `select` SÃO OS QUE SOBRARAM, e vêm do servidor com as vagas já descontadas
 * pela MESMA contagem que a gravação usa. Um horário lotado não aparece — e, se aparecesse por
 * corrida, quem recusa é a transação, nomeando "2 de 2 lugares ocupados".
 *
 * ⚠️ SEM DEFAULT no serviço e no horário. A pessoa que está no balcão diz o que veio resolver; a
 * tela não escolhe por ela.
 *
 * ⚠️ A PESSOA ENTRA PELO DOCUMENTO. Um `select` com o cadastro de pessoas do município exporia
 * nome e documento de quem nunca pediu nada — e seria inútil com quinhentos itens.
 */

export interface HorarioLivre {
  readonly hora: string;
  readonly livres: number;
  readonly capacidade: number;
}

export function FormMarcar({
  guicheId,
  dia,
  servicos,
  horarios,
}: {
  readonly guicheId: string;
  readonly dia: string;
  readonly servicos: readonly { readonly id: string; readonly titulo: string }[];
  readonly horarios: readonly HorarioLivre[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(marcarAction, {});
  const [aberto, setAberto] = useState(false);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  const [seq, setSeq] = useState(0);

  if (estado.sucesso !== undefined && estado.sucesso !== ultimo) {
    setUltimo(estado.sucesso);
    setSeq((n) => n + 1);
    setAberto(false);
  }

  const comVaga = horarios.filter((h) => h.livres > 0);

  const confirmacao =
    estado.sucesso === undefined ? null : (
      <p
        role="status"
        data-resultado-da-acao="marcar-atendimento"
        data-resultado-seq={String(seq)}
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
      >
        {estado.sucesso}
      </p>
    );

  if (servicos.length === 0) {
    return (
      <div className={`${CLASSE_PAINEL_FORMULARIO} text-xs text-[color:var(--color-ink-2)]`}>
        <strong className="text-[color:var(--color-ink)]">Este guichê não possui serviços habilitados.</strong>{" "}
        Habilite os serviços na tela de organização do atendimento antes de agendar.
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Marcar um atendimento</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
              {comVaga.length === 0
                ? "Nenhum horário com vaga neste dia."
                : `${comVaga.length} horário(s) com vaga neste dia.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAberto(true)}
            disabled={comVaga.length === 0}
            className={CLASSE_BOTAO_PRIMARIO}
          >
            Marcar atendimento
          </button>
        </div>
        {confirmacao}
      </div>
    );
  }

  return (
    <form action={action} data-acao="marcar-atendimento" className={CLASSE_PAINEL_FORMULARIO} aria-label="Marcar um atendimento">
      <ChaveDeComando />
      <input type="hidden" name="guicheId" value={guicheId} />
      <input type="hidden" name="dia" value={dia} />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Marcar um atendimento</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Serviço</span>
          <select name="servicoId" required defaultValue="" className={CAMPO}>
            <option value="">Selecione o serviço…</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>{s.titulo}</option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className={ROTULO}>CPF ou CNPJ da pessoa atendida</span>
          <input name="documento" required maxLength={20} placeholder="000.000.000-00" className={CAMPO} />
        </label>

        <label className="text-xs">
          <span className={ROTULO}>Horário</span>
          <select name="horaInicio" required defaultValue="" className={CAMPO}>
            <option value="">Escolha o horário…</option>
            {comVaga.map((h) => (
              <option key={h.hora} value={h.hora}>
                {h.hora} — {h.livres} de {h.capacidade} livre(s)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Marcando…" : "Marcar atendimento"}
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

/** Um botão que envia um ato sem campo nenhum — confirmar a presença. */
export function BotaoConfirmar({ reservaId }: { readonly reservaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAto, FormData>(confirmarAction, {});
  return (
    <form action={action} data-acao="confirmar-presenca" className="inline">
      <ChaveDeComando />
      <input type="hidden" name="reservaId" value={reservaId} />
      <button type="submit" disabled={pendente} className="text-xs underline">
        {pendente ? "Confirmando…" : "Confirmar presença"}
      </button>
      {estado.erro !== undefined ? (
        <span role="alert" className="ml-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</span>
      ) : null}
      {estado.sucesso !== undefined ? (
        <span role="status" data-resultado-da-acao="confirmar-presenca" data-resultado-seq="1" className="ml-2 text-xs text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </span>
      ) : null}
    </form>
  );
}

/**
 * ═══ ⚠️ O ATO QUE SAI DA TELA, UM DEGRAU ACIMA ═══
 *
 * Os três atos sobre uma reserva — registrar, cancelar e remarcar — fazem a LINHA DELA
 * DESAPARECER: registrar muda a situação para ATENDIDA, cancelar para CANCELADA, e a tela deixa
 * de oferecer atos sobre as duas; remarcar move a reserva para outro horário, e a linha se
 * reconstrói noutro lugar da tabela.
 *
 * Uma confirmação guardada DENTRO da linha, portanto, nunca chega a ser lida: o estado do
 * componente morre junto com ele, e quem enviou lê SILÊNCIO — indistinguível de "não aconteceu".
 * Foi exatamente o que o percurso mediu (passos 3.3, 3.6 e 4.2 falhando enquanto os passos
 * seguintes provavam que o efeito TINHA acontecido).
 *
 * A cura é a mesma de sempre, aplicada no nível certo: o resultado mora ACIMA do que some. Este
 * provedor fica montado enquanto a agenda existir — é ele que guarda as ações e o aviso —, e
 * cada linha só empresta o formulário.
 */

interface AtosDaAgendaCtx {
  readonly aReg: (f: FormData) => void;
  readonly aCan: (f: FormData) => void;
  readonly aRem: (f: FormData) => void;
  readonly pReg: boolean;
  readonly pCan: boolean;
  readonly pRem: boolean;
  readonly erro: string | undefined;
  readonly houveSucesso: boolean;
}

const Ctx = createContext<AtosDaAgendaCtx | null>(null);

export function AtosDaAgenda({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const [eReg, aReg, pReg] = useActionState<EstadoDoAto, FormData>(registrarAtendimentoAction, {});
  const [eCan, aCan, pCan] = useActionState<EstadoDoAto, FormData>(cancelarAction, {});
  const [eRem, aRem, pRem] = useActionState<EstadoDoAto, FormData>(remarcarAction, {});
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);

  const sucesso = eReg.sucesso ?? eCan.sucesso ?? eRem.sucesso;
  if (sucesso !== undefined && sucesso !== ultimo) {
    setUltimo(sucesso);
    setSeq((n) => n + 1);
  }

  // Cada ato confirma com o PRÓPRIO nome: "algo deu certo" não diz o quê, nem para um leitor de
  // tela nem para o percurso.
  const avisos: readonly [string, string | undefined][] = [
    ["registrar-atendimento", eReg.sucesso],
    ["cancelar-marcacao", eCan.sucesso],
    ["remarcar-atendimento", eRem.sucesso],
  ];
  const erro = eReg.erro ?? eCan.erro ?? eRem.erro;

  return (
    <Ctx.Provider value={{ aReg, aCan, aRem, pReg, pCan, pRem, erro, houveSucesso: sucesso !== undefined }}>
      {avisos.map(([nome, msg]) =>
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
        <p role="alert" className="mb-3 rounded-[var(--radius-md)] px-3 py-2 text-sm whitespace-pre-line text-[color:var(--color-status-erro-fg)]">
          {erro}
        </p>
      ) : null}
      {children}
    </Ctx.Provider>
  );
}

/** Registrar, cancelar e remarcar — os campos que o domínio exige, no lugar onde a pessoa está. */
export function AtosDaReserva({
  reservaId,
  guicheId,
  dia,
}: {
  readonly reservaId: string;
  readonly guicheId: string;
  readonly dia: string;
}): React.ReactElement {
  const ctx = useContext(Ctx);
  const [qual, setQual] = useState<"nenhum" | "registrar" | "cancelar" | "remarcar">("nenhum");

  if (ctx === null) {
    // ⚠️ FAIL-CLOSED, E VISÍVEL. Sem o provedor, os atos até funcionariam — e a confirmação
    // sumiria de novo, que é o defeito que este desenho existe para impedir. Melhor não oferecer
    // o ato do que oferecê-lo mudo.
    return <span className="text-xs text-[color:var(--color-status-erro-fg)]">Atos indisponíveis nesta tela.</span>;
  }

  if (qual === "nenhum") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => setQual("registrar")} className="underline">Registrar atendimento</button>
        <button type="button" onClick={() => setQual("remarcar")} className="underline">Remarcar</button>
        <button type="button" onClick={() => setQual("cancelar")} className="underline">Cancelar</button>
      </div>
    );
  }

  const voltar = (
    <button type="button" onClick={() => setQual("nenhum")} className="text-xs underline">
      Voltar
    </button>
  );

  if (qual === "registrar") {
    return (
      <form action={ctx.aReg} data-acao="registrar-atendimento" className="mt-2 flex flex-wrap items-end gap-2 text-xs" aria-label="Registrar o atendimento">
        <ChaveDeComando />
        <input type="hidden" name="reservaId" value={reservaId} />
        <label className="text-xs">
          <span className={ROTULO}>Responsável pelo atendimento</span>
          <input name="atendidoPor" required maxLength={120} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Observação (opcional)</span>
          <input name="observacao" maxLength={1000} className={CAMPO} />
        </label>
        <button type="submit" disabled={ctx.pReg} className={CLASSE_BOTAO_PRIMARIO}>{ctx.pReg ? "Gravando…" : "Registrar"}</button>
        {voltar}
      </form>
    );
  }

  if (qual === "cancelar") {
    return (
      <form action={ctx.aCan} data-acao="cancelar-marcacao" className="mt-2 flex flex-wrap items-end gap-2 text-xs" aria-label="Cancelar a marcação">
        <ChaveDeComando />
        <input type="hidden" name="reservaId" value={reservaId} />
        <label className="text-xs">
          <span className={ROTULO}>Motivo do cancelamento</span>
          <input name="motivo" required maxLength={240} className={CAMPO} />
        </label>
        <button type="submit" disabled={ctx.pCan} className={CLASSE_BOTAO_PRIMARIO}>{ctx.pCan ? "Cancelando…" : "Cancelar a marcação"}</button>
        {voltar}
      </form>
    );
  }

  return (
    <form action={ctx.aRem} data-acao="remarcar-atendimento" className="mt-2 flex flex-wrap items-end gap-2 text-xs" aria-label="Remarcar o atendimento">
      <ChaveDeComando />
      <input type="hidden" name="reservaId" value={reservaId} />
      {/* O guichê de destino começa sendo este; a agenda de outro guichê remarca para a dela. */}
      <input type="hidden" name="guicheId" value={guicheId} />
      <label className="text-xs">
        <span className={ROTULO}>Novo dia</span>
        <input name="dia" type="date" required defaultValue={dia} className={CAMPO} />
      </label>
      <label className="text-xs">
        <span className={ROTULO}>Novo horário</span>
        <input name="horaInicio" type="time" required className={CAMPO} />
      </label>
      <label className="text-xs">
        <span className={ROTULO}>Motivo</span>
        <input name="motivo" required maxLength={240} className={CAMPO} />
      </label>
      <button type="submit" disabled={ctx.pRem} className={CLASSE_BOTAO_PRIMARIO}>{ctx.pRem ? "Remarcando…" : "Remarcar"}</button>
      {voltar}
    </form>
  );
}
