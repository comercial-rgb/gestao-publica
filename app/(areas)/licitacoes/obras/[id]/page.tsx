import Link from "next/link";
import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { OBRAS } from "../../../../../lib/portas/recursos/definicoes";
import { opcoesDoCadastro, verObra } from "../../../../../lib/portas/recursos/dados";
import { acaoDeObraAction } from "../actions";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { EXTENSOES_ACEITAS, lerAnexosDaObra, TAMANHO_MAXIMO_BYTES } from "../../../../../lib/portas/documentos";
import { lerPublicacaoDaObra } from "../../../../../lib/portas/obras-no-portal";
import { FormAnexo } from "../../../documentos/FormAnexo";
import { FormPublicacaoDaObra } from "./FormPublicacaoDaObra";

/**
 * O DETALHE DE UM REGISTRO DE OBRAS — as cinco abas fixas do molde.
 *
 * ⚠️ A ABA VEM DA URL (`?aba=historico`), e cada aba é lida no servidor SÓ QUANDO PEDIDA.
 */
export const dynamic = "force-dynamic";

export default async function ObrasDetalhePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(OBRAS, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verObra(id),
    opcoesDoCadastro({ obraId: id, classesDeConta: OBRAS.classesDeConta ?? [] }),
    acoesPermitidas([...OBRAS.acoes.map((a) => a.acaoDoCenso), "CADASTRAR_OBRA", "ANEXAR_ARQUIVO"]),
  ]);
  if (detalhe === null) notFound();
  // V36 — os documentos da obra (aba Anexos) e a publicação no portal da transparência (TR 5.10.1.54).
  const [anexos, publicacao] = await Promise.all([consulta.aba === "anexos" ? lerAnexosDaObra(id) : Promise.resolve([]), lerPublicacaoDaObra(id)]);

  return (
    <DetalheDeRecurso
      definicao={OBRAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      anexos={
        <>
          <ListaDeAnexos anexos={anexos} />
          {permitidas.has("ANEXAR_ARQUIVO") ? (
            <div className="mt-3">
              <FormAnexo accept={EXTENSOES_ACEITAS} dono={{ obraId: id }} rotulo="Anexar documento da obra" tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES} />
            </div>
          ) : null}
          {publicacao.publicada ? <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">Esta obra está no portal da transparência: os anexos dela são públicos.</p> : null}
        </>
      }
      acoes={
        <>
        <div className="mb-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-publicacao-da-obra={publicacao.publicada ? "publicada" : "nao-publicada"}>
          <p className="mb-2 text-sm font-semibold">
            Portal da transparência: {publicacao.publicada ? <Link className="text-[color:var(--color-primary)] underline" href={`/transparencia/obras/${id}`}>publicada</Link> : "não publicada"}
          </p>
          {permitidas.has("CADASTRAR_OBRA") ? <FormPublicacaoDaObra key={String(publicacao.publicada)} obraId={id} publicada={publicacao.publicada} /> : null}
        </div>
        <p className="mb-3 text-sm"><Link href={`/licitacoes/obras/${id}/planilha`} className="font-semibold text-[color:var(--color-primary)] underline underline-offset-2" data-link-planilha-da-obra>Planilha orçamentária da obra</Link></p>
        <FormsDoRecurso
          definicao={OBRAS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeObraAction}
          modo="acoes"
        />
        </>
      }
    />
  );
}
