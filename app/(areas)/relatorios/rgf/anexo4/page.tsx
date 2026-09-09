import { Badge } from "../../../../../components/ui/Badge";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import {
  gerarRgfAnexo4,
  PortaSemBancoError,
  type Anexo4Rgf,
  type LinhaAnexo4,
} from "../../../../../lib/portas/rreo";
import { SeletorQuadrimestre } from "../anexo1/SeletorQuadrimestre";

/**
 * RGF — ANEXO 4: OPERAÇÕES DE CRÉDITO. LRF art. 55, I, "d".
 *
 * ⚠️ Duas colunas: "No Quadrimestre" (o fluxo dentro do quadrimestre) e "Até o Quadrimestre" (o
 * acumulado do ano). O limite de 16% mede o ACUMULADO. A ARO tem limite próprio (7%).
 */
export const dynamic = "force-dynamic";

const QUADRIMESTRES = [1, 2, 3] as const;
type Quad = (typeof QUADRIMESTRES)[number];

export default async function RgfAnexo4Page({
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
      titulo="RGF — Anexo 4: Operações de Crédito"
      subtitulo={`Exercício ${exercicio} · ${quadrimestre}º quadrimestre — LRF art. 55, I, "d"`}
      acoes={<SeletorQuadrimestre quadrimestre={quadrimestre} exercicio={exercicio} />}
    />
  );

  let a4: Anexo4Rgf;
  try {
    a4 = await gerarRgfAnexo4({ exercicio, quadrimestre });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 4"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const semOperacoes = a4.linhas.find((l) => l.chave === "OP_CREDITO")?.valores.ateQuadrimestre === "0.00";

  return (
    <div className="space-y-4">
      {cabecalho}

      {a4.excedeuLimite === true ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--color-status-erro-fg)] bg-[color:var(--color-status-erro-bg)] p-3 text-sm text-[color:var(--color-status-erro-fg)]">
          <strong>Limite do Senado excedido:</strong> as operações de crédito são {a4.percentSobreRcl}% da RCL ajustada, contra um teto de {a4.limiteSenado}%. O ente fica impedido de contratar dívida nova.
        </div>
      ) : a4.emAlerta === true ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-sm text-[color:var(--color-status-alerta-fg)]">
          <strong>Limite de alerta:</strong> as operações de crédito já passaram dos {a4.limiteAlerta}% (art. 59, §1º, III).
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <CardPercent rotulo="% sobre a RCL ajustada (acumulado)" valor={a4.percentSobreRcl} excedeu={a4.excedeuLimite} alerta={a4.emAlerta} semOperacoes={semOperacoes} />
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">Limites</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink)]">Senado (Res. 43/2001): <strong>{a4.limiteSenado}%</strong> · Alerta: <strong>{a4.limiteAlerta}%</strong></p>
          <p className="text-sm text-[color:var(--color-ink)]">ARO (limite próprio): <strong>{a4.aro.limitePercent}%</strong></p>
        </div>
      </div>

      <TabelaDeDados
        colunas={COLUNAS}
        linhas={[...a4.linhas, linhaTotal(a4)]}
        keyDe={(l) => l.chave}
        ehTotal={(l) => l.nivel === "grupo" || l.nivel === "total"}
        recuoDe={(l) => (l.nivel === "subitem" ? 2 : l.nivel === "item" ? 1 : 0)}
        legenda="Valores em R$ · corte pela data do fato · o limite mede o acumulado (Até o Quadrimestre)."
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Antecipação de Receita Orçamentária (ARO)</h2>
        <TabelaDeDados
          colunas={COLUNAS}
          linhas={[{ chave: "ARO", rotulo: "ARO — saldo devedor", nivel: "item" as const, interruptor: true, valores: a4.aro.valores }]}
          keyDe={(l) => l.chave}
          legenda={`Limite próprio: ${a4.aro.limitePercent}% da RCL (art. 38). Sem cadastro de ARO no sistema.`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Outras operações que integram a Dívida Consolidada (art. 29, §1º)</h2>
        <p className="text-xs text-[color:var(--color-ink-3)]">Assunção, reconhecimento e confissão de dívidas — integram a DC, mas NÃO se sujeitam ao limite de contratação.</p>
        <TabelaDeDados
          colunas={COLUNAS}
          linhas={a4.outrasOperacoes}
          keyDe={(l) => l.chave}
          legenda="Sem fato próprio no sistema — linhas nomeadas."
        />
      </section>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas e interruptores</p>
        <ul className="list-disc space-y-1 pl-4">
          {a4.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <RelatoriosRelacionados
        relacoes={[
          {
            href: "/relatorios/rgf/anexo2",
            rotulo: "RGF Anexo 2 — Dívida Consolidada Líquida",
            motivo: "A operação de crédito de hoje é a dívida de amanhã: o ingresso que aqui conta contra o limite de 16% entra no estoque da DCL do Anexo 2.",
          },
          {
            href: "/relatorios/rreo/anexo3",
            rotulo: "RREO Anexo 3 — RCL",
            motivo: "A RCL ajustada que o limite de operações de crédito usa vem daqui — o motor único (regra Siconfi).",
          },
        ]}
      />
    </div>
  );
}

function linhaTotal(a4: Anexo4Rgf): LinhaAnexo4 {
  return { chave: "TOTAL_SUJEITO", rotulo: "TOTAL SUJEITO AO LIMITE (I + II − III)", nivel: "total", interruptor: false, valores: a4.totalSujeitoAoLimite };
}

const COLUNAS: readonly ColunaTabela<LinhaAnexo4>[] = [
  {
    chave: "rotulo",
    cabecalho: "Especificação",
    alinhamento: "esquerda",
    celula: (l) => (
      <span className="inline-flex items-center gap-1.5">
        {l.rotulo}
        {l.interruptor ? <Badge status="alerta">sem cadastro</Badge> : null}
      </span>
    ),
  },
  {
    chave: "no",
    cabecalho: "No Quadrimestre",
    alinhamento: "direita",
    largura: "10rem",
    celula: (l) => <ValorMonetario valor={l.valores.noQuadrimestre} />,
  },
  {
    chave: "ate",
    cabecalho: "Até o Quadrimestre",
    alinhamento: "direita",
    largura: "10rem",
    celula: (l) => <ValorMonetario valor={l.valores.ateQuadrimestre} />,
  },
];

function CardPercent({
  rotulo,
  valor,
  excedeu,
  alerta,
  semOperacoes,
}: {
  readonly rotulo: string;
  readonly valor: string | null;
  readonly excedeu?: boolean | null;
  readonly alerta?: boolean | null;
  readonly semOperacoes?: boolean;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">{rotulo}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">{valor === null ? "—" : `${valor}%`}</span>
        {excedeu === true ? (
          <Badge status="erro">excede 16%</Badge>
        ) : alerta === true ? (
          <Badge status="alerta">alerta (≥14,4%)</Badge>
        ) : valor === null ? (
          <Badge status="alerta">sem RCL</Badge>
        ) : semOperacoes === true ? (
          <Badge status="neutro">sem operação no período</Badge>
        ) : (
          <Badge status="ok">dentro do limite</Badge>
        )}
      </div>
    </div>
  );
}
