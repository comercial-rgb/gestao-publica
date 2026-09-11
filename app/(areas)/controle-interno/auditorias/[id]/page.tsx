import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { AUDITORIAS } from "../../../../../lib/portas/recursos/definicoes";
import { opcoesDoCadastro, verAuditoria } from "../../../../../lib/portas/recursos/dados";
import { acaoDeAuditoriaAction } from "../actions";

/**
 * O DETALHE DE UM REGISTRO DE AUDITORIAS — as cinco abas fixas do molde.
 *
 * ⚠️ A ABA VEM DA URL (`?aba=historico`), e cada aba é lida no servidor SÓ QUANDO PEDIDA.
 * Com estado de componente, as cinco leituras aconteceriam a cada abertura.
 */
export const dynamic = "force-dynamic";

export default async function AuditoriasDetalhePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(AUDITORIAS, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verAuditoria(id),
    opcoesDoCadastro({ classesDeConta: AUDITORIAS.classesDeConta ?? [] }),
    acoesPermitidas(AUDITORIAS.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={AUDITORIAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={AUDITORIAS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeAuditoriaAction}
          modo="acoes"
        />
      }
    />
  );
}
