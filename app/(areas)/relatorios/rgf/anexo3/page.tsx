import { Badge } from "../../../../../components/ui/Badge";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import {
  gerarRgfAnexo3,
  PortaSemBancoError,
  type Anexo3Rgf,
} from "../../../../../lib/portas/rreo";
import { SeletorQuadrimestre } from "../anexo1/SeletorQuadrimestre";

/**
 * RGF — ANEXO 3: GARANTIAS E CONTRAGARANTIAS. LRF art. 55, I, "c".
 *
 * ⚠️ ESTE DEMONSTRATIVO ZERADO É VÁLIDO, NÃO É ERRO. O município não avalizou dívida de ninguém —
 * as linhas existem, zeradas e nomeadas ("sem cadastro"). Publicar zerado é o ente declarando "não
 * concedo garantia", que é diferente de "o sistema não sabe". Por isso NÃO há EstadoVazio aqui: o
 * quadro se mostra inteiro, com o badge do interruptor.
 */
export const dynamic = "force-dynamic";

const QUADRIMESTRES = [1, 2, 3] as const;
type Quad = (typeof QUADRIMESTRES)[number];

export default async function RgfAnexo3Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const um = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
  const ex = Number.parseInt(um(sp["exercicio"]) ?? "2026", 10);
  const exercicio = Number.isInteger(ex) ? ex : 2026;
  const q = Number.parseInt(um(sp["quadrimestre"]) ?? "3", 10);
  const quadrimestre: Quad = (QUADRIMESTRES as readonly number[]).includes(q) ? (q as Quad) : 3;

  const cabecalho = (
    <PageHeader
      titulo="RGF — Anexo 3: Garantias e Contragarantias"
      subtitulo={`Exercício ${exercicio} · ${quadrimestre}º quadrimestre — LRF art. 55, I, "c"`}
      acoes={<SeletorQuadrimestre quadrimestre={quadrimestre} exercicio={exercicio} />}
    />
  );

  let a3: Anexo3Rgf;
  try {
    a3 = await gerarRgfAnexo3({ exercicio, quadrimestre });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 3"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const ref = a3.colunas[a3.colunas.length - 1]!.valores;

  // As linhas do quadro: garantias (I–IV) + total (V), depois contragarantias (IX–XII) + total (XIII).
  const linhasGarantia = montarLinhas(a3, "garantias", "totalGarantias", "GARANTIAS CONCEDIDAS (V)");
  const linhasContra = montarLinhas(a3, "contragarantias", "totalContragarantias", "CONTRAGARANTIAS RECEBIDAS (XIII)");

  return (
    <div className="space-y-4">
      {cabecalho}

      {ref.excedeuLimite === true ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--color-status-erro-fg)] bg-[color:var(--color-status-erro-bg)] p-3 text-sm text-[color:var(--color-status-erro-fg)]">
          <strong>Limite do Senado excedido:</strong> as garantias são {ref.percentGarantias}% da RCL ajustada, contra um teto de {a3.limiteSenado}%.
        </div>
      ) : ref.emAlerta === true ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-sm text-[color:var(--color-status-alerta-fg)]">
          <strong>Limite de alerta:</strong> as garantias já passaram dos {a3.limiteAlerta}% (art. 59, §1º, III).
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <CardPercent
          rotulo="% das garantias sobre a RCL ajustada"
          valor={ref.percentGarantias}
          excedeu={ref.excedeuLimite}
          alerta={ref.emAlerta}
          semCadastro={ref.totalGarantias === "0.00"}
        />
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">Limites</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink)]">Senado (Res. 43/2001): <strong>{a3.limiteSenado}%</strong></p>
          <p className="text-sm text-[color:var(--color-ink)]">Alerta (art. 59, §1º, III): <strong>{a3.limiteAlerta}%</strong></p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Garantias concedidas</h2>
        <TabelaDeDados colunas={COLUNAS} linhas={linhasGarantia} keyDe={(l) => l.chave} ehTotal={(l) => l.total} legenda="Valores em R$ · Externas + Internas · corte pela data do fato." />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Contragarantias recebidas (espelho)</h2>
        <TabelaDeDados colunas={COLUNAS} linhas={linhasContra} keyDe={(l) => l.chave} ehTotal={(l) => l.total} legenda="Valores em R$ · o espelho das garantias." />
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Medidas corretivas</h2>
        <p className="text-xs text-[color:var(--color-ink-3)]">
          {a3.medidasCorretivas === null
            ? "Sem excesso de garantias no período — não há medida corretiva a informar."
            : a3.medidasCorretivas === ""
              ? "O layout pede medidas corretivas quando o limite é excedido; descreva-as aqui."
              : a3.medidasCorretivas}
        </p>
      </section>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas e interruptores</p>
        <ul className="list-disc space-y-1 pl-4">
          {a3.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <RelatoriosRelacionados
        relacoes={[
          {
            href: "/relatorios/rgf/anexo2",
            rotulo: "RGF Anexo 2 — Dívida Consolidada Líquida",
            motivo: "A garantia é dívida de terceiro que o ente pode ter de honrar; se honrada, vira dívida própria e aparece na DCL do Anexo 2. A RCL ajustada é a mesma.",
          },
          {
            href: "/relatorios/rreo/anexo3",
            rotulo: "RREO Anexo 3 — RCL",
            motivo: "A RCL ajustada que o limite de garantias usa vem daqui — o motor único (regra Siconfi).",
          },
        ]}
      />
    </div>
  );
}

