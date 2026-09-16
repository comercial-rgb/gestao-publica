"use client";

import { useActionState, useId, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../components/ui/Formulario";
import { useResultadoDoAto } from "../../../../components/ui/ResultadosDosAtos";
import { useRestaurarAposEnvio } from "../../../../components/ui/useRestaurarAposEnvio";
import { imovelAction, type EstadoDoImovel } from "./imovel-actions";

/**
 * AS ILHAS DO CADASTRO IMOBILIÁRIO E DOS PARÂMETROS (V7 B1). O cadastro é histórico: o formulário de versão nova pede
 * a data em que ela passa a valer e o motivo. A tabela do tributo pede a FÓRMULA do ente, o fundamento e os valores —
 * nenhum deles nasce no código.
 */

const USOS = [["RESIDENCIAL", "Residencial"], ["COMERCIAL", "Comercial"], ["INDUSTRIAL", "Industrial"], ["TERRITORIAL", "Territorial (sem construção)"], ["MISTO", "Misto"], ["OUTRO", "Outro"]] as const;
const PAPEIS = [["PROPRIETARIO", "Proprietário"], ["COMPROMISSARIO", "Compromissário comprador"], ["POSSUIDOR", "Possuidor"], ["RESPONSAVEL_TRIBUTARIO", "Responsável tributário"]] as const;
const TRIBUTOS = [["IPTU", "IPTU"], ["ITBI", "ITBI"], ["ISS", "ISS"], ["TAXA", "Taxa"]] as const;

function useAto(acao: string) {
  const publicar = useResultadoDoAto(acao);
  let guardar: (d: FormData) => void = () => undefined;
  const [estado, disparar, pendente] = useActionState<EstadoDoImovel, FormData>(async (anterior, dados) => {
    guardar(dados);
    const r = await imovelAction(anterior, dados);
    if (r.erro !== undefined) publicar("erro", r.erro);
    else if (r.sucesso !== undefined) publicar("ok", r.sucesso);
    return r;
  }, {});
  const restauracao = useRestaurarAposEnvio(estado, (e) => e.erro !== undefined);
  guardar = restauracao.guardar;
  return { estado, disparar, pendente, ref: restauracao.ref, id: useId() };
}

function Mensagens({ estado, acao }: { readonly estado: EstadoDoImovel; readonly acao: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={acao} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
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

function Selecao({ id, nome, rotulo, opcoes, padrao }: { readonly id: string; readonly nome: string; readonly rotulo: string; readonly opcoes: readonly (readonly [string, string])[]; readonly padrao?: string | undefined }): React.ReactElement {
  return (
    <label htmlFor={`${id}-${nome}`} className="text-xs text-[color:var(--color-ink-2)]">
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <select id={`${id}-${nome}`} name={nome} required defaultValue={padrao ?? opcoes[0]?.[0]} className={CLASSE_CAMPO}>
        {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
  );
}

function CamposDaVersao({ id, valores }: { readonly id: string; readonly valores?: { readonly logradouro: string; readonly numero: string; readonly bairro: string; readonly zona: string | null; readonly uso: string; readonly padraoConstrutivo: string | null; readonly areaDoTerreno: string; readonly areaConstruida: string; readonly fracaoIdeal: string | null } | undefined }): React.ReactElement {
  const [linhas, setLinhas] = useState(2);
  return (
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Campo id={id} nome="logradouro" rotulo="Logradouro" defaultValue={valores?.logradouro ?? ""} />
        <Campo id={id} nome="numero" rotulo="Número" defaultValue={valores?.numero ?? ""} />
        <Campo id={id} nome="bairro" rotulo="Bairro" defaultValue={valores?.bairro ?? ""} />
        <Campo id={id} nome="zona" rotulo="Zona ou setor (opcional)" obrigatorio={false} defaultValue={valores?.zona ?? ""} />
        <Selecao id={id} nome="uso" rotulo="Uso" opcoes={USOS} padrao={valores?.uso} />
        <Campo id={id} nome="padraoConstrutivo" rotulo="Padrão construtivo (opcional)" obrigatorio={false} defaultValue={valores?.padraoConstrutivo ?? ""} />
        <Campo id={id} nome="areaDoTerreno" rotulo="Área do terreno (m²)" inputMode="decimal" defaultValue={valores?.areaDoTerreno ?? ""} />
        <Campo id={id} nome="areaConstruida" rotulo="Área construída (m²)" inputMode="decimal" defaultValue={valores?.areaConstruida ?? ""} />
        <Campo id={id} nome="fracaoIdeal" rotulo="Fração ideal (opcional; 1 = 100%)" obrigatorio={false} inputMode="decimal" defaultValue={valores?.fracaoIdeal ?? ""} />
      </div>
      <fieldset className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold">Atributos do imóvel (o que a fórmula do ente pode usar pelo nome)</legend>
        <div className="space-y-2">
          {Array.from({ length: linhas }, (_, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-3" data-atributo={i + 1}>
              <Campo id={id} nome={`atributo.${i}.chave`} rotulo="Nome (ex.: testada, pavimentos)" obrigatorio={false} maxLength={40} />
              <Campo id={id} nome={`atributo.${i}.valor`} rotulo="Valor" obrigatorio={false} inputMode="decimal" />
              <Campo id={id} nome={`atributo.${i}.descricao`} rotulo="Descrição (opcional)" obrigatorio={false} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLinhas((n) => Math.min(n + 1, 20))} className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-xs">Acrescentar atributo</button>
      </fieldset>
    </>
  );
}

export function FormCadastrarImovel({ hoje }: { readonly hoje: string }): React.ReactElement {
  const a = useAto("cadastrar-imovel");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="cadastrar-imovel" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__acao" value="cadastrar" />
      <h2 className="mb-1 text-sm font-semibold">Cadastrar imóvel</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">O imóvel nasce com a versão 1 do cadastro. O que mudar depois entra como versão nova, com a data em que passa a valer — nada é reescrito.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id={a.id} nome="inscricao" rotulo="Inscrição imobiliária" maxLength={40} />
        <Campo id={a.id} nome="vigenciaInicio" rotulo="Vale a partir de" tipo="date" defaultValue={hoje} />
        <Campo id={a.id} nome="motivo" rotulo="Motivo" minLength={5} />
      </div>
      <CamposDaVersao id={a.id} />
      <Mensagens estado={a.estado} acao="cadastrar-imovel" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Cadastrar imóvel"}</button>
    </form>
  );
}

export function FormNovaVersao({ imovelId, atual, hoje }: { readonly imovelId: string; readonly atual: React.ComponentProps<typeof CamposDaVersao>["valores"]; readonly hoje: string }): React.ReactElement {
  const a = useAto("nova-versao-do-imovel");
  return (
    <details className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
      <summary className="cursor-pointer text-xs font-semibold">Registrar nova versão do cadastro</summary>
      <form ref={a.ref} action={a.disparar} data-acao="nova-versao-do-imovel" className="mt-2">
        <ChaveDeComando />
        <input type="hidden" name="__acao" value="novaVersao" />
        <input type="hidden" name="imovelId" value={imovelId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id={a.id} nome="vigenciaInicio" rotulo="Vale a partir de" tipo="date" defaultValue={hoje} />
          <Campo id={a.id} nome="motivo" rotulo="Motivo (averbação, revisão, levantamento)" minLength={5} />
        </div>
        <CamposDaVersao id={a.id} valores={atual} />
        <Mensagens estado={a.estado} acao="nova-versao-do-imovel" />
        <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Registrar versão"}</button>
      </form>
    </details>
  );
}

export function FormVincularPessoa({ imovelId, hoje }: { readonly imovelId: string; readonly hoje: string }): React.ReactElement {
  const a = useAto("vincular-pessoa-ao-imovel");
  return (
    <form ref={a.ref} action={a.disparar} data-acao="vincular-pessoa-ao-imovel" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__acao" value="vincular" />
      <input type="hidden" name="imovelId" value={imovelId} />
      <h3 className="mb-1 text-sm font-semibold">Vincular pessoa ao imóvel</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">A pessoa é a do cadastro de pessoas (pelo documento). As frações vigentes do mesmo papel não passam de 100%.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo id={a.id} nome="pessoaDocumento" rotulo="CPF ou CNPJ" inputMode="numeric" />
        <Selecao id={a.id} nome="papel" rotulo="Papel" opcoes={PAPEIS} />
        <Campo id={a.id} nome="fracao" rotulo="Fração (1 = 100%)" inputMode="decimal" defaultValue="1" />
        <Campo id={a.id} nome="vigenciaInicio" rotulo="Desde" tipo="date" defaultValue={hoje} />
      </div>
      <label htmlFor={`${a.id}-motivo`} className="mt-3 block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Motivo (escritura, posse, acordo)</span>
        <textarea id={`${a.id}-motivo`} name="motivo" required minLength={5} rows={2} className={CLASSE_AREA_TEXTO} />
      </label>
      <Mensagens estado={a.estado} acao="vincular-pessoa-ao-imovel" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Gravando…" : "Vincular"}</button>
    </form>
  );
}

export function FormEncerrarVinculo({ vinculoId, rotulo, hoje }: { readonly vinculoId: string; readonly rotulo: string; readonly hoje: string }): React.ReactElement {
  const acao = `encerrar-vinculo-${vinculoId}`;
  const a = useAto(acao);
  return (
    <details className="mt-1 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
      <summary className="cursor-pointer text-xs font-semibold">Encerrar o vínculo de {rotulo}</summary>
      <form ref={a.ref} action={a.disparar} data-acao={acao} className="mt-2 grid gap-2 sm:grid-cols-3">
        <ChaveDeComando />
        <input type="hidden" name="__acao" value="encerrarVinculo" />
        <input type="hidden" name="vinculoId" value={vinculoId} />
        <Campo id={a.id} nome="dataEfeito" rotulo="Data de efeito" tipo="date" defaultValue={hoje} />
        <Campo id={a.id} nome="motivo" rotulo="Motivo" minLength={5} />
        <div className="flex items-end"><button type="submit" disabled={a.pendente} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-sm">{a.pendente ? "Gravando…" : "Encerrar"}</button></div>
        <div className="sm:col-span-3"><Mensagens estado={a.estado} acao={acao} /></div>
      </form>
    </details>
  );
}

export function FormPublicarTabela({ hoje, exercicio, variaveisDoCadastro }: { readonly hoje: string; readonly exercicio: number; readonly variaveisDoCadastro: readonly string[] }): React.ReactElement {
  const a = useAto("publicar-tabela-tributaria");
  const [linhas, setLinhas] = useState(4);
  return (
    <form ref={a.ref} action={a.disparar} data-acao="publicar-tabela-tributaria" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__acao" value="publicarTabela" />
      <h2 className="mb-1 text-sm font-semibold">Publicar tabela de parâmetros</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        A fórmula e os valores são do município, com o fundamento legal declarado. Do cadastro do imóvel vêm: {variaveisDoCadastro.join(", ")} — e os atributos que cada imóvel declarar.
        Operadores: + − * / ( ), comparações e as funções min, max, arredondar(x, casas), teto, piso e se(condição, então, senão).
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Selecao id={a.id} nome="tributo" rotulo="Tributo" opcoes={TRIBUTOS} />
        <Campo id={a.id} nome="exercicio" rotulo="Exercício" inputMode="numeric" defaultValue={String(exercicio)} />
        <Campo id={a.id} nome="vigenciaInicio" rotulo="Vale a partir de" tipo="date" defaultValue={hoje} />
        <Campo id={a.id} nome="fundamento" rotulo="Fundamento (lei, decreto, artigo)" minLength={5} />
      </div>
      <label htmlFor={`${a.id}-formula`} className="mt-3 block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Fórmula</span>
        <textarea id={`${a.id}-formula`} name="formula" required rows={3} className={CLASSE_AREA_TEXTO} placeholder="arredondar(areaConstruida * valorDoM2 * aliquota, 2)" />
      </label>
      <label htmlFor={`${a.id}-motivo`} className="mt-3 block text-xs text-[color:var(--color-ink-2)]"><span className={CLASSE_ROTULO}>Motivo da versão</span>
        <textarea id={`${a.id}-motivo`} name="motivo" required minLength={5} rows={2} className={CLASSE_AREA_TEXTO} />
      </label>
      <fieldset className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold">Parâmetros (o nome é o que a fórmula chama)</legend>
        <div className="space-y-2">
          {Array.from({ length: linhas }, (_, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-3" data-parametro={i + 1}>
              <Campo id={a.id} nome={`parametro.${i}.chave`} rotulo="Nome" obrigatorio={false} maxLength={40} />
              <Campo id={a.id} nome={`parametro.${i}.valor`} rotulo="Valor" obrigatorio={false} inputMode="decimal" />
              <Campo id={a.id} nome={`parametro.${i}.descricao`} rotulo="Descrição" obrigatorio={false} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLinhas((n) => Math.min(n + 1, 30))} className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-xs">Acrescentar parâmetro</button>
      </fieldset>
      <Mensagens estado={a.estado} acao="publicar-tabela-tributaria" />
      <button type="submit" disabled={a.pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{a.pendente ? "Publicando…" : "Publicar tabela"}</button>
    </form>
  );
}
