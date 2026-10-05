import { gerarAnexo16 } from "../../../../../lib/portas/demonstrativos-da-pca";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { tabelasDoAnexo16 } from "../../../../../lib/relatorios/tabelas-da-pca";
import { QuadrosDoDocumento, tabelasOuRecusa } from "../QuadrosDoDocumento";
import { lerExercicio } from "../exercicio";

/** V35 — ANEXO 16 — Demonstração da Dívida Fundada (Lei 4.320, art. 98). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function DividaFundadaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const { exercicio } = lerExercicio(await searchParams);
  const resultado = await tabelasOuRecusa(() => gerarAnexo16({ exercicio }), tabelasDoAnexo16);
  return (
    <QuadrosDoDocumento
      titulo="Dívida Fundada"
      subtitulo="Dívida fundada interna e externa (Lei 4.320, art. 98 e Anexo 16)"
      exercicio={exercicio}
      rotaPdf="/relatorios/demonstracoes/divida-fundada/pdf"
      nomeArquivo="divida-fundada"
      resultado={resultado}
    />
  );
}
