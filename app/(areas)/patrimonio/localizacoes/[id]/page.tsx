import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { LOCALIZACOES_FISICAS } from "../../../../../lib/portas/recursos/gestao-do-bem";
import {
  divulgacaoDaLocalizacao,
  opcoesDaGestaoDoBem,
  verLocalizacao,
} from "../../../../../lib/portas/recursos/gestao-do-bem-dados";
import { FormDivulgacao } from "./FormDivulgacao";
import { acaoDeLocalizacoesAction } from "../actions";

/**
 * O detalhe. As abas são `dados`, `histórico` e `relacionados` — `campos` e `anexos` não
 * aparecem porque custam MODELO (uma FK de dono em `Anexo`), e aba vazia ensina que o
 * sistema perdeu o arquivo.
 *
 * ⚠️ O "HISTÓRICO" AQUI É A ÁRVORE ABAIXO DESTA LOCALIZAÇÃO. Um cadastro de apoio não tem
 * movimento próprio; o que interessa a quem procura um bem é o que existe embaixo dela.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const { id } = await params;
  const consulta = lerConsulta(LOCALIZACOES_FISICAS, await searchParams);

  const [detalhe, opcoes, permitidas, divulgacao] = await Promise.all([
    verLocalizacao(id),
    opcoesDaGestaoDoBem(),
    acoesPermitidas(LOCALIZACOES_FISICAS.acoes.map((a) => a.acaoDoCenso)),
    divulgacaoDaLocalizacao(id),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={LOCALIZACOES_FISICAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <>
          {/* ⚠️ V10 T3 — A POLÍTICA DE DIVULGAÇÃO, FORA DO MOLDE. O molde monta formulário a
              partir do descritor do recurso, e este ato não é "editar um campo do cadastro": é
              uma decisão com motivo obrigatório e histórico próprio, com ação própria. Espremê-lo
              num campo do formulário de cadastro faria a decisão passar sem motivo e sem autor. */}
          {divulgacao === null ? null : <FormDivulgacao d={divulgacao} />}
          <FormsDoRecurso
          definicao={LOCALIZACOES_FISICAS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeLocalizacoesAction}
            modo="acoes"
          />
        </>
      }
    />
  );
}
