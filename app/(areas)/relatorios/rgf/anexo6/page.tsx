import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../../components/ui/Badge";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import {
  gerarRgfAnexo6,
  PortaSemBancoError,
  type Anexo6Rgf,
  type LinhaSimplificada,
} from "../../../../../lib/portas/rreo";
import { SeletorQuadrimestre } from "../anexo1/SeletorQuadrimestre";
import { badgeDaSituacao } from "../../simplificado-ui";

/**
 * RGF — ANEXO 6: DEMONSTRATIVO SIMPLIFICADO DA GESTÃO FISCAL. LRF art. 48.
 *
 * ⚠️ A CAPA do RGF: cada linha é o número de um anexo analítico (o dono), com o Badge do MESMO
 * estado que o anexo de origem exibe — o simplificado nunca discorda do analítico. O detalhe mora lá.
 */
export const dynamic = "force-dynamic";

const QUADRIMESTRES = [1, 2, 3] as const;
type Quad = (typeof QUADRIMESTRES)[number];

export default async function RgfAnexo6Page({
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
      titulo="RGF — Anexo 6: Demonstrativo Simplificado da Gestão Fiscal"
      subtitulo={`Exercício ${exercicio} · ${quadrimestre}º quadrimestre — LRF art. 48`}
      acoes={<SeletorQuadrimestre quadrimestre={quadrimestre} exercicio={exercicio} />}
    />
  );

  let a6: Anexo6Rgf;
  try {
    a6 = await gerarRgfAnexo6({ exercicio, quadrimestre });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 6"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}

      <p className="text-xs text-[color:var(--color-ink-3)]">
        A capa da gestão fiscal: o resultado de cada limite, com VALOR, % sobre a RCL ajustada e
        LIMITE. Cada número é o do anexo analítico indicado, onde o detalhe e a memória de cálculo moram.
      </p>

      <TabelaDeDados
        colunas={COLUNAS}
        linhas={[...a6.linhas]}
        keyDe={(l) => l.chave}
        legenda="Valores em R$ · % e limites sobre a RCL ajustada · o Badge é o mesmo do anexo de origem."
      />

      {a6.blocoDisponibilidade !== null ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Disponibilidade de caixa e restos a pagar (3º quadrimestre)
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <CardValor rotulo="Disponibilidade líquida (antes da inscrição de RPNP)" valor={a6.blocoDisponibilidade.disponibilidadeAntesRpnp} />
            <CardValor rotulo="RP empenhados e não liquidados do exercício" valor={a6.blocoDisponibilidade.rpnpDoExercicio} />
            <CardValor rotulo="Disponibilidade após a inscrição" valor={a6.blocoDisponibilidade.disponibilidadeApos} />
          </div>
          <p className="text-xs text-[color:var(--color-ink-3)]">Do RGF Anexo 5, consolidado por vinculação. Só apurado no último quadrimestre.</p>
        </section>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas</p>
        <ul className="list-disc space-y-1 pl-4">
          {a6.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <RelatoriosRelacionados
        relacoes={[
          { href: "/relatorios/rgf/anexo1", rotulo: "RGF Anexo 1 — Despesa com Pessoal", motivo: "O detalhe da despesa com pessoal por Poder mora lá." },
          { href: "/relatorios/rgf/anexo2", rotulo: "RGF Anexo 2 — Dívida Consolidada Líquida", motivo: "A memória da DCL e das deduções mora lá." },
          { href: "/relatorios/rgf/anexo4", rotulo: "RGF Anexo 4 — Operações de Crédito", motivo: "O detalhe das operações de crédito e da ARO mora lá." },
        ]}
      />
    </div>
  );
}

function CardValor({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">{rotulo}</p>
      <div className="mt-1 text-xl font-semibold tabular text-[color:var(--color-ink)]"><ValorMonetario valor={valor} /></div>
    </div>
  );
}

const COLUNAS: readonly ColunaTabela<LinhaSimplificada>[] = [
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
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valor} /> },
  { chave: "percentual", cabecalho: "% s/ RCL ajustada", alinhamento: "direita", largura: "8rem", celula: (l) => (l.percentual === null ? "—" : `${l.percentual}%`) },
  { chave: "limite", cabecalho: "Limite", alinhamento: "direita", largura: "6rem", celula: (l) => (l.limite === null ? "—" : `${l.limite}%`) },
  {
    chave: "situacao",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    largura: "8rem",
    celula: (l) => {
      const b = badgeDaSituacao(l.situacao);
      return b === null ? <span className="text-[color:var(--color-ink-3)]">—</span> : <Badge status={b.status as StatusBadge}>{b.rotulo}</Badge>;
    },
  },
  { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "8rem", celula: (l) => (l.fonteHref === "" ? l.fonte : <Link href={l.fonteHref} className="text-[color:var(--color-primary)] hover:underline">{l.fonte}</Link>) },
];
