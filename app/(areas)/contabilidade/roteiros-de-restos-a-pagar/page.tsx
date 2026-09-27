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
    "O serviço empenhado no ano anterior é atestado agora: a despesa é reconhecida e a obrigação com o credor passa a existir. Nenhum empenho novo nasce, e nenhuma dotação do ano corrente é consumida.",
  PAGAMENTO:
    "O dinheiro sai e a obrigação se extingue. O que se informa aqui é apenas o controle da disponibilidade por destinação de recursos.",
  CANCELAMENTO_PROCESSADO:
    "A obrigação já reconhecida deixa de existir sem saída de caixa, e o município fica com um ganho patrimonial.",
  CANCELAMENTO_NAO_PROCESSADO:
    "O compromisso que ainda não havia sido atestado é desfeito. Como ele nunca virou obrigação reconhecida, as contas não são as mesmas do cancelamento de um resto processado.",
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
        subtitulo="Em que contas cada ato de restos a pagar lança. Enquanto uma operação não tiver contas informadas, ela é recusada com o motivo — nenhuma conta é assumida por padrão."
      />

      {faltando > 0 ? (
        <p className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {faltando === 1
            ? "Uma operação ainda não tem contas informadas e por isso não pode ser executada."
            : `${faltando} operações ainda não têm contas informadas e por isso não podem ser executadas.`}
        </p>
      ) : null}

      <ContasDasOperacoes patrimoniais={contas.patrimoniais} controle={contas.controle}>
        <div className="grid gap-5">
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
        </div>
      </ContasDasOperacoes>

      <p className="mt-6 text-sm text-[color:var(--color-ink-2)]">
        Publicar não altera o que já foi escriturado: cada lançamento guarda a versão contra a qual
        foi feito, e a versão nova vale para o que vier.
      </p>
    </div>
  );
}
