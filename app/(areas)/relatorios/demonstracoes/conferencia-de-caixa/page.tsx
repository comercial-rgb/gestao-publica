import { gerarTermoDeCaixa } from "../../../../../lib/portas/demonstrativos-da-pca";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { tabelasDoTermoDeCaixa } from "../../../../../lib/relatorios/tabelas-da-pca";
import { QuadrosDoDocumento, tabelasOuRecusa } from "../QuadrosDoDocumento";
import { lerExercicio } from "../exercicio";

/** V35 — Termo de conferência de caixa e bancos em 31/12 (prestação de contas anual). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function ConferenciaDeCaixaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const { exercicio } = lerExercicio(await searchParams);
  const resultado = await tabelasOuRecusa(() => gerarTermoDeCaixa({ exercicio }), tabelasDoTermoDeCaixa);
  return (
    <QuadrosDoDocumento
      titulo="Conferência de Caixa e Bancos"
      subtitulo="Saldos de 31/12 de cada conta bancária, conferidos contra o extrato"
      exercicio={exercicio}
      rotaPdf="/relatorios/demonstracoes/conferencia-de-caixa/pdf"
      nomeArquivo="conferencia-de-caixa"
      resultado={resultado}
    />
  );
}
