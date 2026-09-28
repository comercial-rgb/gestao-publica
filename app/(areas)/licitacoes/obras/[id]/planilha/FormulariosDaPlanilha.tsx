"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { ChaveDeComando } from "../../../../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../../../components/ui/Formulario";
import { useResultadoDoAto } from "../../../../../../components/ui/ResultadosDosAtos";
import { useRestaurarAposEnvio } from "../../../../../../components/ui/useRestaurarAposEnvio";
import { planilhaAction, type EstadoDaPlanilha } from "../../planilha-actions";

/**
 * AS ILHAS DA PLANILHA ORÇAMENTÁRIA (V7 M2 U6). Uma action com `__acao`; recusa devolve o formulário como estava.
 * O arquivo acima do limite é recusado aqui antes do envio (o servidor confere de novo) — o limite de 1 MB do corpo das
 * ações do Next vale para todos os envios de arquivo do sistema.
 */

const LIMITE_DO_ENVIO_BYTES = 1024 * 1024;

function useAto(acao: string, obraId: string) {
  const publicar = useResultadoDoAto(acao);
  let guardar: (d: FormData) => void = () => undefined;
  // O resultado vai também ao provedor da página: confirmar a prévia, vincular e revogar mudam a página, e o formulário
  // que os disparou pode não voltar na recarga (a prévia confirmada não oferece mais a confirmação).
  const [estado, disparar, pendente] = useActionState<EstadoDaPlanilha, FormData>(async (anterior, dados) => {
    guardar(dados);
    const r = await planilhaAction(anterior, dados);
    if (r.erro !== undefined) publicar("erro", r.erro);
    else if (r.sucesso !== undefined) publicar("ok", r.sucesso, r.previaId === undefined ? undefined : { href: `/licitacoes/obras/${obraId}/planilha/previas/${r.previaId}`, rotulo: "Abrir a prévia" });
    return r;
  }, {});
  const r = useRestaurarAposEnvio(estado, (e) => e.erro !== undefined);
  guardar = r.guardar;
  return { estado, disparar, pendente, ref: r.ref, id: useId() };
}

function Mensagens({ estado, acao, obraId }: { readonly estado: EstadoDaPlanilha; readonly acao: string; readonly obraId: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao={acao} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
          {estado.previaId !== undefined ? <> <Link href={`/licitacoes/obras/${obraId}/planilha/previas/${estado.previaId}`} className="font-semibold underline underline-offset-2" data-link-da-previa>Abrir a prévia</Link></> : null}
        </p>
      ) : null}
    </>
  );
}

function Campo({ id, nome, rotulo, tipo = "text", obrigatorio = true, ...resto }: { readonly id: string; readonly nome: string; readonly rotulo: string; readonly tipo?: string; readonly obrigatorio?: boolean } & React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)]">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <input id={`${id}-${nome}`} name={nome} type={tipo} required={obrigatorio} className={CLASSE_CAMPO} {...resto} />
    </label>
  );
}

function Texto({ id, nome, rotulo }: { readonly id: string; readonly nome: string; readonly rotulo: string }): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <textarea id={`${id}-${nome}`} name={nome} required minLength={10} rows={2} className={CLASSE_AREA_TEXTO} />
    </label>
  );
}

const Ocultos = ({ obraId, acao, extra = {} }: { readonly obraId: string; readonly acao: string; readonly extra?: Readonly<Record<string, string>> }): React.ReactElement => (
  <>
    <input type="hidden" name="__id" value={obraId} />
    <input type="hidden" name="__acao" value={acao} />
    {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
  </>
);

export function FormImportarPlanilha({ obraId }: { readonly obraId: string }): React.ReactElement {
  const a = useAto("previa-da-planilha", obraId);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <form ref={a.ref} action={a.disparar} data-acao="previa-da-planilha" className={CLASSE_PAINEL_FORMULARIO}
      onSubmit={(ev) => {
        const f = (ev.currentTarget.elements.namedItem("arquivo") as HTMLInputElement | null)?.files?.[0];
        if (f !== undefined && f.size > LIMITE_DO_ENVIO_BYTES) { ev.preventDefault(); setAviso(`O arquivo tem ${(f.size / 1048576).toFixed(1)} MB; o envio aceita até 1 MB. Salve só a aba do orçamento, sem imagens, e envie de novo.`); }
        else setAviso(null);
      }}>
      <ChaveDeComando />
      <Ocultos obraId={obraId} acao="previa" />
      <h2 className="mb-1 text-sm font-semibold">Importar planilha orçamentária</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Arquivo .xlsx ou .xls. A importação gera uma prévia, que só se torna versão após a confirmação. Fórmulas e macros não são executadas; valem os valores gravados no arquivo.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={a.id} nome="arquivo" rotulo="Arquivo da planilha" tipo="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" />
        <Campo id={a.id} nome="aba" rotulo="Aba (opcional; sem ela, a primeira com cabeçalho reconhecido)" obrigatorio={false} />
      </div>
      <details className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <summary className="cursor-pointer text-xs font-semibold">Informar o cabeçalho (quando o arquivo usa outros nomes de coluna)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <Campo id={a.id} nome="linhaDoCabecalho" rotulo="Linha do cabeçalho" obrigatorio={false} inputMode="numeric" />
          {([["codigo", "Coluna do item"], ["referencia", "Coluna da referência"], ["descricao", "Coluna da descrição"], ["unidade", "Coluna da unidade"], ["quantidade", "Coluna da quantidade"], ["precoUnitario", "Coluna do preço unitário"], ["total", "Coluna do total"]] as const).map(([k, r]) => (
            <Campo key={k} id={a.id} nome={`coluna.${k}`} rotulo={`${r} (letra)`} obrigatorio={false} maxLength={3} />
          ))}
        </div>
      </details>
      {aviso !== null ? <p role="alert" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{aviso}</p> : null}
      <Mensagens estado={a.estado} acao="previa-da-planilha" obraId={obraId} />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Lendo o arquivo…" : "Gerar prévia"}</button>
    </form>
  );
}

