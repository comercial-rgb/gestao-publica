import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { MOTIVOS_DE_BAIXA } from "../../../../../lib/portas/recursos/gestao-do-bem";
import {
  opcoesDaGestaoDoBem,
  verMotivoDeBaixa,
} from "../../../../../lib/portas/recursos/gestao-do-bem-dados";
import { acaoDeMotivosDeBaixaAction } from "../actions";

/**
 * O detalhe — e este cadastro declara **só a aba de dados**.
 *
 * ⚠️ A DIFERENÇA É DECLARADA, NÃO ESQUECIDA. Ele não tem movimento próprio nem relação para
 * listar: a baixa que usa o motivo vive no BEM, não aqui. Declarar "histórico" e
 * "relacionados" abriria duas abas vazias, e aba vazia ensina que o sistema perdeu algo.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(MOTIVOS_DE_BAIXA, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verMotivoDeBaixa(id),
    opcoesDaGestaoDoBem(),
    acoesPermitidas(MOTIVOS_DE_BAIXA.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={MOTIVOS_DE_BAIXA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={MOTIVOS_DE_BAIXA}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeMotivosDeBaixaAction}
          modo="acoes"
        />
      }
    />
  );
}
