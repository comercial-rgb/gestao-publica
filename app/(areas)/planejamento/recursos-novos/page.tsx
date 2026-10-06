import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  lerDisponibilidades,
  lerFontes,
  PortaSemBancoError,
} from "../../../../lib/portas/creditos";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../lib/portas/contexto";
import { dataBr } from "../../../../lib/recorte";
import { FormDeclaracao } from "./FormDeclaracao";
import { consultaDoSuperavit } from "../../../../lib/portas/superavit";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * DISPONIBILIDADE DE RECURSO NOVO (M03, TR 4.37) — o número que AUTORIZA o crédito adicional por
 * superávit financeiro, excesso de arrecadação e operação de crédito.
 *
 * ═══ ⚠️ POR QUE ESTA TELA EXISTE ═══
 * A `DisponibilidadeRecursoNovo` era a única coisa contra a qual o crédito por recurso novo é
 * conferido — e ela só entrava por SEED. Em instalação limpa, portanto, todo decreto por recurso
 * novo era recusado nomeando a fonte, e o servidor não tinha para onde ir: a recusa apontava para
 * um cadastro que a interface não oferecia.
 *
 * ⚠️ O QUE A TELA MOSTRA AO LADO DO DECLARADO É O UTILIZADO, e ele NÃO é recalculado aqui: sai da
 * mesma função que o guard do M03 subtrai dentro da transação que grava o crédito. Duas
 * aritméticas produziriam uma tela que anuncia saldo e um guard que recusa por outro número.
 *
 * ⚠️ A DECLARAÇÃO É VERSIONADA. A tela diz a versão vigente — "v3" ao lado da fonte é a
 * informação de que aquele número já foi corrigido duas vezes, e de que as anteriores continuam
 * no banco explicando os decretos daquele momento.
 *
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const ORIGENS = [
  { chave: "SUPERAVIT_FINANCEIRO", rotulo: "Superávit financeiro", explicacao: "Saldo apurado no balanço patrimonial do exercício anterior (Lei 4.320/64, art. 43, § 1º, I)." },
  { chave: "EXCESSO_ARRECADACAO", rotulo: "Excesso de arrecadação", explicacao: "Arrecadação superior à prevista, por fonte (Lei 4.320/64, art. 43, § 1º, II)." },
  { chave: "OPERACAO_CREDITO", rotulo: "Operação de crédito", explicacao: "Recursos de operação de crédito autorizada (Lei 4.320/64, art. 43, § 1º, IV)." },
] as const;

export default async function RecursosNovosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;

  let recorte: RecorteDaPagina;
  let porOrigem: readonly (readonly [string, Awaited<ReturnType<typeof lerDisponibilidades>>])[];
  let fontes: Awaited<ReturnType<typeof lerFontes>>;
  let superavit: Awaited<ReturnType<typeof consultaDoSuperavit>>;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_PLANEJAMENTO");
    fontes = await lerFontes();
    // ⚠️ O APURADO DOS FATOS VEM JUNTO (V11 V8.10) — e da MESMA composição que a tela do
    // superávit usa, não de uma soma nova. Uma segunda aritmética aqui divergiria da primeira no
    // dia em que um fato de E-1 fosse lançado depois do encerramento, e a tela mostraria um
    // número que o domínio recusa.
    superavit = await consultaDoSuperavit(recorte.exercicio);
    porOrigem = await Promise.all(
      ORIGENS.map(
        async (o) =>
          [o.chave, await lerDisponibilidades({ exercicio: recorte.exercicio, origem: o.chave })] as const
      )
    );
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Disponibilidade de recurso novo" subtitulo="Recursos disponíveis para créditos adicionais sem anulação de dotação" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "Exercício inválido"
                : erro instanceof PortaSemBancoError
                  ? "Serviço indisponível"
                  : "Não foi possível carregar as disponibilidades"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  const exercicio = recorte.exercicio;
  const linhas = new Map(porOrigem);

  // O apurado por fonte, casado pelo CÓDIGO — é o que a consulta do superávit devolve.
  const apuradoPorCodigo = new Map(superavit.linhas.map((l) => [l.fonteCodigo, l.apurado]));
  const fontesComApurado = fontes.map((f) => ({
    ...f,
    // `null` = exercício anterior não encerrado; ausência de linha = fonte sem fato nenhum em
    // E-1, e aí o apurado É zero (a fonte não sobrou nada), não "desconhecido".
    apuradoNoSuperavit: superavit.exercicioAnteriorEncerrado
      ? (apuradoPorCodigo.get(f.codigo) ?? "0.00")
      : null,
  }));

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Disponibilidade de recurso novo"
        subtitulo={`Exercício ${exercicio}: recursos disponíveis para créditos adicionais sem anulação de dotação.`}
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Os créditos adicionais por <strong>superávit financeiro</strong>, <strong>excesso de arrecadação</strong>{" "}
        ou <strong>operação de crédito</strong> são conferidos, na gravação do decreto, contra a disponibilidade
        declarada da fonte. Uma nova declaração da mesma fonte gera nova versão e preserva o histórico.
      </div>

      <FormDeclaracao exercicio={exercicio} fontes={fontesComApurado} />

      {ORIGENS.map((o) => {
        const lista = linhas.get(o.chave) ?? [];
        return (
          <Card key={o.chave}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <strong className="text-base">{o.rotulo}</strong>
              <span className="text-xs text-[color:var(--color-ink-3)]">{o.explicacao}</span>
            </div>

            {lista.length === 0 ? (
              <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">
                Nenhuma fonte declarada nesta origem em {exercicio}. Um decreto por {o.rotulo.toLowerCase()} será
                recusado até que a apuração seja declarada.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm" data-teste={`disponibilidades-${o.chave}`}>
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                      <th className="py-1.5 pr-4">Fonte</th>
                      <th className="py-1.5 pr-4">Declarado</th>
                      <th className="py-1.5 pr-4">Utilizado</th>
                      <th className="py-1.5 pr-4">Disponível</th>
                      <th className="py-1.5">Apuração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((d) => {
                      const disponivel = d.declarado.minus(d.utilizado);
                      return (
                        <tr key={d.fonteId} className="border-b border-[color:var(--color-border)] align-top">
                          <td className="py-1.5 pr-4">
                            <span className="font-mono">{d.fonteCodigo}</span>{" "}
                            <span className="text-xs text-[color:var(--color-ink-3)]">{d.fonteDescricao}</span>
                            {d.versao > 1 ? (
                              <>
                                {" "}
                                <Badge status="neutro">v{d.versao}</Badge>
                              </>
                            ) : null}
                          </td>
                          <td className="py-1.5 pr-4 font-mono"><ValorMonetario valor={d.declarado.toFixed(2)} /></td>
                          <td className="py-1.5 pr-4 font-mono"><ValorMonetario valor={d.utilizado.toFixed(2)} /></td>
                          <td className="py-1.5 pr-4 font-mono">
                            <strong><ValorMonetario valor={disponivel.toFixed(2)} /></strong>
                          </td>
                          <td className="py-1.5 text-xs text-[color:var(--color-ink-2)]">
                            {d.descricao}
                            <span className="block text-[color:var(--color-ink-3)]">
                              {d.declaradoPor} · {dataBr(d.declaradoEm)}
                            </span>
                            {d.decretos.length > 0 ? (
                              <span className="block text-[color:var(--color-ink-3)]">
                                utilizado nos decretos: {d.decretos.map((x) => `${x.numero}/${x.ano} (${x.liquido.toFixed(2)})`).join("; ")}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
