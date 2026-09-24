import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  lerFontesEAsNaturezas,
  NATUREZAS_ESCOLHIVEIS,
} from "../../../../lib/portas/natureza-das-fontes";
import { FormDaNatureza, NaturezasDoEnte } from "./FormNatureza";

/**
 * A NATUREZA DAS FONTES — ONDE O ENTE DIZ DE QUE NATUREZA É CADA RECURSO (M01, V11 V9.3).
 *
 * ═══ ⚠️ POR QUE ESTA TELA EXISTE ═══
 * A pendência `CONTROLE-DDR-POR-NATUREZA-DA-FONTE` deixava instalação nova SEM ARRECADAÇÃO
 * NENHUMA. O roteiro da arrecadação debitava `7.2.1.1.0.00.00` — que no `Pcasp_2025.xlsx` do
 * TCE-PB é SINTÉTICA — e o razão recusava a partida, corretamente. Três passos da jornada da
 * entidade titular ficaram não executados por causa disso.
 *
 * O plano diz em que conta cada NATUREZA entra; ele não diz de que natureza é a fonte 500 deste
 * município. Isso é ato do ente — e, como no roteiro orçamentário, o que faltava não era a conta
 * e sim o LUGAR de declarar. Escolher por ele classificaria saúde, educação e FUNDEB como
 * ordinários, e o erro sairia no RGF Anexo 5 e na remessa, não aqui.
 *
 * ⚠️ A AUSÊNCIA APARECE, COM NOME. Fonte sem natureza é mostrada como pendente, e a tela diz o
 * que ela impede — a arrecadação — para que ninguém descubra a pendência pela recusa de uma guia.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function NaturezaDasFontesPage(): Promise<React.ReactElement> {
  let fontes: Awaited<ReturnType<typeof lerFontesEAsNaturezas>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    fontes = await lerFontesEAsNaturezas();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="Natureza das fontes"
          subtitulo="De que natureza é cada recurso, para o controle da disponibilidade"
        />
        <EstadoVazio
          titulo="Não foi possível ler as fontes"
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const pendentes = fontes.filter((f) => f.natureza === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Natureza das fontes"
        subtitulo="De que natureza é cada recurso, para o controle da disponibilidade"
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Toda arrecadação registra a <strong>entrada do dinheiro sob controle</strong>, e a conta
        dessa perna depende da natureza do recurso — ordinário, vinculado, extraorçamentário,
        de compensação financeira ou outro. O plano de contas separa as cinco; quem diz em qual
        delas cada fonte do município se enquadra é o ente.{" "}
        <strong>Enquanto uma fonte não tiver natureza declarada, a arrecadação dela é recusada</strong>{" "}
        — e é assim que deve ser: classificar por semelhança de nome poria recurso da saúde ou da
        educação no lugar do recurso livre. Declarar de novo cria uma <strong>versão</strong>; o que
        já foi arrecadado permanece na conta em que entrou.
      </div>

      {pendentes.length > 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs"
          data-teste="fontes-sem-natureza"
        >
          <strong>
            {pendentes.length} fonte(s) sem natureza declarada —{" "}
            {pendentes.map((f) => `${f.codigo} ${f.descricao}`).join("; ")}
          </strong>
          . A arrecadação delas é recusada enquanto o ente não classificar.
        </div>
      ) : null}

      <Card>
        <NaturezasDoEnte naturezas={NATUREZAS_ESCOLHIVEIS}>
          {fontes.length === 0 ? (
            <EstadoVazio
              titulo="Nenhuma fonte de recurso cadastrada"
              descricao="A natureza se declara sobre a fonte do cadastro. Cadastre as fontes do ente antes."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">
                  Fontes de recurso do ente e a natureza declarada de cada uma
                </caption>
                <thead>
                  <tr className="text-[color:var(--color-ink-3)]">
                    <th scope="col" className="py-2 pr-3">Fonte</th>
                    <th scope="col" className="py-2 pr-3">Natureza declarada</th>
                    <th scope="col" className="py-2 pr-3">Conta de controle</th>
                    <th scope="col" className="py-2 pr-3">Fundamento</th>
                  </tr>
                </thead>
                <tbody>
                  {fontes.map((f) => (
                    <tr
                      key={f.codigo}
                      data-fonte={f.codigo}
                      className="border-t border-[color:var(--color-border)] align-top"
                    >
                      <th scope="row" className="py-2 pr-3 font-normal">
                        {f.codigo} — {f.descricao}
                        <FormDaNatureza
                          fonteCodigo={f.codigo}
                          fonteDescricao={f.descricao}
                          naturezaAtual={f.natureza}
                          contaAtual={f.contaDeControle}
                        />
                      </th>
                      <td className="py-2 pr-3" data-papel="natureza-declarada">
                        {f.naturezaRotulo === null ? (
                          <Badge status="alerta">Não declarada</Badge>
                        ) : (
                          <>
                            {f.naturezaRotulo}
                            <span className="ml-2 text-[color:var(--color-ink-3)]">
                              versão {String(f.versao)}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-3" data-papel="conta-de-controle">
                        {f.contaDeControle ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                        {f.fundamento ?? "—"}
                        {f.criadoPor === null ? null : (
                          <span className="block text-[color:var(--color-ink-3)]">
                            por {f.criadoPor}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NaturezasDoEnte>
      </Card>
    </div>
  );
}
