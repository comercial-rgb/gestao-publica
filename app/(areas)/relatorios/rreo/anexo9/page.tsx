import { BotaoCsv } from "../../../../../components/ui/BotaoCsv";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { ehBimestre, gerarRreoAnexo9, PortaSemBancoError } from "../../../../../lib/portas/rreo";
import { csvDasTabelas } from "../../../../../lib/relatorios/tabelas-dos-demonstrativos";
import { tabelasDoRreoAnexo9 } from "../../../../../lib/relatorios/tabelas-do-rreo-anexo9";
import { anoCivil } from "../../../../../packages/datas/index";
import { SecoesDoDocumento } from "../../demonstracoes/QuadrosDoDocumento";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";

/**
 * V35 — RREO ANEXO 9: OPERAÇÕES DE CRÉDITO E DESPESAS DE CAPITAL, a regra de ouro (CF art. 167, III; LRF art. 53, § 1º, I;
 * MDF 15ª ed., Tabela 9). Server Component, força-dinâmica.
 */
export const dynamic = "force-dynamic";

const lerInteiro = (v: string | string[] | undefined, padrao: number): number => {
  const bruto = Array.isArray(v) ? v[0] : v;
  return bruto !== undefined && /^\d+$/.test(bruto) ? Number(bruto) : padrao;
};

export default async function RreoAnexo9Page({
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
      titulo="RREO — Anexo 9 · Operações de Crédito e Despesas de Capital"
      subtitulo="Regra de ouro · CF art. 167, III · LRF art. 53, § 1º, I · MDF 15ª ed. (STN)"
      acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />}
    />
  );
  try {
    const tabelas = tabelasDoRreoAnexo9(await gerarRreoAnexo9({ exercicio, bimestre }));
    return (
      <div className="space-y-4">
        {cabecalho}
        <div className="flex justify-end gap-2" data-chrome>
          <BotaoCsv csv={csvDasTabelas(tabelas)} nomeArquivo={`rreo-anexo9-${String(exercicio)}-bim${String(bimestre)}.csv`} />
        </div>
        <SecoesDoDocumento tabelas={tabelas} />
      </div>
    );
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível gerar o Anexo 9"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }
}
