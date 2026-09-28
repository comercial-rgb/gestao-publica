import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarBalancoFinanceiro,
  PortaSemBancoError,
  RolDeDisponibilidadeAusenteError,
  type BalancoFinanceiro,
  type LinhaFinanceira,
} from "../../../../../lib/portas/demonstrativos";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { SeletorExercicio } from "../SeletorExercicio";
import { lerExercicio } from "../exercicio";

/** ANEXO 13 — Balanço Financeiro (Lei 4.320, art. 103). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function BalancoFinanceiroPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const { exercicio, exercicioStr } = lerExercicio(sp);

  const cabecalho = (
    <PageHeader
      titulo="Balanço Financeiro"
      subtitulo="Ingressos e dispêndios por fonte, e o saldo em espécie (art. 103 da Lei 4.320)"
      acoes={<SeletorExercicio exercicio={exercicioStr} />}
    />
  );

  let dados: BalancoFinanceiro;
  try {
    dados = await gerarBalancoFinanceiro({ exercicio });
  } catch (erro) {
    // A ausência do rol de disponibilidades é RECUSA COM CAMINHO, não erro técnico: o operador
    // precisa saber o que informar e onde, não que houve uma exceção.
    const semRol = erro instanceof RolDeDisponibilidadeAusenteError;
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={
            semRol
              ? "Contas de disponibilidade não informadas"
              : erro instanceof PortaSemBancoError
                ? "Serviço indisponível"
                : "Não foi possível emitir o Balanço Financeiro"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  // ⚠️ A TELA NÃO CONFERE O SALDO EM ESPÉCIE, E ISSO CORRIGE UM DEFEITO QUE ESTAVA AQUI.
  //
  // Havia um selo "confere / NÃO confere" comparando `seguinte === apuradoPelasPartidas`. Ele era
  // duas coisas erradas ao mesmo tempo. Primeiro, comparação de dinheiro fora dos helpers, por
  // igualdade de string: `-0.00` e `0.00` são o mesmo valor e strings diferentes, e o dia em que
  // um dos lados chegasse como `"1000.5"` a tela cravaria erro num Anexo 13 correto. Segundo, e
  // pior, o ramo vermelho era INALCANÇÁVEL: o motor já LANÇA quando os dois lados divergem
  // (`dominio-financeiro.ts`), então todo balanço que chega aqui é um que bateu — o selo era
  // sempre verde e atestava uma conferência que a tela nunca fez. Papelada que declara.
  //
  // A conferência é do motor e a emissão é a prova dela. As três linhas do saldo em espécie
  // ficam na tabela abaixo, onde o operador vê os números e julga por conta própria.

  return (
    <div className="space-y-4">
      {cabecalho}
      <div>
        <Badge status={dados.parcial ? "alerta" : "ok"}>
          {dados.parcial
            ? `Exercício ${dados.exercicio} em andamento — posição parcial`
            : `Exercício ${dados.exercicio} encerrado`}
        </Badge>
      </div>

      {dados.ingressos.length === 0 && dados.dispendios.length === 0 ? (
        <EstadoVazio titulo="Sem movimento financeiro no exercício" descricao="Não há ingresso nem dispêndio no exercício selecionado." />
      ) : (
        <>
          <TabelaDeDados
            colunas={COLUNAS}
            linhas={comTotal(dados.ingressos, "Total dos ingressos", dados.totalIngressos)}
            keyDe={(l, i) => `i-${l.codigo ?? l.rotulo}-${i}`}
            ehTotal={(l) => l.nivel === "TOTAL"}
            legenda="Ingressos — valores em R$"
          />
          <TabelaDeDados
            colunas={COLUNAS}
            linhas={comTotal(dados.dispendios, "Total dos dispêndios", dados.totalDispendios)}
            keyDe={(l, i) => `d-${l.codigo ?? l.rotulo}-${i}`}
            ehTotal={(l) => l.nivel === "TOTAL"}
            legenda="Dispêndios — valores em R$"
          />
        </>
      )}

      <TabelaDeDados
        colunas={COLUNAS_ESPECIE}
        linhas={[
          { rotulo: "Saldo em espécie do exercício anterior", valor: dados.saldoEmEspecie.anterior },
          { rotulo: "Saldo em espécie para o exercício seguinte", valor: dados.saldoEmEspecie.seguinte },
          { rotulo: "Caixa apurado pelos lançamentos contábeis", valor: dados.saldoEmEspecie.apuradoPelasPartidas },
        ]}
        keyDe={(l) => l.rotulo}
        legenda="Saldo em espécie — valores em R$"
      />
    </div>
  );
}

/**
 * Acrescenta a linha de TOTAL vinda do motor — e ela faltava.
 *
 * ⚠️ O MOTOR CALCULAVA E A TELA JOGAVA FORA. `balancoFinanceiro` devolve `totalIngressos` e
 * `totalDispendios`, e as listas `ingressos`/`dispendios` NÃO trazem linha de total (o `"TOTAL"` do
 * `NivelLinhaFinanceira` existe para outros usos). A primeira versão desta tela renderizava só as
 * listas, então o Anexo 13 saía sem os seus dois totais — e a identidade que ele existe para
 * mostrar, total de ingressos == total de dispêndios, ficava invisível. Foi o percurso de navegador
 * que pegou isso, procurando na tela um número que a porta media e ninguém exibia.
 *
 * O valor NÃO é somado aqui: vem do motor. Isto é montagem de linha, não aritmética.
 */
function comTotal(
  linhas: readonly LinhaFinanceira[],
  rotulo: string,
  total: string
): readonly LinhaFinanceira[] {
  return [...linhas, { codigo: null, rotulo, nivel: "TOTAL", valor: total }];
}

const COLUNAS: readonly ColunaTabela<LinhaFinanceira>[] = [
  { chave: "codigo", cabecalho: "Fonte", celula: (l) => l.codigo ?? "" },
  { chave: "rotulo", cabecalho: "Especificação", celula: (l) => l.rotulo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valor} /> },
];

interface LinhaEspecie {
  readonly rotulo: string;
  readonly valor: string;
}
const COLUNAS_ESPECIE: readonly ColunaTabela<LinhaEspecie>[] = [
  { chave: "rotulo", cabecalho: "Especificação", celula: (l) => l.rotulo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valor} /> },
];
