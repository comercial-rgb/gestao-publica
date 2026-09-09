import { Badge } from "../../../../../components/ui/Badge";
import { Card, CardEstatistica } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { gerarRreoAnexo13, PortaSemBancoError, type Anexo13, type LinhaContratoPPP } from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";

/** RREO — Anexo 13 · PPP (Lei 11.079/2004). Server Component, força-dinâmica. Esqueleto honesto. */
export const dynamic = "force-dynamic";

export default async function RreoAnexo13Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], 2026);
  const b = lerInteiro(sp["bimestre"], 1);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(b as 1) ? (b as 1) : 1;

  const cabecalho = (
    <PageHeader titulo="RREO — Anexo 13 · Parcerias Público-Privadas" subtitulo="PPP · Lei 11.079/2004 art. 28 · teto de 5% da RCL" acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />} />
  );

  let dados: Anexo13;
  try {
    dados = await gerarRreoAnexo13({ exercicio, bimestre });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 13"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }

  return (
    <div className="space-y-6">
      {cabecalho}

      {dados.contratos.length === 0 ? (
        <EstadoVazio
          titulo="Sem contratos de PPP"
          descricao="O ente não possui parceria público-privada ativa no período. Quando houver contrato, o limite do art. 28 (5% da RCL) é apurado aqui."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <CardEstatistica rotulo="Contraprestações anuais"><ValorMonetario valor={dados.totalContraprestacoes} /></CardEstatistica>
            <CardEstatistica rotulo="RCL" nota="Base do teto (Anexo 3)"><ValorMonetario valor={dados.rcl} /></CardEstatistica>
            <Card>
              <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">% da RCL</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">{dados.percentualDaRcl.replace(".", ",")}%</span>
                <Badge status={dados.dentroDoLimite ? "ok" : "erro"}>{dados.dentroDoLimite ? "≤ 5%" : "acima de 5%"}</Badge>
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">Teto: {dados.limitePercentual.replace(".", ",")}%</p>
            </Card>
          </div>

          <TabelaDeDados<LinhaContratoPPP>
            colunas={COLUNAS}
            linhas={dados.contratos}
            keyDe={(l) => l.id}
            legenda="Valores em R$ · contratos vigentes no exercício."
          />
        </>
      )}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">
          {dados.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <RelatoriosRelacionados relacoes={[{ href: "/relatorios/rreo/anexo3", rotulo: "Anexo 3 — RCL", motivo: "O teto de 5% das PPP usa a mesma RCL do Anexo 3." }]} />
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}

const COLUNAS: readonly ColunaTabela<LinhaContratoPPP>[] = [
  { chave: "numero", cabecalho: "Contrato", alinhamento: "esquerda", largura: "6rem", celula: (l) => l.numero },
  { chave: "objeto", cabecalho: "Objeto", alinhamento: "esquerda", celula: (l) => l.objeto },
  { chave: "parceiro", cabecalho: "Parceiro Privado", alinhamento: "esquerda", celula: (l) => l.parceiroPrivado },
  { chave: "vig", cabecalho: "Vigência", alinhamento: "centro", largura: "7rem", celula: (l) => l.vigencia },
  { chave: "vg", cabecalho: "Valor Global", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valorGlobal} /> },
  { chave: "ca", cabecalho: "Contraprestação Anual", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.contraprestacaoAnual} /> },
];
