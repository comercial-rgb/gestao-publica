import { PageHeader } from "../../../../../components/ui/PageHeader";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { painelDaPoliticaDePessoal } from "../../../../../lib/portas/politica-de-pessoal";
import { FormPolitica } from "./FormPolitica";

/**
 * A POLÍTICA DE PUBLICAÇÃO DE PESSOAL (V11 V4.2) — a tela interna que decide o que o portal
 * público mostra por servidor. ⚠️ Imports RELATIVOS na UI. `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_TRANSPARENCIA");
  const painel = await painelDaPoliticaDePessoal();
  return (
    <>
      <PageHeader
        titulo="Política de publicação de pessoal"
        subtitulo="Define quais dados individuais de servidores o portal público pode exibir."
      />
      <FormPolitica p={painel} />
    </>
  );
}
