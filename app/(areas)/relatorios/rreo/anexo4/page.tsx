import { BotaoCsv } from "../../../../../components/ui/BotaoCsv";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { ehBimestre, gerarRreoAnexo4, PortaSemBancoError } from "../../../../../lib/portas/rreo";
import { csvDasTabelas } from "../../../../../lib/relatorios/tabelas-dos-demonstrativos";
import { tabelasDoRreoAnexo4 } from "../../../../../lib/relatorios/tabelas-do-rreo-anexo4";
import { anoCivil } from "../../../../../packages/datas/index";
import { SecoesDoDocumento } from "../../demonstracoes/QuadrosDoDocumento";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";

/**
 * V35 — RREO ANEXO 4: DEMONSTRATIVO DAS RECEITAS E DESPESAS PREVIDENCIÁRIAS DO RPPS (LRF art. 53, II; MDF 15ª ed.,
 * Tabela 4, pelo mapeamento da STN). Server Component, força-dinâmica.
 */
export const dynamic = "force-dynamic";

const lerInteiro = (v: string | string[] | undefined, padrao: number): number => {
  const bruto = Array.isArray(v) ? v[0] : v;
  return bruto !== undefined && /^\d+$/.test(bruto) ? Number(bruto) : padrao;
};

export default async function RreoAnexo4Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], anoCivil(new Date()));
  const bruto = lerInteiro(sp["bimestre"], 1);
  const bimestre = ehBimestre(bruto) ? bruto : 1;
  const cabecalho = (
    <PageHeader
      titulo="RREO — Anexo 4 · Receitas e Despesas Previdenciárias"
      subtitulo="Regime próprio de previdência dos servidores · LRF art. 53, II · MDF 15ª ed. (STN)"
      acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />}
    />
  );
  try {
    const tabelas = tabelasDoRreoAnexo4(await gerarRreoAnexo4({ exercicio, bimestre }));
    return (
      <div className="space-y-4">
        {cabecalho}
        <div className="flex justify-end gap-2" data-chrome>
          <BotaoCsv csv={csvDasTabelas(tabelas)} nomeArquivo={`rreo-anexo4-${String(exercicio)}-bim${String(bimestre)}.csv`} />
        </div>
        <SecoesDoDocumento tabelas={tabelas} />
      </div>
    );
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível gerar o Anexo 4"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }
}
