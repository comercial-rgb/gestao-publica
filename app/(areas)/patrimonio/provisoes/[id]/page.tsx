import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { PROVISOES } from "../../../../../lib/portas/recursos/definicoes";
import { opcoesDoCadastro, verProvisao } from "../../../../../lib/portas/recursos/dados";
import { acaoDeProvisaoAction } from "../actions";

/**
 * O DETALHE DE UMA PROVISÃO — as abas DECLARADAS no descritor.
 *
 * ⚠️ SÃO TRÊS, E NÃO CINCO: anexos e campos adicionais exigem FK própria e um valor no rol
 * fechado do M25. Declarar a aba sem a FK produziria um "Anexos" que perde o arquivo.
 *
 * ⚠️ A ABA VEM DA URL (`?aba=historico`), e cada aba é lida no servidor SÓ QUANDO PEDIDA.
 */
export const dynamic = "force-dynamic";

export default async function ProvisaoDetalhePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(PROVISOES, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verProvisao(id),
    opcoesDoCadastro({ classesDeConta: PROVISOES.classesDeConta ?? [] }),
    acoesPermitidas(PROVISOES.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={PROVISOES}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={PROVISOES}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeProvisaoAction}
          modo="acoes"
        />
      }
    />
  );
}
