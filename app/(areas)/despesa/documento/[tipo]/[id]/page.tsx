import { notFound, redirect } from "next/navigation";
import { exigirLeituraEmAlgumEscopo } from "../../../../../../lib/portas/leitura";
import { empenhoDoDocumento } from "../../../../../../lib/portas/documento-da-despesa";

/**
 * DO LANÇAMENTO AO DOCUMENTO DA DESPESA (V31) — um endereço só para "abrir a origem deste valor".
 *
 * O lançamento guarda `origemTipo` e `origemId`; liquidação e pagamento não têm página própria porque o
 * dossiê do EMPENHO já mostra a cadeia inteira (liquidações, pagamentos, retenções e lançamentos). Esta
 * rota acha o empenho dono do documento e leva ao dossiê, na âncora do documento.
 *
 * ⚠️ GET SEM EFEITO: só lê e redireciona. A autorização do registro é a do dossiê, que confere a unidade
 * ao abrir; aqui se exige a leitura da despesa em algum escopo, para não responder a quem não lê despesa.
 */
export const dynamic = "force-dynamic";

export default async function DocumentoDaDespesa({ params }: { readonly params: Promise<{ readonly tipo: string; readonly id: string }> }): Promise<never> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_DESPESA");
  const { tipo, id } = await params;
  const destino = await empenhoDoDocumento(tipo, id);
  if (destino === null) notFound();
  redirect(destino);
}
