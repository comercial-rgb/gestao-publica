import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { podeLerPara } from "../../../../../lib/portas/leitura";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { CONTRATOS } from "../../../../../lib/portas/recursos/contratacao";
import { verContrato, opcoesDoContrato } from "../../../../../lib/portas/recursos/contratacao-dados";
import { contratosAction } from "../actions";
import { alcanceDaSessaoNoContrato, dossieDoContratoPara, hojeCivil } from "../../../../../lib/portas/contrato-acompanhado";
import { DossieDoContrato } from "./DossieDoContrato";
import { ExecucaoDoContrato } from "./ExecucaoDoContrato";
import { controleContabilDoContratoPara, execucaoDoContratoPara } from "../../../../../lib/portas/execucao-do-contrato";
import { ControleContabilDoContrato } from "./ControleContabilDoContrato";

/**
 * O DETALHE DO CONTRATO: valor e vigência derivados dos aditivos, os empenhos que o informaram, e as ações. Os aditivos oferecidos ao estorno são SÓ os vivos deste contrato.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`).
 * ⚠️ QUEM ENTRA (V7 M2 U0.1): quem lê licitações no ente (projeção financeira) OU quem alcança a fiscalização DESTE
 * contrato (designação vigente ou administrador da fiscalização) ou a projeção financeira (quem liquida ou lê a despesa).
 * Qualquer outro recebe 404 — a mesma resposta de
 * contrato inexistente. O dossiê abaixo decide a projeção pelo mesmo alcance.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  const sessao = await exigirSessao();
  const { id } = await params;
  const [leLicitacoes, alcance] = await Promise.all([podeLerPara(sessao, "CONSULTAR_LICITACOES", "ente"), alcanceDaSessaoNoContrato(sessao, id)]);
  if (!leLicitacoes && !alcance.fiscalizacao && !alcance.financeira) notFound();
  const consulta = lerConsulta(CONTRATOS, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verContrato(id), opcoesDoContrato(id), acoesPermitidas(CONTRATOS.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  const [dossie, execucao, controle] = consulta.aba === "dados" ? await Promise.all([dossieDoContratoPara(sessao, id), execucaoDoContratoPara(sessao, id), controleContabilDoContratoPara(sessao, id)]) : [null, null, null];
  return (
    <div className="space-y-4">
    <DetalheDeRecurso
      definicao={CONTRATOS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={CONTRATOS} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={contratosAction} modo="acoes" />}
    />
    {dossie !== null ? <DossieDoContrato d={dossie} hoje={hojeCivil()} /> : null}
    {execucao !== null ? <ExecucaoDoContrato e={execucao} contratoId={id} /> : null}
    {controle !== null && "controle" in controle ? <ControleContabilDoContrato c={controle.controle} podeDeclararRoteiro={controle.podeDeclararRoteiro} /> : null}
    </div>
  );
}
