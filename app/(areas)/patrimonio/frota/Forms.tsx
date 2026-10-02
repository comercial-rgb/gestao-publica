"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CampoCpfCnpj } from "../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import {
  anularAbastecimentoAction,
  anularSituacaoAction,
  cadastrarMaquinaAction,
  cadastrarVeiculoAction,
  publicarVersaoAction,
  registrarAbastecimentoAction,
  registrarSituacaoAction,
  type EstadoDaFrota,
} from "./actions";

type Opcoes = Readonly<Record<string, string>>;
type Ug = { readonly id: string; readonly rotulo: string };

function Resultado({ estado, acao }: { readonly estado: EstadoDaFrota; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

function Escolha({ nome, rotulo, opcoes, inicial = "" }: { readonly nome: string; readonly rotulo: string; readonly opcoes: Opcoes; readonly inicial?: string }): React.ReactElement {
  return (
    <label className="text-xs">
      <span className={ROTULO}>{rotulo}</span>
      <select name={nome} required defaultValue={inicial} className={CAMPO}>
        <option value="">Escolha…</option>
        {Object.entries(opcoes).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
  );
}

/** Tipo, dono, locador, combustível, vigência e fundamento: o que veículo e máquina têm em comum. */
function CamposDoBem({ tipos, combustiveis, dados = {} }: { readonly tipos: Opcoes; readonly combustiveis: Opcoes; readonly dados?: Readonly<Record<string, string>> }): React.ReactElement {
  return (
    <>
      <Escolha nome="tipoFrota" rotulo="Próprio, locado, prestação de serviços ou cedido" opcoes={tipos} inicial={dados["tipoFrota"] ?? ""} />
      <label className="text-xs"><span className={ROTULO}>CPF ou CNPJ do proprietário (não no próprio)</span><CampoCpfCnpj name="proprietarioDocumento" defaultValue={dados["proprietarioDocumento"] ?? ""} className={CAMPO} aria-label="CPF ou CNPJ do proprietário" /></label>
      <label className="text-xs"><span className={ROTULO}>CPF ou CNPJ do locador ou prestador (locado ou prestação)</span><CampoCpfCnpj name="locadorDocumento" defaultValue={dados["locadorDocumento"] ?? ""} className={CAMPO} aria-label="CPF ou CNPJ do locador ou prestador" /></label>
      <Escolha nome="combustivelPrincipal" rotulo="Combustível principal" opcoes={combustiveis} inicial={dados["combustivelPrincipal"] ?? ""} />
      <label className="text-xs"><span className={ROTULO}>Dados valem desde</span><input name="vigenteDesde" type="date" required className={CAMPO} /></label>
      <label className="text-xs sm:col-span-3"><span className={ROTULO}>De onde vêm os dados (documento do veículo, contrato, termo de cessão)</span><input name="fundamento" required minLength={5} className={CAMPO} /></label>
    </>
  );
}

export function FormCadastrarVeiculo({ ugs, tipos, combustiveis, situacoes }: { readonly ugs: readonly Ug[]; readonly tipos: Opcoes; readonly combustiveis: Opcoes; readonly situacoes: Opcoes }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFrota, FormData>(cadastrarVeiculoAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="cadastrar-veiculo" aria-label="Cadastrar um veículo">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Cadastrar um veículo</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Escolha nome="ugId" rotulo="Unidade gestora responsável" opcoes={Object.fromEntries(ugs.map((u) => [u.id, u.rotulo]))} />
        <label className="text-xs"><span className={ROTULO}>Placa</span><input name="placa" required maxLength={8} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Ano do modelo</span><input name="anoModelo" required inputMode="numeric" pattern="\d{4}" maxLength={4} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>RENAVAM</span><input name="renavam" required inputMode="numeric" maxLength={11} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Número do modelo na tabela do Tribunal</span><input name="numeroModelo" inputMode="numeric" maxLength={6} className={CAMPO} /></label>
        <Escolha nome="situacaoInicial" rotulo="Situação no cadastro" opcoes={situacoes} inicial="EM_USO" />
        <CamposDoBem tipos={tipos} combustiveis={combustiveis} />
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Cadastrar o veículo"}</button>
      <Resultado estado={estado} acao="cadastrar-veiculo" />
    </form>
  );
}

export function FormCadastrarMaquina({ ugs, tipos, combustiveis, situacoes }: { readonly ugs: readonly Ug[]; readonly tipos: Opcoes; readonly combustiveis: Opcoes; readonly situacoes: Opcoes }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFrota, FormData>(cadastrarMaquinaAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="cadastrar-maquina" aria-label="Cadastrar uma máquina">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Cadastrar uma máquina</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Escolha nome="ugId" rotulo="Unidade gestora responsável" opcoes={Object.fromEntries(ugs.map((u) => [u.id, u.rotulo]))} />
        <label className="text-xs"><span className={ROTULO}>Código da máquina (até 7 letras ou dígitos)</span><input name="codigo" required maxLength={7} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Ano de fabricação</span><input name="anoFabricacao" required inputMode="numeric" pattern="\d{4}" maxLength={4} className={CAMPO} /></label>
        <label className="text-xs sm:col-span-2"><span className={ROTULO}>Descrição</span><input name="descricao" required maxLength={50} className={CAMPO} /></label>
        <Escolha nome="situacaoInicial" rotulo="Situação no cadastro" opcoes={situacoes} inicial="EM_USO" />
        <CamposDoBem tipos={tipos} combustiveis={combustiveis} />
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Cadastrar a máquina"}</button>
      <Resultado estado={estado} acao="cadastrar-maquina" />
    </form>
  );
}

export function FormVersao({ bemId, categoria, identificacao, dados, tipos, combustiveis }: { readonly bemId: string; readonly categoria: "VEICULO" | "MAQUINA"; readonly identificacao: string; readonly dados: Readonly<Record<string, string>>; readonly tipos: Opcoes; readonly combustiveis: Opcoes }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFrota, FormData>(publicarVersaoAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Mudar dados, dono ou locador</summary>
      <form action={action} data-acao="publicar-versao-da-frota" className="mt-2 grid gap-2 sm:grid-cols-3" aria-label={`Publicar uma versão de ${identificacao}`}>
        <ChaveDeComando />
        <input type="hidden" name="bemId" value={bemId} />
        <input type="hidden" name="categoria" value={categoria} />
        {categoria === "VEICULO" ? (
          <>
            <label className="text-xs"><span className={ROTULO}>Ano do modelo</span><input name="anoModelo" required defaultValue={dados["anoModelo"]} className={CAMPO} /></label>
            <label className="text-xs"><span className={ROTULO}>RENAVAM</span><input name="renavam" required defaultValue={dados["renavam"]} className={CAMPO} /></label>
            <label className="text-xs"><span className={ROTULO}>Número do modelo na tabela do Tribunal</span><input name="numeroModelo" defaultValue={dados["numeroModelo"]} className={CAMPO} /></label>
          </>
        ) : (
          <>
            <label className="text-xs"><span className={ROTULO}>Ano de fabricação</span><input name="anoFabricacao" required defaultValue={dados["anoFabricacao"]} className={CAMPO} /></label>
            <label className="text-xs sm:col-span-2"><span className={ROTULO}>Descrição</span><input name="descricao" required maxLength={50} defaultValue={dados["descricao"]} className={CAMPO} /></label>
          </>
        )}
        <CamposDoBem tipos={tipos} combustiveis={combustiveis} dados={dados} />
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Publicar a versão"}</button>
        <Resultado estado={estado} acao="publicar-versao-da-frota" />
      </form>
    </details>
  );
}

export function FormSituacao({ bemId, categoria, identificacao, situacoes }: { readonly bemId: string; readonly categoria: string; readonly identificacao: string; readonly situacoes: Opcoes }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFrota, FormData>(registrarSituacaoAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Registrar situação</summary>
      <form action={action} data-acao="registrar-situacao-da-frota" className="mt-2 grid gap-2" aria-label={`Registrar a situação de ${identificacao}`}>
        <ChaveDeComando />
        <input type="hidden" name="bemId" value={bemId} />
        <input type="hidden" name="categoria" value={categoria} />
        <Escolha nome="situacao" rotulo="Situação" opcoes={situacoes} />
        <label className="text-xs"><span className={ROTULO}>A partir de</span><input name="desde" type="date" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Motivo (ordem de serviço, laudo, ato de baixa)</span><input name="motivo" required minLength={5} className={CAMPO} /></label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Registrar"}</button>
        <Resultado estado={estado} acao="registrar-situacao-da-frota" />
      </form>
    </details>
  );
}

export function FormAbastecimento({ bemId, categoria, identificacao, combustiveis }: { readonly bemId: string; readonly categoria: string; readonly identificacao: string; readonly combustiveis: Opcoes }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFrota, FormData>(registrarAbastecimentoAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Registrar abastecimento</summary>
      <form action={action} data-acao="registrar-abastecimento" className="mt-2 grid gap-2" aria-label={`Registrar abastecimento de ${identificacao}`}>
        <ChaveDeComando />
        <input type="hidden" name="bemId" value={bemId} />
        <input type="hidden" name="categoria" value={categoria} />
        <label className="text-xs"><span className={ROTULO}>Dia</span><input name="data" type="date" required className={CAMPO} /></label>
        <Escolha nome="combustivel" rotulo="Combustível" opcoes={combustiveis} />
        <label className="text-xs"><span className={ROTULO}>Quantidade (litros; m³ no gás natural)</span><input name="quantidade" required inputMode="decimal" className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Cupom, nota ou ordem de abastecimento</span><input name="documento" required className={CAMPO} /></label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Registrar"}</button>
        <Resultado estado={estado} acao="registrar-abastecimento" />
      </form>
    </details>
  );
}

export function FormAnular({ id, tipo, rotulo }: { readonly id: string; readonly tipo: "situacao" | "abastecimento"; readonly rotulo: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaFrota, FormData>(tipo === "situacao" ? anularSituacaoAction : anularAbastecimentoAction, {});
  return (
    <details className="inline-block">
      <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Anular</summary>
      <form action={action} data-acao={`anular-${tipo}`} className="mt-1 grid gap-1" aria-label={`Anular ${rotulo}`}>
        <ChaveDeComando />
        <input type="hidden" name="id" value={id} />
        <label className="text-xs"><span className={ROTULO}>Por que está errado</span><input name="motivo" required minLength={5} className={CAMPO} /></label>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Anular"}</button>
        <Resultado estado={estado} acao={`anular-${tipo}`} />
      </form>
    </details>
  );
}
