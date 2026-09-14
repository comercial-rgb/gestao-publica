import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { ENCARGOS_DA_FOLHA } from "../../../../../lib/portas/recursos/encargos";
import { opcoesDoComponenteDeEncargo, rubricasDeProvento, verComponenteDeEncargo } from "../../../../../lib/portas/recursos/encargos-dados";
import { encargosAction, versaoDoEncargoAction } from "../actions";
import { FormVersaoDoEncargo } from "./FormVersaoDoEncargo";

/**
 * O DETALHE DO COMPONENTE: as versões (alíquota, base, teto, vigência, fundamento, aprovada ou não),
 * a ilha de cadastrar versão e a ação de aprovar (só as versões ainda não aprovadas DESTE componente).
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(ENCARGOS_DA_FOLHA, await searchParams);
  const [detalhe, opcoes, rubricas, permitidas] = await Promise.all([verComponenteDeEncargo(id), opcoesDoComponenteDeEncargo(id), rubricasDeProvento(), acoesPermitidas(["APROVAR_ENCARGO_DA_FOLHA", "CADASTRAR_ENCARGO_DA_FOLHA"])]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={ENCARGOS_DA_FOLHA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <div className="space-y-4">
          {permitidas.has("CADASTRAR_ENCARGO_DA_FOLHA") ? <FormVersaoDoEncargo componenteId={id} rubricas={rubricas} action={versaoDoEncargoAction} /> : null}
          {(opcoes["versaoId"] ?? []).length === 0 && permitidas.has("APROVAR_ENCARGO_DA_FOLHA") ? (
            <p data-acao="aprovar-versao" data-acao-estado="nao-aplicavel" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
              Nenhuma versão deste componente aguarda aprovação.
            </p>
          ) : (
            <FormsDoRecurso definicao={ENCARGOS_DA_FOLHA} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={encargosAction} modo="acoes" />
          )}
        </div>
      }
    />
  );
}
