import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  lerEliminacoesIntragovernamentais,
  PortaSemBancoError,
  type ContaNaEliminacao,
  type ContraparteDaDespesaIntra,
  type EliminacoesIntragovernamentais,
  type ParDeEliminacao,
} from "../../../../lib/portas/eliminacoes-intra";
import { SeletorDoPeriodo } from "./SeletorDoPeriodo";

/**
 * ELIMINAÇÕES INTRAGOVERNAMENTAIS — o ajuste da consolidação, explicado linha a linha.
 *
 * ⚠️ NADA SE ESCREVE AQUI, e é a decisão central. A eliminação é DEMONSTRATIVO: a visão individual
 * de cada unidade continua sendo exatamente o que os outros relatórios mostram, e o consolidado é
 * esta leitura. Lançar a eliminação no razão exigiria uma entidade "consolidado" que não é de
 * ninguém.
 *
 * ⚠️ INTERNA, atrás do shell autenticado — como a consistência. É ferramenta de CONFERÊNCIA antes
 * de publicar ou enviar; o que se publica são os demonstrativos.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do estado do razão.
 */
export const dynamic = "force-dynamic";

const ehBimestre = (n: number): n is 1 | 2 | 3 | 4 | 5 | 6 => n >= 1 && n <= 6;

function tomDaSituacao(s: ParDeEliminacao["situacao"]): StatusBadge {
  return s === "ELIMINA" ? "ok" : s === "RESIDUO" ? "erro" : "alerta";
}

function rotuloDaSituacao(s: ParDeEliminacao["situacao"]): string {
  return s === "ELIMINA" ? "elimina" : s === "RESIDUO" ? "resíduo" : "sem dado";
}

const COLUNAS_CONTAS: readonly ColunaTabela<ContaNaEliminacao>[] = [
  { chave: "codigo", cabecalho: "Conta", alinhamento: "esquerda", largura: "10rem", celula: (c) => <span className="tabular-nums">{c.codigo}</span> },
  { chave: "nome", cabecalho: "Nome no plano de contas", alinhamento: "esquerda", celula: (c) => c.nome },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", largura: "10rem", celula: (c) => <ValorMonetario valor={c.valor} /> },
];

const COLUNAS_CONTRAPARTES: readonly ColunaTabela<ContraparteDaDespesaIntra>[] = [
  { chave: "credor", cabecalho: "CNPJ/CPF do credor", alinhamento: "esquerda", largura: "12rem", celula: (c) => <span className="tabular-nums">{c.credorCpfCnpj}</span> },
  {
    chave: "entidade",
    cabecalho: "Contraparte",
    alinhamento: "esquerda",
    celula: (c) =>
      c.entidadeCodigo === null ? (
        <span className="text-[color:var(--color-ink-3)]">
          Contraparte não identificada — nenhuma entidade cadastrada tem este CNPJ
        </span>
      ) : (
        <span>
          {c.entidadeCodigo} — {c.entidadeNome}
        </span>
      ),
  },
  { chave: "empenhos", cabecalho: "Empenhos", alinhamento: "direita", largura: "6rem", celula: (c) => <span className="tabular-nums">{c.empenhos}</span> },
  { chave: "empenhado", cabecalho: "Empenhado", alinhamento: "direita", largura: "10rem", celula: (c) => <ValorMonetario valor={c.empenhado} /> },
];