type LinhaTabela = {
  readonly chave: string;
  readonly rotulo: string;
  readonly total: boolean;
  readonly semCadastro: boolean;
  readonly externas: readonly string[];
  readonly internas: readonly string[];
  readonly totais: readonly string[];
};

function montarLinhas(
  a3: Anexo3Rgf,
  campo: "garantias" | "contragarantias",
  totalCampo: "totalGarantias" | "totalContragarantias",
  rotuloTotal: string
): readonly LinhaTabela[] {
  const defs = a3.colunas[a3.colunas.length - 1]!.valores[campo];
  const linhas: LinhaTabela[] = defs.map((g, idx) => ({
    chave: g.chave,
    rotulo: g.rotulo,
    total: false,
    semCadastro: true, // sem entidade de garantia (Passo 0.1)
    externas: a3.colunas.map((c) => c.valores[campo][idx]!.externas),
    internas: a3.colunas.map((c) => c.valores[campo][idx]!.internas),
    totais: a3.colunas.map((c) => c.valores[campo][idx]!.total),
  }));
  linhas.push({
    chave: totalCampo,
    rotulo: rotuloTotal,
    total: true,
    semCadastro: false,
    externas: a3.colunas.map(() => ""),
    internas: a3.colunas.map(() => ""),
    totais: a3.colunas.map((c) => c.valores[totalCampo]),
  });
  return linhas;
}

const COLUNAS: readonly ColunaTabela<LinhaTabela>[] = [
  {
    chave: "rotulo",
    cabecalho: "Especificação",
    alinhamento: "esquerda",
    celula: (l) => (
      <span className={`inline-flex items-center gap-1.5 ${l.total ? "font-medium" : ""}`}>
        {l.rotulo}
        {l.semCadastro ? <Badge status="alerta">sem cadastro</Badge> : null}
      </span>
    ),
  },
  {
    chave: "totais",
    cabecalho: "Total (Externas + Internas)",
    alinhamento: "direita",
    largura: "12rem",
    // No corte de referência (a última coluna). O eixo temporal fica na legenda.
    celula: (l) => <ValorMonetario valor={l.totais[l.totais.length - 1] ?? "0.00"} />,
  },
];

function CardPercent({
  rotulo,
  valor,
  excedeu,
  alerta,
  semCadastro,
}: {
  readonly rotulo: string;
  readonly valor: string | null;
  readonly excedeu?: boolean | null;
  readonly alerta?: boolean | null;
  readonly semCadastro?: boolean;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">{rotulo}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">{valor === null ? "—" : `${valor}%`}</span>
        {excedeu === true ? (
          <Badge status="erro">excede 22%</Badge>
        ) : alerta === true ? (
          <Badge status="alerta">alerta (≥19,8%)</Badge>
        ) : valor === null ? (
          <Badge status="alerta">sem RCL</Badge>
        ) : semCadastro === true ? (
          <Badge status="neutro">sem garantia concedida</Badge>
        ) : (
          <Badge status="ok">dentro do limite</Badge>
        )}
      </div>
    </div>
  );
}
