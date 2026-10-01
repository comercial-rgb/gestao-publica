import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import {
  lerConferenciaDaComposicao,
  lerContasParaRecolhimento,
  lerRetencoesComSaldo,
} from "../../../../../lib/portas/extraorcamentario";
import { diaCivilBr } from "../../../../../packages/datas/index";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { FormDoRecolhimento } from "./FormDoRecolhimento";

/**
 * RECOLHER — a guia, composta das retenções que ela quita (C34).
 *
 * ═══ ⚠️ POR QUE EM DOIS PASSOS ═══
 * As retenções que uma guia pode compor dependem da OBRIGAÇÃO (a consignação e o consignatário).
 * Escolher a obrigação primeiro é o que a pessoa faz — ela recolhe "o INSS de dezembro", não "uma
 * retenção qualquer". O primeiro passo é uma consulta (`GET`, sem transição de estado); o segundo
 * mostra as retenções com o que cada uma ainda tem a recolher, do exercício corrente e dos
 * anteriores, e é ali que a composição se escreve.
 *
 * ⚠️ RETENÇÃO DE EXERCÍCIO ANTERIOR APARECE COM O ANO, e não é detalhe de exibição: "vincular a
 * retenções atuais ou anteriores" só é verificável se o operador vir de que ano é cada uma.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly tipo?: string; readonly credor?: string }>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const { tipo, credor } = await searchParams;

  const voltar = (
    <Link className="text-sm underline hover:no-underline" href="/financeiro/extraorcamentario">
      Voltar ao extraorçamentário
    </Link>
  );

  // O passo 1 se alimenta da própria composição: as obrigações que TÊM o que recolher.
  const conferencia = await lerConferenciaDaComposicao();
  const comSaldo = conferencia.obrigacoes.filter((o) => Number(o.aRecolher) > 0);

  if (tipo === undefined || credor === undefined || tipo === "" || credor === "") {
    return (
      <div>
        <PageHeader
          acoes={voltar}
          subtitulo="Escolha a obrigação a recolher e informe as retenções que compõem o recolhimento, inclusive de exercícios anteriores."
          titulo="Recolher consignações"
        />
        {comSaldo.length === 0 ? (
          <EstadoVazio
            descricao="Nenhuma consignação tem valor a recolher neste momento."
            titulo="Nada a recolher"
          />
        ) : (
          <div className="grid gap-3">
            {comSaldo.map((o) => (
              <Card key={`${o.tipoCodigo}|${o.consignatario}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--color-ink)]">
                      {o.tipoCodigo} — {o.tipoDescricao}
                    </p>
                    <p className="text-sm text-[color:var(--color-ink-2)]">
                      Consignatário {o.consignatario} · a recolher{" "}
                      {formatarMoeda(o.aRecolher).texto}
                    </p>
                  </div>
                  <Link
                    className="text-sm underline hover:no-underline"
                    href={`/financeiro/extraorcamentario/recolher?tipo=${encodeURIComponent(o.tipoCodigo)}&credor=${encodeURIComponent(o.consignatario)}`}
                  >
                    Compor a guia
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const [retencoes, contas] = await Promise.all([
    lerRetencoesComSaldo({ tipoConsignacaoCodigo: tipo, credorConsignatario: credor }),
    lerContasParaRecolhimento(),
  ]);

  return (
    <div>
      <PageHeader
        acoes={
          <Link className="text-sm underline hover:no-underline" href="/financeiro/extraorcamentario/recolher">
            Escolher outra obrigação
          </Link>
        }
        subtitulo={`${tipo} · consignatário ${credor}. Informe o valor recolhido de cada retenção; o total da guia é a soma das parcelas.`}
        titulo="Compor o recolhimento"
      />

      <div className="mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="mb-2 text-left text-sm text-[color:var(--color-ink-2)]">
            Retenções desta obrigação. As retenções estornadas permanecem na lista, sem valor a recolher.
          </caption>
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left">
              <th className="py-2" scope="col">Exercício</th>
              <th className="py-2" scope="col">Data</th>
              <th className="py-2 text-right" scope="col">Retido</th>
              <th className="py-2 text-right" scope="col">Já recolhido</th>
              <th className="py-2 text-right" scope="col">A recolher</th>
              <th className="py-2" scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {retencoes.map((r) => (
              <tr className="border-b border-[color:var(--color-border)]" key={r.movimentoId}>
                <td className="py-2">{r.exercicio}</td>
                <td className="py-2">{diaCivilBr(r.data)}</td>
                <td className="py-2 text-right">{formatarMoeda(r.valor).texto}</td>
                <td className="py-2 text-right">{formatarMoeda(r.alocado).texto}</td>
                <td className="py-2 text-right">{formatarMoeda(r.aRecolher).texto}</td>
                <td className="py-2">
                  {r.estornada ? <Badge status="neutro">Estornada</Badge> : null}
                  {!r.estornada && Number(r.aRecolher) === 0 ? <Badge status="ok">Recolhida</Badge> : null}
                  {!r.estornada && Number(r.aRecolher) > 0 ? <Badge status="alerta">A recolher</Badge> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormDoRecolhimento
        contas={contas.map((c) => ({ codigo: c.codigo, descricao: c.descricao, fonteCodigo: c.fonteCodigo }))}
        credor={credor}
        retencoes={retencoes.map((r) => ({
          movimentoId: r.movimentoId,
          rotulo: `Retenção de ${diaCivilBr(r.data)} (exercício ${r.exercicio})`,
          aRecolher: r.aRecolher,
          estornada: r.estornada,
        }))}
        tipo={tipo}
      />
    </div>
  );
}
