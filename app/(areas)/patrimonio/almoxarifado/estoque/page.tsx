import { Alerta } from "../../../../../components/ui/Alerta";
import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import {
  depositosParaConsulta,
  posicaoDoDeposito,
  PortaSemBancoError,
  type LinhaDaPosicao,
  type LoteNaValidade,
} from "../../../../../lib/portas/recursos/almoxarifado-dados";

/**
 * ═══ A POSIÇÃO DE ESTOQUE — E É AQUI QUE A SEÇÃO 5.18 SE DECIDE ═══
 *
 * ⚠️ TELA ESCRITA À MÃO, E DE PROPÓSITO. Ela não cria, não edita e não tem detalhe: é uma
 * CONSULTA com quatro perguntas sobre o mesmo depósito. O molde monta
 * listagem-com-formulário, e forçá-lo a montar isto seria crescê-lo para acomodar exceção —
 * o limite 2 do `lib/molde/tipos.ts`. O molde não cresce; a exceção escapa para cá.
 *
 * ⚠️ A PERGUNTA CENTRAL É "QUANTO HAVIA NAQUELA DATA", e é ela que refuta uma coluna de
 * saldo dentro da própria seção. Uma coluna só sabe responder "agora"; o almoxarife precisa
 * saber o que havia no fechamento do mês passado, e o auditor precisa conferir a contagem
 * do inventário contra a posição do dia em que ele foi aberto.
 *
 * ⚠️ GET NÃO PRODUZ TRANSIÇÃO DE ESTADO. Esta tela só lê — a data e o depósito viajam na
 * URL, o formulário é `method="get"`, e nenhuma Server Action é chamada daqui.
 */
export const dynamic = "force-dynamic";

const COLUNAS = [
  { chave: "codigo", cabecalho: "Código", celula: (l: LinhaDaPosicao) => l.codigo },
  { chave: "descricao", cabecalho: "Material", celula: (l: LinhaDaPosicao) => l.descricao },
  { chave: "unidade", cabecalho: "Unidade", celula: (l: LinhaDaPosicao) => l.unidade },
  {
    chave: "quantidade",
    cabecalho: "Quantidade",
    alinhamento: "direita" as const,
    celula: (l: LinhaDaPosicao) => (
      <span>
        {l.quantidade}{" "}
        {l.abaixoDoMinimo ? <Badge status="alerta">abaixo do mínimo</Badge> : null}
        {l.acimaDoMaximo ? <Badge status="alerta">acima do máximo</Badge> : null}
      </span>
    ),
  },
  {
    chave: "precoMedio",
    cabecalho: "Preço médio",
    alinhamento: "direita" as const,
    celula: (l: LinhaDaPosicao) => l.precoMedio,
  },
  {
    chave: "valor",
    cabecalho: "Valor",
    alinhamento: "direita" as const,
    celula: (l: LinhaDaPosicao) => <ValorMonetario valor={l.valor} />,
  },
  {
    chave: "faixa",
    cabecalho: "Mínimo / Máximo",
    alinhamento: "direita" as const,
    celula: (l: LinhaDaPosicao) => `${l.minimo ?? "—"} / ${l.maximo ?? "—"}`,
  },
];

const COLUNAS_DE_LOTE = [
  { chave: "identificacao", cabecalho: "Lote", celula: (l: LoteNaValidade) => l.identificacao },
  { chave: "material", cabecalho: "Material", celula: (l: LoteNaValidade) => l.material },
  { chave: "validade", cabecalho: "Validade", celula: (l: LoteNaValidade) => l.validade },
  {
    chave: "quantidade",
    cabecalho: "Quantidade com saldo",
    alinhamento: "direita" as const,
    celula: (l: LoteNaValidade) => l.quantidade,
  },
];