export function FormConfirmarPrevia({ obraId, previaId, divergencias, hoje }: { readonly obraId: string; readonly previaId: string; readonly divergencias: number; readonly hoje: string }): React.ReactElement {
  const a = useAto("confirmar-planilha", obraId);
  return (
    <form ref={a.ref} action={a.disparar} data-acao="confirmar-planilha" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <Ocultos obraId={obraId} acao="confirmar" extra={{ previaId }} />
      <h2 className="mb-1 text-sm font-semibold">Confirmar como nova versão</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Informe a data-base e a referência de preços do orçamento.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={a.id} nome="descricao" rotulo="Descrição da versão" minLength={5} />
        <Campo id={a.id} nome="numeroDoContrato" rotulo="Número do contrato de execução (opcional)" obrigatorio={false} />
        <Campo id={a.id} nome="dataBaseDosPrecos" rotulo="Data-base dos preços" tipo="date" />
        <Campo id={a.id} nome="referenciaDePrecos" rotulo="Referência de preços (tabela, mês, regime)" />
        <Campo id={a.id} nome="vigenciaInicio" rotulo="Vale para medir a partir de" tipo="date" defaultValue={hoje} />
        <Texto id={a.id} nome="motivo" rotulo="Motivo (projeto aprovado, revisão, aditivo)" />
      </div>
      {divergencias > 0 ? (
        <label className="mt-3 flex items-start gap-2 text-sm" htmlFor={`${a.id}-ciente`}>
          <input id={`${a.id}-ciente`} type="checkbox" name="ciente" value="sim" className="mt-1" />
          <span>Estou ciente das {divergencias} divergência(s) de conciliação listadas acima e confirmo os valores calculados.</span>
        </label>
      ) : null}
      <Mensagens estado={a.estado} acao="confirmar-planilha" obraId={obraId} />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Confirmando…" : "Confirmar versão"}</button>
    </form>
  );
}

export function FormVincular({ obraId, itemDaPlanilhaId, codigo, itensDoContrato }: { readonly obraId: string; readonly itemDaPlanilhaId: string; readonly codigo: string; readonly itensDoContrato: readonly { readonly id: string; readonly numero: number; readonly descricao: string; readonly unidade: string }[] }): React.ReactElement {
  const a = useAto("vincular-item-da-planilha", obraId);
  return (
    <form ref={a.ref} action={a.disparar} data-acao="vincular-item-da-planilha" data-servico={codigo} className="mt-2 grid gap-2 sm:grid-cols-3">
      <ChaveDeComando />
      <Ocultos obraId={obraId} acao="vincular" extra={{ itemDaPlanilhaId }} />
      <label htmlFor={`${a.id}-item`} className="text-xs text-[color:var(--color-ink-2)]">
        <span className={CLASSE_ROTULO}>Item do contrato para o serviço {codigo}</span>
        <select id={`${a.id}-item`} name="itemDoContratoId" required defaultValue="" className={CLASSE_CAMPO}>
          <option value="" disabled>Escolha…</option>
          {itensDoContrato.map((i) => <option key={i.id} value={i.id}>{i.numero} — {i.descricao} ({i.unidade})</option>)}
        </select>
      </label>
      <Campo id={a.id} nome="motivo" rotulo="Motivo do vínculo" minLength={10} />
      <div className="flex items-end"><button type="submit" disabled={a.pendente} className={CLASSE_BOTAO_PRIMARIO}>{a.pendente ? "Gravando…" : "Vincular"}</button></div>
      <div className="sm:col-span-3"><Mensagens estado={a.estado} acao="vincular-item-da-planilha" obraId={obraId} /></div>
    </form>
  );
}

export function FormRevogarVinculo({ obraId, vinculoId }: { readonly obraId: string; readonly vinculoId: string }): React.ReactElement {
  const a = useAto("revogar-vinculo-da-planilha", obraId);
  return (
    <form ref={a.ref} action={a.disparar} data-acao="revogar-vinculo-da-planilha" className="mt-1 flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <Ocultos obraId={obraId} acao="revogarVinculo" extra={{ vinculoId }} />
      <Campo id={a.id} nome="motivo" rotulo="Motivo da revogação" minLength={10} />
      <button type="submit" disabled={a.pendente} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-sm">{a.pendente ? "Gravando…" : "Revogar vínculo"}</button>
      <div className="w-full"><Mensagens estado={a.estado} acao="revogar-vinculo-da-planilha" obraId={obraId} /></div>
    </form>
  );
}
