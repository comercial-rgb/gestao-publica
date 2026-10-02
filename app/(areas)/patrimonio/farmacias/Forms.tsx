"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { cadastrarFarmaciaAction, informarEstoqueAction, publicarVersaoDaFarmaciaAction, type EstadoDaFarmacia } from "./actions";

function Resultado({ estado, acao }: { readonly estado: EstadoDaFarmacia; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

function CamposDaFarmacia({ dados = {} }: { readonly dados?: Readonly<Record<string, string>> }): React.ReactElement {
  return (
    <>
      <label className="text-xs sm:col-span-2"><span className={ROTULO}>Nome da farmácia</span><input name="descricao" required maxLength={60} defaultValue={dados["descricao"]} className={CAMPO} /></label>
      <label className="text-xs sm:col-span-3"><span className={ROTULO}>Endereço</span><input name="endereco" required maxLength={120} defaultValue={dados["endereco"]} className={CAMPO} /></label>
      <label className="text-xs"><span className={ROTULO}>Farmacêutico responsável</span><input name="nomeResponsavel" required maxLength={60} defaultValue={dados["nomeResponsavel"]} className={CAMPO} /></label>
      <label className="text-xs"><span className={ROTULO}>CPF do responsável</span><input name="cpfResponsavel" required inputMode="numeric" maxLength={14} defaultValue={dados["cpfResponsavel"]} className={CAMPO} /></label>
      <label className="text-xs"><span className={ROTULO}>Registro no Conselho Regional de Farmácia</span><input name="crfResponsavel" required maxLength={10} defaultValue={dados["crfResponsavel"]} className={CAMPO} /></label>
      <label className="text-xs"><span className={ROTULO}>Vale desde</span><input name="vigenteDesde" type="date" required className={CAMPO} /></label>
      <label className="text-xs sm:col-span-2"><span className={ROTULO}>De onde vêm os dados (portaria do responsável, alvará)</span><input name="fundamento" required minLength={5} className={CAMPO} /></label>
    </>
  );
}

export function FormCadastrarFarmacia({ ugs }: { readonly ugs: readonly { readonly id: string; readonly rotulo: string }[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFarmacia, FormData>(cadastrarFarmaciaAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="cadastrar-farmacia" aria-label="Cadastrar uma farmácia pública">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Cadastrar uma farmácia pública</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Unidade gestora responsável</span>
          <select name="ugId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {ugs.map((u) => <option key={u.id} value={u.id}>{u.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>Código da farmácia (até 7 dígitos)</span><input name="codigo" required inputMode="numeric" pattern="\d{1,7}" maxLength={7} className={CAMPO} /></label>
        <CamposDaFarmacia />
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Cadastrar"}</button>
      <Resultado estado={estado} acao="cadastrar-farmacia" />
    </form>
  );
}

export function FormVersaoDaFarmacia({ farmaciaId, codigo, dados }: { readonly farmaciaId: string; readonly codigo: string; readonly dados: Readonly<Record<string, string>> }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFarmacia, FormData>(publicarVersaoDaFarmaciaAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Mudar dados ou encerrar</summary>
      <form action={action} data-acao="publicar-versao-da-farmacia" className="mt-2 grid gap-2 sm:grid-cols-3" aria-label={`Publicar uma versão da farmácia ${codigo}`}>
        <ChaveDeComando />
        <input type="hidden" name="farmaciaId" value={farmaciaId} />
        <CamposDaFarmacia dados={dados} />
        <label className="text-xs"><span className={ROTULO}>Encerrar a farmácia nesta data</span><select name="encerrar" defaultValue="nao" className={CAMPO}><option value="nao">Não</option><option value="sim">Sim</option></select></label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Publicar"}</button>
        <Resultado estado={estado} acao="publicar-versao-da-farmacia" />
      </form>
    </details>
  );
}

export function FormEstoque({ farmaciaId, codigo }: { readonly farmaciaId: string; readonly codigo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFarmacia, FormData>(informarEstoqueAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Informar o estoque do mês</summary>
      <form action={action} data-acao="informar-estoque-da-farmacia" className="mt-2 grid gap-2 sm:grid-cols-3" aria-label={`Informar o estoque da farmácia ${codigo}`}>
        <ChaveDeComando />
        <input type="hidden" name="farmaciaId" value={farmaciaId} />
        <label className="text-xs"><span className={ROTULO}>Mês</span><input name="mes" type="month" required className={CAMPO} /></label>
        <label className="text-xs sm:col-span-2"><span className={ROTULO}>De onde vem a posição (inventário, relatório do sistema da farmácia)</span><input name="fundamento" required minLength={5} className={CAMPO} /></label>
        <label className="text-xs sm:col-span-3">
          <span className={ROTULO}>Arquivo do estoque (texto com cabeçalho codigoProduto;descricao;unidade;quantidade)</span>
          <input name="arquivo" type="file" accept=".csv,.txt,text/plain,text/csv" className={CAMPO} />
        </label>
        <p className="text-xs text-[color:var(--color-ink-3)] sm:col-span-3">Ou digite um produto (o informe com um só produto substitui o do mês inteiro):</p>
        <label className="text-xs"><span className={ROTULO}>Código do produto (GTIN)</span><input name="codigoProduto" inputMode="numeric" maxLength={14} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Medicamento</span><input name="descricaoProduto" maxLength={60} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Unidade de dispensação</span><input name="unidadeMedida" maxLength={10} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Quantidade</span><input name="quantidade" inputMode="decimal" className={CAMPO} /></label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Informar"}</button>
        <Resultado estado={estado} acao="informar-estoque-da-farmacia" />
      </form>
    </details>
  );
}
