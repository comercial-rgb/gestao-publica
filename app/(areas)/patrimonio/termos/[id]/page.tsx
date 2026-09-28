import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { TERMOS_PATRIMONIAIS } from "../../../../../lib/portas/recursos/termos";
import { verTermo } from "../../../../../lib/portas/recursos/termos-dados";
import { EXTENSOES_ACEITAS, lerAnexosDoTermo, TAMANHO_MAXIMO_BYTES } from "../../../../../lib/portas/documentos";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { FormAnexo } from "../../../documentos/FormAnexo";

/**
 * O detalhe do termo: dados, os bens (na aba de histórico, cada um com link) e o PDF em
 * "relacionados". Sem ações — o termo é imutável; corrigir é emitir outro.
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
  const consulta = lerConsulta(TERMOS_PATRIMONIAIS, await searchParams);
  const detalhe = await verTermo(id);
  if (detalhe === null) notFound();
  // V4 (§5): o termo ASSINADO — digitalizado e anexado ao termo; o sha256 é conferido na entrega.
  const anexos = await lerAnexosDoTermo(id);
  const abaDeAnexos = (
    <div>
      <p className="mb-3 text-sm text-[color:var(--color-ink-2)]">
        Anexe o termo assinado e digitalizado. A integridade de cada arquivo é verificada a cada
        acesso; um arquivo alterado após o envio não é disponibilizado.
      </p>
      <ListaDeAnexos anexos={anexos} />
      <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
        <FormAnexo dono={{ termoPatrimonialId: id }} accept={EXTENSOES_ACEITAS} tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES} rotulo="Anexar o termo assinado" />
      </div>
    </div>
  );
  return (
    <DetalheDeRecurso
      definicao={TERMOS_PATRIMONIAIS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      anexos={abaDeAnexos}
      acoes={null}
    />
  );
}
