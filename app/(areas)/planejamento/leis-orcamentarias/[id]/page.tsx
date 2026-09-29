import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { EXTENSOES_ACEITAS, lerAnexosDaLeiOrcamentaria, TAMANHO_MAXIMO_BYTES } from "../../../../../lib/portas/documentos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { LEIS_ORCAMENTARIAS } from "../../../../../lib/portas/recursos/leis-orcamentarias";
import { disponibilidadeDaLeiOrcamentaria, verLeiOrcamentaria } from "../../../../../lib/portas/recursos/leis-orcamentarias-dados";
import { FormAnexo } from "../../../documentos/FormAnexo";
import { acaoDasLeisOrcamentariasAction } from "../actions";

/**
 * O detalhe de uma LOA: o projeto, a lei que o aprovou (ação "Registrar a lei aprovada") e os
 * documentos anexos (o projeto, a lei publicada, os anexos da lei), com a integridade conferida a
 * cada acesso pelo M22. A aba de anexos só é lida quando pedida.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  const consulta = lerConsulta(LEIS_ORCAMENTARIAS, await searchParams);
  const [detalhe, permitidas, disponibilidade] = await Promise.all([
    verLeiOrcamentaria(id),
    acoesPermitidas([...LEIS_ORCAMENTARIAS.acoes.map((a) => a.acaoDoCenso), "ANEXAR_ARQUIVO"]),
    disponibilidadeDaLeiOrcamentaria(id).catch(() => null),
  ]);
  if (detalhe === null) notFound();
  const abaDeAnexos =
    consulta.aba === "anexos" ? (
      <div>
        <p className="mb-3 text-sm text-[color:var(--color-ink-2)]">
          Anexe o projeto de lei, a lei publicada e os anexos da lei. A integridade de cada arquivo é
          verificada a cada acesso; um arquivo alterado após o envio não é disponibilizado.
        </p>
        <ListaDeAnexos anexos={await lerAnexosDaLeiOrcamentaria(id)} />
        {permitidas.has("ANEXAR_ARQUIVO") ? (
          <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
            <FormAnexo
              dono={{ leiOrcamentariaAnualId: id }}
              accept={EXTENSOES_ACEITAS}
              tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES}
              rotulo="Anexar documento da lei"
            />
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <DetalheDeRecurso
      definicao={LEIS_ORCAMENTARIAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      anexos={abaDeAnexos}
      acoes={
        <FormsDoRecurso
          definicao={LEIS_ORCAMENTARIAS}
          permitidas={[...permitidas]}
          opcoes={{}}
          registroId={id}
          action={acaoDasLeisOrcamentariasAction}
          modo="acoes"
          disponibilidade={disponibilidade}
        />
      }
    />
  );
}