function BlocoDoPar({ par }: { readonly par: ParDeEliminacao }): React.ReactElement {
  return (
    <Card>
      {/*
        ⚠️ `data-par` E `data-situacao` EXISTEM PARA SEREM LIDOS DE FORA, e a primeira corrida do
        percurso mostrou por quê: sem eles o ajudante procurava o bloco pelo TÍTULO e acabava
        pegando o container da página inteira — então "o par fechou" casava com a palavra
        "Eliminações" do menu e o percurso ficava verde sem ter olhado o par. Um marcador estável
        é a diferença entre ler o bloco e adivinhar onde ele está.
      */}
      <div data-par={par.chave} data-situacao={par.situacao} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--color-ink)]">{par.titulo}</p>
          <p className="text-sm text-[color:var(--color-ink-2)]">
            {par.rotuloEsquerda} × {par.rotuloDireita}
          </p>
        </div>
        <Badge status={tomDaSituacao(par.situacao)}>{rotuloDaSituacao(par.situacao)}</Badge>
      </div>

      {par.situacao === "SEM_DADO" ? (
        <p className="mt-3 text-sm text-[color:var(--color-ink-2)]" data-motivo={par.chave}>{par.motivo}</p>
      ) : (
        <>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">{par.rotuloEsquerda}</dt>
              <dd className="text-sm" data-lado={`${par.chave}-esquerda`}><ValorMonetario valor={par.esquerda} /></dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">{par.rotuloDireita}</dt>
              <dd className="text-sm" data-lado={`${par.chave}-direita`}><ValorMonetario valor={par.direita} /></dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">Resíduo</dt>
              <dd className="text-sm font-semibold" data-lado={`${par.chave}-residuo`}><ValorMonetario valor={par.residuo} /></dd>
            </div>
          </dl>

          {par.situacao === "RESIDUO" ? (
            <p className="mt-3 text-sm text-[color:var(--color-status-erro-fg)]">
              O resíduo é o ajuste que a consolidação ainda não explica: os dois lados da mesma
              operação entre unidades deveriam ter o mesmo valor. Confira se a operação foi
              reconhecida nas duas pontas e no mesmo período.
            </p>
          ) : null}

          {par.contas.length > 0 ? (
            <div className="mt-4">
              <TabelaDeDados<ContaNaEliminacao>
                colunas={COLUNAS_CONTAS}
                keyDe={(c) => c.codigo}
                legenda="As contas que compõem os dois lados — a explicação do ajuste, conta por conta."
                linhas={[...par.contas]}
              />
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const um = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
  const ex = Number.parseInt(um(sp["exercicio"]) ?? "2026", 10);
  const exercicio = Number.isInteger(ex) ? ex : 2026;
  const bi = Number.parseInt(um(sp["bimestre"]) ?? "6", 10);
  const bimestre = ehBimestre(bi) ? bi : 6;

  const cabecalho = (
    <PageHeader
      acoes={<SeletorDoPeriodo bimestre={bimestre} exercicio={exercicio} />}
      subtitulo={`Exercício ${exercicio} · acumulado até o ${bimestre}º bimestre. As operações entre as unidades do próprio ente, que saem do consolidado — e o que ainda não fecha.`}
      titulo="Eliminações intragovernamentais"
    />
  );

  let dados: EliminacoesIntragovernamentais;
  try {
    dados = await lerEliminacoesIntragovernamentais({ exercicio, bimestre });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível montar o demonstrativo"
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Nada é lançado no razão: a eliminação é <strong>demonstrativo</strong>, e por isso a visão de
        cada unidade continua intacta nos demais relatórios. <strong>Verde</strong> = os dois lados
        se anulam; <strong>vermelho</strong> = sobrou resíduo, e ele é o ajuste a explicar;{" "}
        <strong>âmbar</strong> = não há operação entre unidades no período. Operação com a União, o
        Estado ou outro município <strong>não</strong> entra aqui — ela não é do próprio ente.
        Confira também o{" "}
        <Link className="text-[color:var(--color-primary)] hover:underline" href="/relatorios/consistencia">
          Relatório de Consistência
        </Link>
        .
      </div>

      {dados.ancorasDoPlano === 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-sm text-[color:var(--color-status-alerta-fg)]"
          role="status"
        >
          O plano de contas instalado não declara o nível de consolidação em nenhuma conta. Sem ele,
          nenhuma partida pode ser dita intragovernamental — e este demonstrativo não tem como
          separar o que sai do consolidado.
        </div>
      ) : null}

      {dados.malformados.length > 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-sm text-[color:var(--color-status-alerta-fg)]"
          role="status"
        >
          Contas com código fora da forma do plano de contas, que ficaram sem classificação:{" "}
          {dados.malformados.join(", ")}.
        </div>
      ) : null}

      {dados.pares.map((par) => (
        <BlocoDoPar key={par.chave} par={par} />
      ))}

      <Card>
        <p className="text-sm font-semibold text-[color:var(--color-ink)]">
          Quem está do outro lado da despesa entre unidades
        </p>
        <p className="text-sm text-[color:var(--color-ink-2)]">
          A contraparte sai do CNPJ do credor do empenho, conferido contra o CNPJ das entidades
          cadastradas. O que não casa fica dito, nunca adivinhado.
        </p>
        {dados.contrapartes.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">
            Nenhuma despesa entre unidades do próprio ente foi empenhada até este período.
          </p>
        ) : (
          <div className="mt-4">
            <TabelaDeDados<ContraparteDaDespesaIntra>
              colunas={COLUNAS_CONTRAPARTES}
              keyDe={(c) => c.credorCpfCnpj}
              legenda="Uma linha por credor de despesa entre unidades, com o empenhado líquido de anulações."
              linhas={[...dados.contrapartes]}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
