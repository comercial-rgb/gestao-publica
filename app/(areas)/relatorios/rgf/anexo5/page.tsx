import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { BotaoCsvDasTabelas } from "../../../../../components/ui/BotaoCsvDasTabelas";
import { BotaoImprimir } from "../../../../../components/ui/BotaoImprimir";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import {
  TabelaDeDados,
  type ColunaTabela,
  type GrupoColuna,
} from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarRgfAnexo5,
  PortaSemBancoError,
  type Anexo5,
  type LinhaAnexo5,
} from "../../../../../lib/portas/rreo";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
/**
 * RGF — ANEXO 5: DISPONIBILIDADE DE CAIXA E RESTOS A PAGAR. LRF art. 55, III, "a".
 *
 * ⚠️ A INFORMAÇÃO MAIS IMPORTANTE DESTA PÁGINA É O NEGATIVO. É ele que diz que o ente
 * não pode inscrever RPNP naquela fonte — e é por fonte, nunca pelo total: o superávit
 * da fonte livre não socorre um FUNDEB furado, porque aquele dinheiro é carimbado.
 */
export const dynamic = "force-dynamic";

const QUADRIMESTRES = [1, 2, 3] as const;
type Quad = (typeof QUADRIMESTRES)[number];

export default async function RgfAnexo5Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const um = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const ex = Number.parseInt(um(sp["exercicio"]) ?? "2026", 10);
  const exercicio = Number.isInteger(ex) ? ex : 2026;
  const q = Number.parseInt(um(sp["quadrimestre"]) ?? "3", 10);
  const quadrimestre: Quad = (QUADRIMESTRES as readonly number[]).includes(q)
    ? (q as Quad)
    : 3;

  const cabecalho = (
    <PageHeader acoes={<span className="flex gap-2"><BotaoCsvDasTabelas nomeArquivo="rgf-anexo5.csv" /><BotaoImprimir /></span>}
      titulo="RGF — Anexo 5: Disponibilidade de Caixa e Restos a Pagar"
      subtitulo={`Exercício ${exercicio} · ${quadrimestre}º quadrimestre — LRF art. 55, III, "a"`}
    />
  );

  let a5: Anexo5;
  try {
    a5 = await gerarRgfAnexo5({ exercicio, quadrimestre });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível gerar o Anexo 5"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  if (a5.linhas.length === 0) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo="Sem movimento financeiro"
          descricao={`Não há fonte com disponibilidade de caixa ou obrigação financeira no exercício ${exercicio}.`}
        />
      </div>
    );
  }

  // Recursos NÃO VINCULADOS em bloco separado — é exigência do layout, e faz sentido:
  // o dinheiro livre é o único que o ente pode remanejar.
  const naoVinculados = a5.linhas.filter((l) => !l.vinculado);
  const vinculados = a5.linhas.filter((l) => l.vinculado);

  return (
    <div className="space-y-4">
      {cabecalho}

      {a5.fontesInsuficientes.length > 0 ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-erro-fg)] bg-[color:var(--color-status-erro-bg)] p-3 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          <strong>Insuficiência de caixa em {a5.fontesInsuficientes.length} fonte(s):</strong>{" "}
          {a5.fontesInsuficientes.join(", ")}. Conforme as normas da STN, o ente{" "}
          <strong>não pode inscrever restos a pagar não processados</strong> nessas
          vinculações, e o superávit de outras fontes não pode ser utilizado para cobri-las.
        </div>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A <strong>disponibilidade bruta</strong> inclui os valores retidos de terceiros; a
        obrigação de repassá-los consta em <strong>demais obrigações financeiras</strong>.
        Valores negativos (entre parênteses) indicam <strong>insuficiência de caixa</strong>.
      </div>

      {naoVinculados.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Recursos não vinculados
          </h2>
          <TabelaDeDados
            colunas={COLUNAS}
            grupos={GRUPOS}
            linhas={naoVinculados}
            keyDe={(l) => l.fonte}
            legenda="Recursos de livre aplicação pelo ente."
          />
        </section>
      ) : null}

      {vinculados.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Recursos vinculados
          </h2>
          <TabelaDeDados
            colunas={COLUNAS}
            grupos={GRUPOS}
            linhas={vinculados}
            keyDe={(l) => l.fonte}
            legenda={`${vinculados.length} vinculação(ões) · apuração individual por vinculação, conforme a STN.`}
          />
        </section>
      ) : null}

      <RelatoriosRelacionados
        relacoes={[
          {
            href: "/relatorios/rreo/anexo7",
            rotulo: "RREO Anexo 7 — Restos a Pagar",
            motivo:
              "As inscrições das colunas (b) e (d) são detalhadas por Poder e órgão no Anexo 7.",
          },
          {
            href: "/relatorios/rgf/anexo1",
            rotulo: "RGF Anexo 1 — Despesa com Pessoal",
            motivo:
              "Os dois compõem o mesmo Relatório de Gestão Fiscal do quadrimestre (LRF art. 55).",
          },
        ]}
      />
    </div>
  );
}

const GRUPOS: readonly GrupoColuna[] = [
  { rotulo: "", colSpan: 2 },
  { rotulo: "RP Liquidados e Não Pagos", colSpan: 2 },
  { rotulo: "Obrigações Financeiras", colSpan: 2 },
  { rotulo: "", colSpan: 4 },
];

/** Uma coluna de dinheiro — negativo já sai em parênteses e vermelho no ValorMonetario. */
const cifra = (
  chave: string,
  cabecalho: string,
  ler: (l: LinhaAnexo5) => string
): ColunaTabela<LinhaAnexo5> => ({
  chave,
  cabecalho,
  alinhamento: "direita",
  largura: "8rem",
  celula: (l) => <ValorMonetario valor={ler(l)} />,
});

const COLUNAS: readonly ColunaTabela<LinhaAnexo5>[] = [
  {
    chave: "fonte",
    cabecalho: "Fonte",
    alinhamento: "esquerda",
    largura: "4rem",
    celula: (l) => l.fonte,
  },
  {
    chave: "descricao",
    cabecalho: "Destinação",
    alinhamento: "esquerda",
    celula: (l) => l.descricao,
  },
  cifra("b", "(b) Exerc. anteriores", (l) => l.rpLiquidadosAnteriores),
  cifra("c", "(c) Do exercício", (l) => l.rpLiquidadosDoExercicio),
  cifra("d", "(d) RP não liquidados", (l) => l.rpNaoLiquidadosAnteriores),
  cifra("e", "(e) Demais obrigações", (l) => l.demaisObrigacoes),
  cifra("a", "(a) Caixa bruta", (l) => l.disponibilidadeBruta),
  cifra("f", "(f) Líquida antes", (l) => l.disponibilidadeLiquidaAntes),
  cifra("g", "(g) RPNP inscritos", (l) => l.rpnpInscritosNoExercicio),
  {
    chave: "i",
    cabecalho: "(i) Líquida depois",
    alinhamento: "direita",
    largura: "10rem",
    celula: (l) => (
      <span className="inline-flex items-center gap-1.5">
        <ValorMonetario valor={l.disponibilidadeLiquidaDepois} />
        {/* O Badge é SÓ sinalização de estado — o vermelho do valor é do sinal contábil. */}
        {l.insuficiente ? <Badge status="erro">Insuf.</Badge> : null}
      </span>
    ),
  },
];
