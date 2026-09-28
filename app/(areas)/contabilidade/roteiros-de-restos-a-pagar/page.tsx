import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  contasParaRoteiroDeRestos,
  listarRoteirosDeRestos,
} from "../../../../lib/portas/roteiro-restos";
import { ContasDasOperacoes, FormDaOperacao } from "./FormRoteiroDeRestos";

/**
 * AS CONTAS DAS OPERAÇÕES DE RESTOS A PAGAR — onde o ente diz em que contas cada ato lança (V15).
 *
 * ═══ ⚠️ POR QUE ESTA TELA EXISTE ═══
 * O domínio dos restos a pagar é dos mais maduros do repositório e nenhuma de suas operações era
 * alcançável: as contas vêm por parâmetro e não havia de onde tirá-las. A alternativa — escolher
 * as contas no código — seria fabricar norma no lugar de quem tem competência para editá-la.
 *
 * ⚠️ A AUSÊNCIA APARECE, COM NOME. Operação sem contas é mostrada como NÃO CONFIGURADA, e a
 * explicação diz o que o ato faz — para quem configura saber o que está classificando. É o
 * oposto de oferecer um botão que não pode funcionar.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const EXPLICACAO: Record<string, string> = {
  LIQUIDACAO_NAO_PROCESSADO:
    "A despesa empenhada em exercício anterior é liquidada e a obrigação com o credor é reconhecida, sem novo empenho e sem consumo de dotação do exercício corrente.",
  PAGAMENTO:
    "O pagamento extingue a obrigação. Informe apenas as contas de controle da disponibilidade por destinação de recursos.",
  CANCELAMENTO_PROCESSADO:
    "A obrigação já reconhecida é baixada sem saída de caixa, com registro de variação patrimonial aumentativa.",
  CANCELAMENTO_NAO_PROCESSADO:
    "O compromisso ainda não liquidado é cancelado. As contas diferem das utilizadas no cancelamento de restos processados.",
};

export default async function Page(): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");

  const [linhas, contas] = await Promise.all([
    listarRoteirosDeRestos(),
    contasParaRoteiroDeRestos(),
  ]);

  const faltando = linhas.filter((l) => l.vigente === null).length;

  return (
    <div>
      <PageHeader
        titulo="Contas das operações de restos a pagar"
        subtitulo="Contas contábeis utilizadas em cada operação de restos a pagar"
      />

      {faltando > 0 ? (
        <p className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {faltando === 1
            ? "Uma operação ainda não tem contas informadas e por isso não pode ser executada."
            : `${faltando} operações ainda não têm contas informadas e por isso não podem ser executadas.`}
        </p>
      ) : null}

      <ContasDasOperacoes patrimoniais={contas.patrimoniais} controle={contas.controle}>
        <>
          {linhas.map((l) => (
            <Card key={l.evento}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">{l.rotulo}</h2>
                  <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{EXPLICACAO[l.evento]}</p>
                </div>
                {l.vigente === null ? (
                  <Badge status="alerta">Não configurada</Badge>
                ) : (
                  <Badge status="ok">Versão {l.vigente.versao}</Badge>
                )}
              </div>

              {l.vigente !== null ? (
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {l.vigente.patrimonial !== null ? (
                    <>
                      <div>
                        <dt className="text-[color:var(--color-ink-2)]">Débito</dt>
                        <dd className="font-medium">{l.vigente.patrimonial.debito}</dd>
                      </div>
                      <div>
                        <dt className="text-[color:var(--color-ink-2)]">Crédito</dt>
                        <dd className="font-medium">{l.vigente.patrimonial.credito}</dd>
                      </div>
                    </>
                  ) : null}
                  {l.vigente.controle !== null ? (
                    <>
                      <div>
                        <dt className="text-[color:var(--color-ink-2)]">Disponibilidade — débito</dt>
                        <dd className="font-medium">{l.vigente.controle.debito}</dd>
                      </div>
                      <div>
                        <dt className="text-[color:var(--color-ink-2)]">Disponibilidade — crédito</dt>
                        <dd className="font-medium">{l.vigente.controle.credito}</dd>
                      </div>
                    </>
                  ) : null}
                  {l.vigente.fundamento !== null ? (
                    <div className="sm:col-span-2">
                      <dt className="text-[color:var(--color-ink-2)]">Motivo registrado</dt>
                      <dd>{l.vigente.fundamento}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              <FormDaOperacao
                evento={l.evento}
                rotulo={l.rotulo}
                patrimonialSeInforma={l.patrimonialSeInforma}
              />
            </Card>
          ))}
        </>
      </ContasDasOperacoes>

      <p className="mt-6 text-sm text-[color:var(--color-ink-2)]">
        Uma nova versão vale para os lançamentos seguintes e não altera os lançamentos já
        realizados.
      </p>
    </div>
  );
}
