import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarRgfAnexo2,
  LINHAS_ANEXO2,
  PortaSemBancoError,
  type Anexo2Rgf,
  type ValoresDaColuna,
} from "../../../../../lib/portas/rreo";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
/**
 * RGF — ANEXO 2: DÍVIDA CONSOLIDADA LÍQUIDA. LRF art. 55, I, "b".
 *
 * ⚠️ A "Disponibilidade de Caixa ¹" pode aparecer ZERO com a bruta positiva — é a NOTA ¹,
 * não um bug: quando os RP processados superam o caixa, a dedução vai a zero e o buraco
 * migra para a "Insuficiência Financeira" do quadro informativo, sem sinal. A nota está
 * impressa abaixo da tabela, onde o leitor a procura.
 */
export const dynamic = "force-dynamic";

const QUADRIMESTRES = [1, 2, 3] as const;
type Quad = (typeof QUADRIMESTRES)[number];

export default async function RgfAnexo2Page({
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
  const quadrimestre: Quad = (QUADRIMESTRES as readonly number[]).includes(q) ? (q as Quad) : 3;

  const cabecalho = (
    <PageHeader
      titulo="RGF — Anexo 2: Dívida Consolidada Líquida"
      subtitulo={`Exercício ${exercicio} · ${quadrimestre}º quadrimestre — LRF art. 55, I, "b"`}
    />
  );

  let a2: Anexo2Rgf;
  try {
    a2 = await gerarRgfAnexo2({ exercicio, quadrimestre });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível gerar o Anexo 2"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  const ref = a2.colunas[a2.colunas.length - 1]!.valores;
  const semMovimento = a2.colunas.every(
    (c) => c.valores.dividaConsolidada === "0.00" && c.valores.deducoes === "0.00"
  );

  if (semMovimento) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo="Sem dívida consolidada nem deduções"
          descricao={`Não há dívida cadastrada nem disponibilidade apurada até o ${quadrimestre}º quadrimestre de ${exercicio}.`}
        />
      </div>
    );
  }

  // Cada linha da tabela é uma LINHA do layout; as colunas são os cortes.
  const linhas = LINHAS_ANEXO2.map((l) => ({
    chave: l.chave,
    rotulo: l.rotulo,
    nivel: l.nivel,
    valores: a2.colunas.map((c) => c.valores[l.chave] as string),
  }));

  return (
    <div className="space-y-4">
      {cabecalho}

      {ref.excedeuLimite === true ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-erro-fg)] bg-[color:var(--color-status-erro-bg)] p-3 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          <strong>Limite do Senado excedido:</strong> a DCL é {ref.percentDclSobreRcl}% da
          RCL ajustada, contra um teto de {a2.limiteSenado}%. O ente fica impedido de
          contratar operação de crédito e de receber transferências voluntárias.
        </div>
      ) : ref.emAlerta === true ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-sm text-[color:var(--color-status-alerta-fg)]"
        >
          <strong>Limite de alerta:</strong> a DCL é {ref.percentDclSobreRcl}% da RCL
          ajustada e ultrapassou {a2.limiteAlerta}% (LRF art. 59, §1º, III), situação que enseja
          alerta do Tribunal de Contas.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <CardPercent rotulo="% da DC sobre a RCL ajustada" valor={ref.percentDcSobreRcl} />
        <CardPercent
          rotulo="% da DCL sobre a RCL ajustada"
          valor={ref.percentDclSobreRcl}
          excedeu={ref.excedeuLimite}
          alerta={ref.emAlerta}
        />
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">Limites</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink)]">
            Senado (Res. 40/2001): <strong>{a2.limiteSenado}%</strong>
          </p>
          <p className="text-sm text-[color:var(--color-ink)]">
            Alerta (art. 59, §1º, III): <strong>{a2.limiteAlerta}%</strong>
          </p>
        </div>
      </div>

      <TabelaDeDados
        colunas={colunasDa(a2)}
        linhas={linhas}
        keyDe={(l) => l.chave}
        ehTotal={(l) => l.nivel === "grupo" || l.nivel === "total"}
        recuoDe={(l) => (l.nivel === "subitem" ? 2 : l.nivel === "item" ? 1 : 0)}
        legenda="Valores em R$ · a coluna do exercício anterior apresenta o saldo em 31/12."
      />

      {/* ⚠️ A NOTA ¹ É REGRA, e fica onde o leitor a procura: colada na tabela. */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p>
          <strong>¹</strong> Quando a Disponibilidade de Caixa Bruta for menor que os Restos a
          Pagar Processados, esta linha é informada com valor zero, e a diferença é apresentada,
          sem sinal negativo, na linha <strong>Insuficiência Financeira</strong> do quadro abaixo.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
          Outros valores não integrantes da Dívida Consolidada
        </h2>
        <TabelaDeDados
          colunas={COLUNAS_INFO}
          linhas={[
            { chave: "PREC_ANT", rotulo: "Precatórios Anteriores a 05/05/2000", valor: a2.quadroInformativo.precatoriosAnteriores2000, vazio: true },
            { chave: "PREC_POS", rotulo: "Precatórios Posteriores a 05/05/2000 (não incluídos na DC)", valor: a2.quadroInformativo.precatoriosPosteriores2000NaoIncluidos, vazio: true },
            { chave: "ATUARIAL", rotulo: "Passivo Atuarial", valor: a2.quadroInformativo.passivoAtuarial, vazio: false },
            { chave: "INSUF", rotulo: "Insuficiência Financeira ¹", valor: a2.quadroInformativo.insuficienciaFinanceira, vazio: false },
            { chave: "DEPOSITOS", rotulo: "Depósitos e Consignações sem Correspondência de Recursos", valor: a2.quadroInformativo.depositosSemCorrespondencia, vazio: true },
            { chave: "RPNP", rotulo: "RP Não Processados", valor: a2.quadroInformativo.rpNaoProcessados, vazio: false },
            { chave: "ARO", rotulo: "Antecipações de Receita Orçamentária — ARO", valor: a2.quadroInformativo.aro, vazio: true },
            { chave: "PPP", rotulo: "Dívida Contratual de PPP", valor: a2.quadroInformativo.dividaContratualPpp, vazio: false },
          ]}
          keyDe={(l) => l.chave}
          legenda={`Posição ao final do ${quadrimestre}º quadrimestre · as linhas marcadas como "sem cadastro" não possuem registro no sistema.`}
        />
      </section>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">
          {a2.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <RelatoriosRelacionados
        relacoes={[
          {
            href: "/relatorios/rgf/anexo1",
            rotulo: "RGF Anexo 1 — Despesa com Pessoal",
            motivo:
              "Utiliza a mesma RCL ajustada do limite da despesa com pessoal.",
          },
          {
            href: "/relatorios/rgf/anexo5",
            rotulo: "RGF Anexo 5 — Disponibilidade de Caixa",
            motivo:
              "A Disponibilidade de Caixa Bruta corresponde à soma da coluna (a) do Anexo 5.",
          },
          {
            href: "/relatorios/rreo/anexo13",
            rotulo: "RREO Anexo 13 — PPP",
            motivo:
              "A Dívida Contratual de PPP corresponde aos contratos demonstrados no Anexo 13.",
          },
        ]}
      />
    </div>
  );
}

