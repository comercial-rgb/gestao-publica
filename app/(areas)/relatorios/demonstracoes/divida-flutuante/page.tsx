import { gerarAnexo17 } from "../../../../../lib/portas/demonstrativos-da-pca";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { tabelasDoAnexo17 } from "../../../../../lib/relatorios/tabelas-da-pca";
import { QuadrosDoDocumento, tabelasOuRecusa } from "../QuadrosDoDocumento";
import { lerExercicio } from "../exercicio";

/** V35 — ANEXO 17 — Demonstração da Dívida Flutuante (Lei 4.320, art. 92). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function DividaFlutuantePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const { exercicio } = lerExercicio(await searchParams);
  const resultado = await tabelasOuRecusa(() => gerarAnexo17({ exercicio }), tabelasDoAnexo17);
  return (
    <QuadrosDoDocumento
      titulo="Dívida Flutuante"
      subtitulo="Restos a pagar, serviços da dívida, depósitos e débitos de tesouraria (Lei 4.320, art. 92 e Anexo 17)"
      exercicio={exercicio}
      rotaPdf="/relatorios/demonstracoes/divida-flutuante/pdf"
      nomeArquivo="divida-flutuante"
      resultado={resultado}
    />
  );
}
