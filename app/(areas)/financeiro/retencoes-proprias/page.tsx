import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { anoCivil } from "../../../../packages/datas/index";
import {
  lerClassificacoesDaRetencaoPropria,
  lerOpcoesDaClassificacao,
  lerPrevistoArrecadadoDosImpostosRetidos,
  lerRetencoesAntigasDoMunicipio,
} from "../../../../lib/portas/retencoes-proprias";
import { FormDaClassificacao } from "./FormDaClassificacao";
import { LinhaDoLegado } from "./LegadoDaConsignacao";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V26 — O IR E O ISS RETIDOS PELO PRÓPRIO MUNICÍPIO: a decisão do ente que transforma a retenção em receita.
 *
 * Sem decisão para um imposto, o pagamento que o retém é recusado com o nome desta tela — o servidor não escolhe
 * natureza, destinação nem conta pelo ente.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function RetencoesPropriasPage(): Promise<React.ReactElement> {
  let decisoes: Awaited<ReturnType<typeof lerClassificacoesDaRetencaoPropria>>;
  let opcoes: Awaited<ReturnType<typeof lerOpcoesDaClassificacao>>;
  let antigas: Awaited<ReturnType<typeof lerRetencoesAntigasDoMunicipio>>;
  let quadro: Awaited<ReturnType<typeof lerPrevistoArrecadadoDosImpostosRetidos>>;
  const exercicio = anoCivil(new Date());
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
    decisoes = await lerClassificacoesDaRetencaoPropria();
    opcoes = await lerOpcoesDaClassificacao();
    antigas = await lerRetencoesAntigasDoMunicipio();
    quadro = await lerPrevistoArrecadadoDosImpostosRetidos(exercicio);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Retenções do próprio município" subtitulo="IR e ISS retidos nos pagamentos, como receita do município" />
        <EstadoVazio titulo="Não foi possível carregar as decisões" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }

  const semDecisao = opcoes.fatos.filter((f) => !decisoes.some((d) => d.fato === f.fato && d.vigente));

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Retenções do próprio município" subtitulo="IR e ISS retidos nos pagamentos, como receita do município" />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O imposto de renda retido sobre o que o município paga pertence ao próprio município (Constituição, art. 158, I), e
        o ISS retido de prestador de serviço no município é imposto municipal. Por isso eles <strong>entram como receita no
        próprio pagamento</strong>: o banco sai só pelo valor líquido e a receita aparece na execução, sem recolhimento
        posterior. O INSS continua como consignação a recolher.
      </div>

      {semDecisao.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="retencoes-sem-decisao">
          <strong>Sem decisão vigente: {semDecisao.map((f) => f.rotulo).join("; ")}.</strong> O pagamento que reter esse
          imposto é recusado até a decisão ser registrada.
        </div>
      ) : null}

      <FormDaClassificacao opcoes={opcoes} />

      {decisoes.length === 0 ? (
        <EstadoVazio titulo="Nenhuma decisão registrada" descricao="Registre a decisão de cada imposto no painel acima." />
      ) : (
        <Card>
          <table className="w-full text-sm" data-lista="retencoes-proprias">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                <th className="py-1.5 pr-4">Imposto</th>
                <th className="py-1.5 pr-4">Receita</th>
                <th className="py-1.5 pr-4">Contas</th>
                <th className="py-1.5 pr-4">Vale a partir de</th>
                <th className="py-1.5">Decisão</th>
              </tr>
            </thead>
            <tbody>
              {decisoes.map((d) => (
                <tr key={d.id} className="border-b border-[color:var(--color-border)] align-top" data-retencao-propria={d.fato} data-vigente={d.vigente ? "sim" : "nao"}>
                  <td className="py-1.5 pr-4">
                    <strong>{d.rotulo}</strong>
                    <span className="block text-xs text-[color:var(--color-ink-3)]">antes retido como {d.tipoConsignacao}</span>
                  </td>
                  <td className="py-1.5 pr-4 text-xs">
                    natureza <span className="font-mono">{d.natureza}</span>
                    <span className="block">fonte {d.fonte}</span>
                    {d.tesouro !== null ? <span className="block text-[color:var(--color-ink-3)]">{d.tesouro}</span> : null}
                  </td>
                  <td className="py-1.5 pr-4 font-mono text-xs">
                    {d.contaCredito}
                    <span className="block">{d.contaVpa}</span>
                  </td>
                  <td className="py-1.5 pr-4 text-xs">
                    {d.vigenteDesdeTexto}
                    <span className="block">
                      <Badge status={d.vigente ? "neutro" : "alerta"}>{d.vigente ? "Vigente" : "Substituída ou futura"}</Badge>
                    </span>
                  </td>
                  <td className="py-1.5 text-xs text-[color:var(--color-ink-2)]">
                    {d.fundamento}
                    <span className="block text-[color:var(--color-ink-3)]">por {d.por}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Retenções antigas que ficaram como consignação</h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
          IR e ISS do próprio município retidos antes da decisão acima, que ainda estão como valor a recolher. A
          regularização os baixa contra a receita, sem saída de dinheiro do banco; a retenção original continua registrada.
        </p>
        {antigas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-teste="sem-retencoes-antigas">Nenhuma retenção antiga do município com saldo a regularizar.</p>
        ) : (
          <table className="w-full text-sm" data-lista="retencoes-antigas">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                <th className="py-1.5 pr-4">Retenção</th>
                <th className="py-1.5 pr-4">Valores</th>
                <th className="py-1.5">Regularizar</th>
              </tr>
            </thead>
            <tbody>
              {antigas.map((r) => (
                <LinhaDoLegado key={r.ingressoId} r={r} />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Previsto na LOA e arrecadado em {exercicio}</h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
          Imposto de renda e ISS, por natureza de receita. Quando a LOA prevê o imposto numa natureza e a arrecadação
          entra em outra (por exemplo, a previsão no IR da pessoa física e a execução no IR retido na fonte), as duas
          aparecem lado a lado. A previsão publicada não é alterada aqui: ajustar o enquadramento orçamentário é ato do
          município.
        </p>
        {quadro.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma previsão nem arrecadação de imposto de renda ou ISS no exercício.</p>
        ) : (
          <table className="w-full text-sm" data-lista="previsto-arrecadado-impostos">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                <th className="py-1.5 pr-4">Imposto</th>
                <th className="py-1.5 pr-4">Natureza</th>
                <th className="py-1.5 pr-4 text-right">Previsto</th>
                <th className="py-1.5 text-right">Arrecadado</th>
              </tr>
            </thead>
            <tbody>
              {quadro.map((l) => (
                <tr key={l.natureza} className="border-b border-[color:var(--color-border)]" data-natureza={l.natureza}>
                  <td className="py-1.5 pr-4 text-xs">{l.familia}</td>
                  <td className="py-1.5 pr-4 text-xs"><span className="font-mono">{l.natureza}</span> <span className="text-[color:var(--color-ink-3)]">{l.descricao}</span></td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{l.previsto}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.arrecadado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