export default async function EstoquePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const params = await searchParams;
  const pedido = typeof params["deposito"] === "string" ? params["deposito"] : "";
  const emDia = typeof params["em"] === "string" ? params["em"] : "";

  try {
    const depositos = await depositosParaConsulta();
    if (depositos.length === 0) {
      return (
        <div className="space-y-6">
          <PageHeader
            titulo="Posição de estoque"
            subtitulo="Quanto havia de cada material, num depósito, numa data."
          />
          <EstadoVazio
            titulo="Nenhum depósito cadastrado"
            descricao="A posição é sempre de um depósito. Cadastre um depósito antes de consultar."
          />
        </div>
      );
    }

    const escolhido = depositos.find((d) => d.id === pedido) ?? depositos[0]!;
    const posicao = await posicaoDoDeposito(escolhido.id, emDia);
    if (posicao === null) {
      return (
        <div className="space-y-6">
          <PageHeader titulo="Posição de estoque" subtitulo="Depósito não encontrado." />
          <EstadoVazio
            titulo="Depósito não encontrado"
            descricao="O depósito pedido não existe ou foi desativado."
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <PageHeader
          titulo="Posição de estoque"
          subtitulo={`${posicao.deposito.codigo} — ${posicao.deposito.nome}, em ${posicao.dia}`}
        />

        {/* ⚠️ `method="get"`: a consulta não transiciona estado, e o resultado é um
            endereço que se copia, se guarda e se manda por e-mail. */}
        <form method="get" className="flex flex-wrap items-end gap-4" data-acao="consultar-posicao">
          {/* ⚠️ O RÓTULO ENVOLVE O CAMPO, em vez de apontar para ele por identidade.
              `test/ui/formularios-na-mesma-pagina.test.tsx` (t6) proíbe identidade literal
              de campo em tela: vários formulários coexistem na mesma página, e dois campos
              com a mesma identidade fariam o rótulo de um apontar para o campo do outro. O
              caminho normal é o `useId` dos componentes de `Campos.tsx` — mas eles são de
              cliente, e esta é uma tela de servidor que não precisa de nenhum. O rótulo
              envolvente associa sem identidade nenhuma, e é HTML válido desde sempre.

              ⚠️ E A PRIMEIRA VERSÃO DESTE COMENTÁRIO DERRUBOU O PRÓPRIO GUARD: ele citava a
              forma proibida entre aspas para explicá-la, e o grep — que pula linha iniciada
              por `//` ou `*`, mas não linha de dentro de um comentário JSX — acusou a
              explicação como se fosse código. É a mesma anatomia que o guard já documenta
              sobre si mesmo. A regra se enuncia sem se escrever. */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Depósito</span>
            <select
              name="deposito"
              defaultValue={escolhido.id}
              className="h-9 rounded border px-2 text-sm"
            >
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.codigo} — {d.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Posição em</span>
            <input
              name="em"
              type="date"
              defaultValue={posicao.dia}
              className="h-9 rounded border px-2 text-sm"
            />
          </label>
          <button type="submit" className="h-9 rounded border px-4 text-sm font-medium">
            Consultar
          </button>
        </form>

        {posicao.bloqueado ? (
          <Alerta status="alerta" titulo="Movimentação bloqueada neste depósito">
            {posicao.motivosDoBloqueio.join(" · ")}. Enquanto o bloqueio vale, entrada, saída
            e transferência são recusadas — a consulta continua respondendo normalmente.
          </Alerta>
        ) : null}

        {posicao.linhas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum material com saldo nesta data"
            descricao="A posição é derivada dos movimentos. Sem movimento até esta data, não há saldo a mostrar — e isso não é um erro."
          />
        ) : (
          <>
            <TabelaDeDados
              colunas={COLUNAS}
              linhas={posicao.linhas}
              keyDe={(l) => l.materialId}
            />
            <p className="text-sm">
              Valor total do estoque nesta data: <ValorMonetario valor={posicao.totalEmValor} />
            </p>
          </>
        )}

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Lotes vencidos</h2>
          {posicao.vencidos.length === 0 ? (
            <p className="text-sm">Nenhum lote com saldo está vencido nesta data.</p>
          ) : (
            <TabelaDeDados
              colunas={COLUNAS_DE_LOTE}
              linhas={posicao.vencidos}
              keyDe={(l, i) => `${l.identificacao}-${i}`}
            />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Lotes que vencem em até 30 dias</h2>
          {posicao.aVencer.length === 0 ? (
            <p className="text-sm">Nenhum lote com saldo vence nos próximos 30 dias.</p>
          ) : (
            <TabelaDeDados
              colunas={COLUNAS_DE_LOTE}
              linhas={posicao.aVencer}
              keyDe={(l, i) => `${l.identificacao}-${i}`}
            />
          )}
          <p className="text-xs">
            Só lote COM SALDO entra nesta conta: um lote já consumido não vence para ninguém.
          </p>
        </section>
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader
            titulo="Posição de estoque"
            subtitulo="Quanto havia de cada material, num depósito, numa data."
          />
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="Esta consulta lê o banco. Sem ele, esta tela não tem o que mostrar — e não vai fingir que tem."
          />
        </div>
      );
    }
    throw e;
  }
}
