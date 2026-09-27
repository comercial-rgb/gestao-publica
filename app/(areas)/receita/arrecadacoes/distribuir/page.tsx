import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import {
  lerContasComRolDeFontes,
  lerFontesPrevistasDaNatureza,
  lerNaturezasPrevistas,
  lerTodasAsFontes,
  PortaSemBancoError,
} from "../../../../../lib/portas/arrecadacao";
import { exercicioAutorizado, ExercicioIlegivelError } from "../../../../../lib/recorte";
import { FormGuiaDistribuida } from "./FormGuiaDistribuida";

/**
 * A GUIA REPARTIDA ENTRE FONTES (C30).
 *
 * ═══ ⚠️ POR QUE EM DOIS PASSOS ═══
 * As fontes que uma guia pode repartir dependem da NATUREZA da receita: é a LOA que diz em que
 * fontes aquela receita foi prevista. Escolher a natureza primeiro é o que a pessoa faz — ela
 * registra "a cota do FPM", não "uma receita qualquer". O primeiro passo é consulta (`GET`, sem
 * transição de estado); o segundo mostra as fontes previstas com o valor previsto de cada uma, e é
 * ali que a repartição se escreve.
 *
 * ⚠️ A LISTA DE FONTES ORIENTA, NÃO FECHA. Receita além do previsto existe e é legítima: há uma
 * linha própria para a fonte que a LOA não previu, e ela cobra o motivo escrito — que é o que a
 * prestação de contas lê. Fechar a lista ensinaria que só se arrecada o previsto, o que é falso.
 *
 * ⚠️ O TOTAL DA GUIA É CAMPO, e aqui isso NÃO cria duas verdades: o total é o depósito que entrou
 * no banco — fato externo, que a pessoa tem no extrato —, e a repartição é a declaração de a quem
 * aquele dinheiro pertence. A conferência entre os dois é justamente o que esta tela existe para
 * fazer. (No recolhimento extraorçamentário é o oposto, e por isso lá não há campo de total: a
 * guia de recolhimento É a soma das parcelas, não um fato independente.)
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly natureza?: string; readonly exercicio?: string }>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RECEITA");
  const sp = await searchParams;
  const natureza = sp.natureza;
  // ⚠️ O MESMO RECORTE DA LISTA, e pela mesma razão: `?exercicio=abc` virava o exercício padrão em
  // silêncio, e a tela mostrava um ano que ninguém pediu. Aqui ele RECUSA.
  let ano: number;
  try {
    ano = exercicioAutorizado(sp as Record<string, string | string[] | undefined>);
  } catch (e) {
    if (e instanceof ExercicioIlegivelError) {
      return (
        <div>
          <PageHeader titulo="Repartir uma guia entre fontes" />
          <EstadoVazio descricao={e.message} titulo="Exercício ilegível" />
        </div>
      );
    }
    throw e;
  }

  const voltar = (
    <Link className="text-sm underline hover:no-underline" href="/receita/arrecadacoes">
      Voltar às guias
    </Link>
  );

  let previstas: Awaited<ReturnType<typeof lerNaturezasPrevistas>>;
  try {
    previstas = await lerNaturezasPrevistas({ exercicio: ano });
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div>
          <PageHeader acoes={voltar} titulo="Repartir uma guia entre fontes" />
          <EstadoVazio
            descricao="O cadastro não está disponível agora. Tente de novo em instantes."
            titulo="Sem acesso aos dados"
          />
        </div>
      );
    }
    throw e;
  }

  if (natureza === undefined || natureza === "") {
    // Uma linha por natureza; as fontes previstas aparecem ao lado, que é o que orienta a escolha.
    const porNatureza = new Map<string, { descricao: string; fontes: string[] }>();
    for (const n of previstas) {
      const acc = porNatureza.get(n.naturezaCodigo) ?? { descricao: n.naturezaDescricao, fontes: [] };
      if (!acc.fontes.includes(n.fonteCodigo)) acc.fontes.push(n.fonteCodigo);
      porNatureza.set(n.naturezaCodigo, acc);
    }

    return (
      <div>
        <PageHeader
          acoes={voltar}
          subtitulo={`Exercício ${ano}. Escolha a natureza da receita; em seguida você informa quanto do depósito entrou em cada fonte.`}
          titulo="Repartir uma guia entre fontes"
        />
        {porNatureza.size === 0 ? (
          <EstadoVazio
            descricao={`A LOA de ${ano} não tem receita prevista cadastrada, e é dela que sai a lista de fontes de cada natureza.`}
            titulo="Nenhuma receita prevista neste exercício"
          />
        ) : (
          <div className="grid gap-3">
            {[...porNatureza.entries()].map(([codigo, n]) => (
              <Card key={codigo}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--color-ink)]">
                      {codigo} — {n.descricao}
                    </p>
                    <p className="text-sm text-[color:var(--color-ink-2)]">
                      Prevista {n.fontes.length === 1 ? "na fonte" : "nas fontes"} {n.fontes.join(", ")}
                    </p>
                  </div>
                  <Link
                    className="text-sm underline hover:no-underline"
                    href={`/receita/arrecadacoes/distribuir?exercicio=${String(ano)}&natureza=${encodeURIComponent(codigo)}`}
                  >
                    Repartir uma guia
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const [fontesPrevistas, contas, todasAsFontes] = await Promise.all([
    lerFontesPrevistasDaNatureza({ exercicio: ano, naturezaCodigo: natureza }),
    lerContasComRolDeFontes(),
    lerTodasAsFontes(),
  ]);
  const descricao =
    previstas.find((n) => n.naturezaCodigo === natureza)?.naturezaDescricao ?? natureza;

  return (
    <div>
      <PageHeader
        acoes={
          <Link
            className="text-sm underline hover:no-underline"
            href={`/receita/arrecadacoes/distribuir?exercicio=${String(ano)}`}
          >
            Escolher outra natureza
          </Link>
        }
        subtitulo={`${natureza} — ${descricao}. Informe o total do depósito e quanto dele entrou em cada fonte; as parcelas têm de somar o total.`}
        titulo="Repartir uma guia entre fontes"
      />

      <FormGuiaDistribuida
        contas={contas.filter((c) => c.contaContabil !== null)}
        exercicio={ano}
        fontesPrevistas={fontesPrevistas}
        naturezaCodigo={natureza}
        todasAsFontes={todasAsFontes}
      />
    </div>
  );
}
