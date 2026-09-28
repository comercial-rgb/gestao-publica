"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  configurarCertidaoAction,
  decidirCertidaoAction,
  solicitarCertidaoAction,
  type EstadoDaCertidao,
} from "./actions";

function Resultado({ estado }: { readonly estado: EstadoDaCertidao }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

export function FormPedido(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaCertidao, FormData>(solicitarCertidaoAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao="solicitar-certidao">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Pedir uma certidão</h2>
      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        O pedido consulta as bases fiscais disponíveis e registra o resultado de cada uma. A emissão
        depende da análise do responsável.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs">
          <span className={ROTULO}>CPF ou CNPJ do titular (sem máscara)</span>
          <input name="documento" required pattern="\d{11}|\d{14}" maxLength={14} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Imóvel (opcional; em branco, a certidão refere-se à pessoa)</span>
          <input name="imovelId" maxLength={40} className={CAMPO} />
        </label>
      </div>
      <Resultado estado={estado} />
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-4`}>
        {pendente ? "Registrando…" : "Registrar o pedido"}
      </button>
    </form>
  );
}

/**
 * A DECISÃO — ilha client por solicitação.
 *
 * ⚠️ O CAMPO DE DECLARAÇÃO APARECE SEMPRE que alguma base ficou sem resposta, e o texto diz
 * por quê. Ele não é burocracia: é o que o servidor exige para emitir uma NEGATIVA sobre base
 * que o sistema não leu — e vai congelado no documento, com o nome de quem assinou.
 */
export function FormDecisao({
  solicitacaoId,
  protocolo,
  temBaseSemResposta,
}: {
  readonly solicitacaoId: string;
  readonly protocolo: string;
  readonly temBaseSemResposta: boolean;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaCertidao, FormData>(decidirCertidaoAction, {});
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-4" data-acao="decidir-certidao" data-protocolo={protocolo}>
      <ChaveDeComando />
      <input type="hidden" name="__solicitacao" value={solicitacaoId} />
      <label className="text-xs">
        <span className={ROTULO}>Decisão</span>
        <select name="decisao" defaultValue="EMITIR" className={CAMPO}>
          <option value="EMITIR">Emitir</option>
          <option value="INDEFERIR">Indeferir</option>
        </select>
      </label>
      <label className="text-xs">
        <span className={ROTULO}>Tipo (ao emitir)</span>
        <select name="tipo" defaultValue="NEGATIVA" className={CAMPO}>
          <option value="NEGATIVA">Negativa</option>
          <option value="POSITIVA">Positiva</option>
          <option value="POSITIVA_COM_EFEITO_DE_NEGATIVA">Positiva com efeito de negativa</option>
        </select>
      </label>
      <label className="text-xs sm:col-span-2">
        <span className={ROTULO}>Fundamento do indeferimento (ao indeferir)</span>
        <input name="motivo" minLength={10} maxLength={500} className={CAMPO} />
      </label>
      {temBaseSemResposta ? (
        <label className="text-xs sm:col-span-4">
          <span className={ROTULO}>
            Conferência realizada em outras bases (obrigatória para emitir certidão negativa)
          </span>
          <textarea name="declaracaoDeConferencia" minLength={20} maxLength={2000} rows={3} className={CAMPO} />
          <span className="mt-1 block text-[color:var(--color-ink-3)]">
            Este texto é impresso no documento emitido, com a identificação do responsável. Sem ele, a
            certidão negativa não é emitida.
          </span>
        </label>
      ) : null}
      <div className="sm:col-span-4">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Decidindo…" : `Decidir o protocolo ${protocolo}`}
        </button>
        <Resultado estado={estado} />
      </div>
    </form>
  );
}

export function FormConfiguracao({
  hoje,
  atual,
}: {
  readonly hoje: string;
  readonly atual: { readonly validadeEmDias: number; readonly fundamento: string; readonly observacao: string | null } | null;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaCertidao, FormData>(configurarCertidaoAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao="configurar-certidao">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Validade e fundamento</h2>
      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        A emissão de certidões depende desta configuração, definida pelo município. Os pedidos e a
        análise funcionam sem ela.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Vigência a partir de</span>
          <input name="vigenciaInicio" type="date" required defaultValue={hoje} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Validade em dias corridos</span>
          <input
            name="validadeEmDias"
            type="number"
            required
            min={1}
            max={3650}
            defaultValue={atual?.validadeEmDias ?? ""}
            className={CAMPO}
          />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Fundamento legal</span>
          <input name="fundamento" required minLength={5} maxLength={300} defaultValue={atual?.fundamento ?? ""} className={CAMPO} />
        </label>
        <label className="text-xs sm:col-span-3">
          <span className={ROTULO}>Observação impressa na certidão (opcional)</span>
          <input name="observacao" maxLength={2000} defaultValue={atual?.observacao ?? ""} className={CAMPO} />
        </label>
      </div>
      <Resultado estado={estado} />
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-4`}>
        {pendente ? "Publicando…" : "Publicar a configuração"}
      </button>
    </form>
  );
}
