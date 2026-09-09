import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../../components/ui/Badge";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import {
  gerarRreoAnexo14,
  PortaSemBancoError,
  type Anexo14Rreo,
  type LinhaSimplificada,
} from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";
import { badgeDaSituacao } from "../../simplificado-ui";

/**
 * RREO — ANEXO 14: DEMONSTRATIVO SIMPLIFICADO DO RREO. LRF art. 48 · art. 52.
 *
 * ⚠️ A CAPA do RREO: balanço orçamentário, resultados, restos a pagar, mínimos (educação/saúde) e
 * RCL — cada um lido do seu anexo analítico. O bloco RPPS é DECLARADO ausente (Anexo 4 pendente),
 * não publicado zerado. O detalhe mora em cada anexo de origem.
 */
export const dynamic = "force-dynamic";

export default async function RreoAnexo14Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const um = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
  const ex = Number.parseInt(um(sp["exercicio"]) ?? "2026", 10);
  const exercicio = Number.isInteger(ex) ? ex : 2026;
  const b = Number.parseInt(um(sp["bimestre"]) ?? "1", 10);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(b as 1) ? (b as 1) : 1;

  const cabecalho = (
    <PageHeader
      titulo="RREO — Anexo 14: Demonstrativo Simplificado"
      subtitulo={`Exercício ${exercicio} · ${bimestre}º bimestre — LRF art. 48`}
      acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />}
    />
  );

  let a14: Anexo14Rreo;
  try {
    a14 = await gerarRreoAnexo14({ exercicio, bimestre });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 14"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}

      <p className="text-xs text-[color:var(--color-ink-3)]">
        A capa do RREO: cada número é o do anexo analítico indicado, onde o detalhe e a memória de
        cálculo moram. Os mínimos de educação e saúde e os resultados vêm dos seus demonstrativos próprios.
      </p>

      <TabelaDeDados
        colunas={COLUNAS}
        linhas={[...a14.linhas]}
        keyDe={(l) => l.chave}
        legenda="Valores em R$ · % e limites conforme cada anexo · o Badge é o mesmo do anexo de origem."
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas e pendências</p>
        <ul className="list-disc space-y-1 pl-4">
          {a14.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <RelatoriosRelacionados
        relacoes={[
          { href: "/relatorios/rreo/anexo1", rotulo: "RREO Anexo 1 — Balanço Orçamentário", motivo: "As receitas e despesas em detalhe moram lá." },
          { href: "/relatorios/rreo/anexo6", rotulo: "RREO Anexo 6 — Resultado Primário e Nominal", motivo: "A memória dos resultados (e o furo do XXV) mora lá." },
          { href: "/relatorios/rreo/anexo3", rotulo: "RREO Anexo 3 — RCL", motivo: "A composição da RCL mora lá." },
        ]}
      />
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
        {l.interruptor ? <Badge status="alerta">pendente</Badge> : null}
      </span>
    ),
  },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", largura: "9rem", celula: (l) => (l.valor === "—" ? <span className="text-[color:var(--color-ink-3)]">—</span> : <ValorMonetario valor={l.valor} />) },
  { chave: "percentual", cabecalho: "%", alinhamento: "direita", largura: "6rem", celula: (l) => (l.percentual === null ? "—" : `${l.percentual}%`) },
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