function CardPercent({
  rotulo,
  valor,
  excedeu,
  alerta,
}: {
  readonly rotulo: string;
  readonly valor: string | null;
  readonly excedeu?: boolean | null;
  readonly alerta?: boolean | null;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">{rotulo}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">
          {valor === null ? "—" : `${valor}%`}
        </span>
        {/* ⚠️ Três estados, não dois: âmbar é o ALERTA do art. 59 — o ente ainda cabe no
            limite, mas o TC já o avisa. Pintá-lo de vermelho diria que estourou. */}
        {excedeu === true ? (
          <Badge status="erro">excede 120%</Badge>
        ) : alerta === true ? (
          <Badge status="alerta">alerta (≥108%)</Badge>
        ) : valor === null ? (
          <Badge status="alerta">sem RCL</Badge>
        ) : excedeu === false ? (
          <Badge status="ok">dentro do limite</Badge>
        ) : null}
      </div>
    </div>
  );
}

type LinhaTabela = {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: string;
  readonly valores: readonly string[];
};

function colunasDa(a2: Anexo2Rgf): readonly ColunaTabela<LinhaTabela>[] {
  return [
    {
      chave: "rotulo",
      cabecalho: "Especificação",
      alinhamento: "esquerda",
      celula: (l) => l.rotulo,
    },
    ...a2.colunas.map((c, i) => ({
      chave: c.coluna,
      cabecalho: c.rotulo,
      alinhamento: "direita" as const,
      largura: "10rem",
      celula: (l: LinhaTabela) => <ValorMonetario valor={l.valores[i] ?? "0.00"} />,
    })),
  ];
}

type LinhaInfo = {
  readonly chave: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly vazio: boolean;
};

const COLUNAS_INFO: readonly ColunaTabela<LinhaInfo>[] = [
  {
    chave: "rotulo",
    cabecalho: "Especificação",
    alinhamento: "esquerda",
    celula: (l) => (
      <span className="inline-flex items-center gap-1.5">
        {l.rotulo}
        {/* O interruptor é VISÍVEL: a linha existe no layout e o sistema não tem o dado. */}
        {l.vazio ? <Badge status="alerta">sem cadastro</Badge> : null}
      </span>
    ),
  },
  {
    chave: "valor",
    cabecalho: "Saldo",
    alinhamento: "direita",
    largura: "12rem",
    celula: (l) => <ValorMonetario valor={l.valor} />,
  },
];
