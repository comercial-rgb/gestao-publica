"use client";

import { useActionState, useState } from "react";
import { CampoCep, CampoCpfCnpj, CampoEnvolvido, CampoTelefone, CampoTexto } from "../../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { useRestaurarAposEnvio } from "../../../../../components/ui/useRestaurarAposEnvio";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO,
  CLASSE_PAINEL_FORMULARIO,
} from "../../../../../components/ui/Formulario";
import {
  registrarContabilistaAction,
  registrarEmpresaGeradoraAction,
  type EstadoDoResponsavel,
} from "./actions";

/**
 * OS FORMULÁRIOS DOS RESPONSÁVEIS PELO ARQUIVO DA RECEITA.
 *
 * ⚠️ RÓTULO EM TODO CAMPO, E O ID VEM DO `useId` (via `CampoEnvolvido`). A página tem dois
 * formulários com campos de mesmo nome (`cpf`, `fone`, `email`); um id literal repetiria e o
 * rótulo de um apontaria para o campo do outro.
 *
 * ⚠️ A TELA SUGERE, O SERVIDOR DECIDE. CPF, CNPJ, CRC e datas são conferidos no domínio; a
 * máscara aqui é só apresentação, e o `required` é conveniência — não proteção.
 */

function Resultado({ estado, papel, seq }: { readonly estado: EstadoDoResponsavel; readonly papel: string; readonly seq: number }): React.ReactElement | null {
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

/**
 * O ENVIO DE UM FORMULÁRIO DESTA TELA.
 *
 * ⚠️ NUMA RECUSA, O QUE A PESSOA DIGITOU VOLTA (`useRestaurarAposEnvio`): o React limpa o formulário
 * a cada envio, gravando ou não, e uma recusa de CPF obrigaria a redigitar o endereço inteiro.
 * ⚠️ NUM SUCESSO, O FORMULÁRIO RENASCE VAZIO (`chave` muda): os campos com máscara guardam estado
 * próprio e não seriam limpos pelo reset nativo — o próximo registro nasceria com o CPF do anterior.
 * `seq` conta os desfechos para o `data-resultado-seq` (o percurso de navegador espera o novo).
 */
function useEnvio(acao: (e: EstadoDoResponsavel, d: FormData) => Promise<EstadoDoResponsavel>) {
  let guardar: (d: FormData) => void = () => undefined;
  const [estado, disparar, pendente] = useActionState<EstadoDoResponsavel, FormData>(async (anterior, dados) => {
    guardar(dados);
    return acao(anterior, dados);
  }, {});
  const restauracao = useRestaurarAposEnvio(estado, (e) => e.erro !== undefined);
  guardar = restauracao.guardar;

  const [seq, setSeq] = useState(0);
  const [sucessos, setSucessos] = useState(0);
  const [ultimo, setUltimo] = useState<EstadoDoResponsavel>(estado);
  if (estado !== ultimo) {
    setUltimo(estado);
    if (estado.sucesso !== undefined || estado.erro !== undefined) setSeq((n) => n + 1);
    if (estado.sucesso !== undefined) setSucessos((n) => n + 1);
  }
  return { estado, disparar, pendente, ref: restauracao.ref, seq, chave: sucessos };
}

function CampoData({
  name,
  rotulo,
  required,
  ajuda,
}: {
  readonly name: string;
  readonly rotulo: string;
  readonly required?: boolean;
  readonly ajuda?: string;
}): React.ReactElement {
  return (
    <CampoEnvolvido name={name} rotulo={rotulo} required={required} ajuda={ajuda} largura={2}>
      {(aria) => <input {...aria} type="date" name={name} className={CLASSE_CAMPO} {...(required === true ? { required: true } : {})} />}
    </CampoEnvolvido>
  );
}

function CampoDocumento({
  name,
  rotulo,
  required,
  ajuda,
}: {
  readonly name: string;
  readonly rotulo: string;
  readonly required?: boolean;
  readonly ajuda?: string;
}): React.ReactElement {
  return (
    <CampoEnvolvido name={name} rotulo={rotulo} required={required} ajuda={ajuda} largura={2}>
      {(aria) => <CampoCpfCnpj id={aria.id} name={name} required={required} className={CLASSE_CAMPO} />}
    </CampoEnvolvido>
  );
}

export function FormContabilista(): React.ReactElement {
  const { estado, disparar, pendente, ref, seq, chave } = useEnvio(registrarContabilistaAction);
  return (
    <form key={chave} ref={ref} action={disparar} className={CLASSE_PAINEL_FORMULARIO} data-acao="registrar-contabilista">
      <ChaveDeComando />
      <div className="grid gap-3 md:grid-cols-4">
        <CampoTexto name="nome" rotulo="Nome do contabilista" required largura={4} />
        <CampoDocumento name="cpf" rotulo="CPF" required />
        <CampoTexto
          name="crc"
          rotulo="Registro no CRC"
          required
          largura={2}
          maxLength={11}
          ajuda="Número de registro no Conselho Regional de Contabilidade, com a UF (até 11 caracteres)."
        />
        <CampoData
          name="dtInicio"
          rotulo="Início da responsabilidade"
          required
          ajuda="Um novo registro sucede o anterior: o período do anterior termina na véspera desta data."
        />
        <CampoData name="dtFim" rotulo="Fim da responsabilidade" ajuda="Deixe em branco se continua responsável." />
        <CampoDocumento name="cnpjEscritorio" rotulo="CNPJ do escritório de contabilidade" ajuda="Somente quando houver escritório." />
        <CampoTexto name="email" rotulo="E-mail" largura={2} />
        <CampoTexto name="endereco" rotulo="Endereço" largura={2} />
        <CampoTexto name="numero" rotulo="Número" largura={1} />
        <CampoTexto name="complemento" rotulo="Complemento" largura={1} />
        <CampoTexto name="bairro" rotulo="Bairro" largura={2} />
        <CampoEnvolvido name="cep" rotulo="CEP" largura={1}>
          {(aria) => <CampoCep id={aria.id} name="cep" className={CLASSE_CAMPO} />}
        </CampoEnvolvido>
        <CampoTexto name="uf" rotulo="UF" largura={1} maxLength={2} />
        <CampoEnvolvido name="fone" rotulo="Telefone" largura={2}>
          {(aria) => <CampoTelefone id={aria.id} name="fone" className={CLASSE_CAMPO} />}
        </CampoEnvolvido>
      </div>
      <div className="mt-4">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Registrando…" : "Registrar contabilista"}
        </button>
      </div>
      <Resultado estado={estado} papel="registrar-contabilista" seq={seq} />
    </form>
  );
}

export function FormEmpresaGeradora(): React.ReactElement {
  const { estado, disparar, pendente, ref, seq, chave } = useEnvio(registrarEmpresaGeradoraAction);
  return (
    <form key={chave} ref={ref} action={disparar} className={CLASSE_PAINEL_FORMULARIO} data-acao="registrar-empresa-geradora">
      <ChaveDeComando />
      <div className="grid gap-3 md:grid-cols-4">
        <CampoTexto name="empresaOuTecnico" rotulo="Empresa ou técnico responsável" required largura={2} />
        <CampoTexto name="cargo" rotulo="Cargo ou função" required largura={2} placeholder="Fornecedor do sistema de contabilidade" />
        <CampoDocumento name="cnpj" rotulo="CNPJ da empresa" ajuda="Informe o CNPJ da empresa ou o CPF do técnico." />
        <CampoDocumento name="cpf" rotulo="CPF do técnico" />
        <CampoData name="dtInicioServico" rotulo="Início da prestação do serviço" required />
        <CampoData name="dtFimServico" rotulo="Fim da prestação do serviço" ajuda="Deixe em branco se o serviço continua." />
        <CampoEnvolvido name="fone" rotulo="Telefone" largura={2}>
          {(aria) => <CampoTelefone id={aria.id} name="fone" className={CLASSE_CAMPO} />}
        </CampoEnvolvido>
        <CampoTexto name="email" rotulo="E-mail" largura={2} />
      </div>
      <div className="mt-4">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Registrando…" : "Registrar responsável pela geração"}
        </button>
      </div>
      <Resultado estado={estado} papel="registrar-empresa-geradora" seq={seq} />
    </form>
  );
}
