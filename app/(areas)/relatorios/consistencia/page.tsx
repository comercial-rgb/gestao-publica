import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  gerarConsistencia,
  gerarDiagnosticoPreEnvio,
  PortaSemBancoError,
  type DiagnosticoPreEnvio,
  type EscopoConsistencia,
  type Verificacao,
} from "../../../../lib/portas/consistencia";
import { SeletorConsistencia } from "./SeletorConsistencia";
import { janelaCivilDoAno } from "../../../../packages/datas/index";

/**
 * RELATÓRIO DE CONSISTÊNCIA (TR 5.128–5.131 · 7.27) — INTERNO, atrás do shell autenticado.
 *
 * ⚠️ NÃO vai para a área pública (a lista da 7.15): consistência é ferramenta de CONFERÊNCIA do
 * ente antes de publicar/enviar — mostra onde os números NÃO batem. Publicá-la seria expor o
 * trabalho interno, não o demonstrativo oficial. O PDF (se gerado) sai pelo builder da 7.15, mas por
 * uma rota autenticada — nunca pela pública.
 *
 * A tríade tem SEMÁFORO: verde OK, vermelho DIVERGE (com os dois lados e a diferença), âmbar
 * SEM_DADO (o interruptor nomeado — cadastro ausente ou motor inexistente).
 */
export const dynamic = "force-dynamic";

const ESCOPOS: readonly EscopoConsistencia[] = ["MENSAL", "PLANEJAMENTO", "ANUAL"];
const ehEscopo = (v: string): v is EscopoConsistencia => (ESCOPOS as readonly string[]).includes(v);

export default async function ConsistenciaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const um = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
  const ex = Number.parseInt(um(sp["exercicio"]) ?? "2026", 10);
  const exercicio = Number.isInteger(ex) ? ex : 2026;
  const escBruto = um(sp["escopo"]) ?? "PRE_ENVIO";
  const preEnvio = escBruto === "PRE_ENVIO";
  const escopo: EscopoConsistencia = ehEscopo(escBruto) ? escBruto : "MENSAL";
  // O corte: fim do exercício (31/12). Suficiente para o balancete acumulado e os anuais.
  // ⚠️ O CORTE É O ÚLTIMO INSTANTE CIVIL DO EXERCÍCIO, não 23:59:59 em Greenwich —
  // que no fuso do ente é 20:59:59, três horas antes do fim do ano.
  const corte = janelaCivilDoAno(exercicio).fim;

  const cabecalho = (
    <PageHeader
      titulo="Relatório de Consistência"
      subtitulo={`Exercício ${exercicio} · ${preEnvio ? "Diagnóstico pré-envio (MSC/Siconfi)" : escopo}`}
      acoes={<SeletorConsistencia exercicio={exercicio} escopo={escBruto} />}
    />
  );

  let verificacoes: readonly Verificacao[];
  let diagnostico: DiagnosticoPreEnvio | null = null;
  try {
    if (preEnvio) {
      diagnostico = await gerarDiagnosticoPreEnvio({ exercicio, corte });
      verificacoes = diagnostico.verificacoes;
    } else {
      verificacoes = await gerarConsistencia({ exercicio, corte, escopo });
    }
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível rodar as verificações"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}

      {diagnostico !== null ? (
        <div
          role="status"
          className={`rounded-[var(--radius-md)] border p-3 text-sm ${
            diagnostico.prontoParaEnvio
              ? "border-[color:var(--color-status-ok-fg)] bg-[color:var(--color-status-ok-bg)] text-[color:var(--color-status-ok-fg)]"
              : "border-[color:var(--color-status-erro-fg)] bg-[color:var(--color-status-erro-bg)] text-[color:var(--color-status-erro-fg)]"
          }`}
        >
          <strong>{diagnostico.prontoParaEnvio ? "Pronto para envio: SIM" : "Pronto para envio: NÃO"}</strong>
          {diagnostico.prontoParaEnvio ? (
            <span> — nenhuma divergência de números. {diagnostico.semDados.length > 0 ? `${diagnostico.semDados.length} verificação(ões) sem cadastro (não travam, mas confira).` : ""}</span>
          ) : (
            <span> — o que trava: {diagnostico.divergencias.join("; ")}.</span>
          )}
        </div>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cada verificação <strong>visita</strong> a identidade do seu dono e lê os dois lados — não
        recalcula. <strong>Verde</strong> = bate; <strong>vermelho</strong> = não bate (com a
        diferença); <strong>âmbar</strong> = sem dado (cadastro ausente ou motor inexistente — não é
        erro, mas também não é OK). O link "onde mora" leva ao demonstrativo dono.
      </div>

      <TabelaDeDados<Verificacao>
        colunas={COLUNAS}
        linhas={[...verificacoes]}
        keyDe={(v) => v.chave}
        legenda="A consistência é interna: mostra onde conferir antes de publicar."
      />
    </div>
  );
}

function tomDoResultado(r: Verificacao["resultado"]): StatusBadge {
  return r === "OK" ? "ok" : r === "DIVERGE" ? "erro" : "alerta";
}

const COLUNAS: readonly ColunaTabela<Verificacao>[] = [
  {
    chave: "resultado",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (v) => <Badge status={tomDoResultado(v.resultado)}>{v.resultado === "SEM_DADO" ? "sem dado" : v.resultado === "DIVERGE" ? "diverge" : "ok"}</Badge>,
  },
  {
    chave: "titulo",
    cabecalho: "Verificação",
    alinhamento: "esquerda",
    celula: (v) => (
      <span>
        {v.titulo}
        {v.detalhe !== undefined ? <span className="block text-xs text-[color:var(--color-ink-3)]">{v.detalhe}</span> : null}
      </span>
    ),
  },
  {
    chave: "esquerda",
    cabecalho: "Esquerda",
    alinhamento: "direita",
    largura: "9rem",
    celula: (v) => (v.esquerda === "—" || v.esquerda === "fecha" ? <span className="text-[color:var(--color-ink-3)]">{v.esquerda}</span> : <ValorMonetario valor={v.esquerda} />),
  },
  {
    chave: "direita",
    cabecalho: "Direita",
    alinhamento: "direita",
    largura: "9rem",
    celula: (v) => (v.direita === "—" || v.direita === "fecha" ? <span className="text-[color:var(--color-ink-3)]">{v.direita}</span> : <ValorMonetario valor={v.direita} />),
  },
  {
    chave: "diferenca",
    cabecalho: "Diferença",
    alinhamento: "direita",
    largura: "9rem",
    celula: (v) => (v.diferenca === "—" ? <span className="text-[color:var(--color-ink-3)]">—</span> : <ValorMonetario valor={v.diferenca} />),
  },
  {
    chave: "fonte",
    cabecalho: "Onde mora",
    alinhamento: "esquerda",
    largura: "12rem",
    celula: (v) => (v.fonteHref === "" ? <span className="text-[color:var(--color-ink-3)]">{v.fonte}</span> : <Link href={v.fonteHref} className="text-[color:var(--color-primary)] hover:underline">{v.fonte}</Link>),
  },
];
