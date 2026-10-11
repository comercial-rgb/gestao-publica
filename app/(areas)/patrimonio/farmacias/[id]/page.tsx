import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../components/ui/Card";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerTelaDaFarmacia } from "../../../../../lib/portas/farmacia-operacao";
import { diaCivil } from "../../../../../packages/datas/index";
import { FormAjuste, FormCorrigirDispensacao, FormDispensar, FormTrocarDeposito, FormVincularDeposito } from "./Forms";

/**
 * V39-R2 (R2-030, R2-031) — A OPERAÇÃO DA FARMÁCIA: o depósito do almoxarifado que guarda o estoque dela, o estoque por
 * lote com o vencido marcado, a dispensação ao usuário e a perda ou sobra apurada (com o inventário do depósito).
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";
const CELULA = "px-2 py-1 align-top";

export default async function OperacaoDaFarmacia({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const { id } = await params;
  const t = await lerTelaDaFarmacia(id);
  if (t === null) notFound();
  const hoje = diaCivil(new Date());
  const opcoes = t.lotes.map((l) => ({ loteId: l.loteId, rotulo: `${l.material} — lote ${l.lote}, validade ${l.validade}${l.vencido ? " (vencido)" : ""}, saldo ${l.saldo}` }));
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo={`Farmácia ${t.codigo}`} subtitulo={`${t.descricao}: estoque, dispensação e perdas`} />
      <p className="text-xs"><Link className="underline" href="/patrimonio/farmacias">Voltar às farmácias</Link></p>

      <Card>
        <section aria-labelledby="t-dep" data-deposito-da-farmacia>
          <h2 className="text-sm font-semibold" id="t-dep">Depósito</h2>
          {t.deposito !== null ? (
            <p className="mt-1 text-xs">
              O estoque desta farmácia é o do depósito <strong>{t.deposito.codigo} — {t.deposito.nome}</strong>. A dispensação baixa o estoque dele e lança o consumo; a perda e a sobra são ajustes dele.
              {" "}O inventário é o do almoxarifado: <Link className="underline" href="/patrimonio/almoxarifado/inventarios">abrir ou contar o inventário do depósito</Link>.
            </p>
          ) : null}
          {t.deposito !== null && t.trocas.length > 0 ? (
            <div className="mt-2 text-xs" data-trocas-do-deposito>
              <p className="font-semibold">Trocas do depósito</p>
              <ul className="mt-1 space-y-1">
                {t.trocas.map((x) => <li data-troca={x.vigenteDesde} key={x.vigenteDesde}>a partir de {x.vigenteDesde}: de {x.de} para {x.para} ({x.fundamento}); por {x.por}</li>)}
              </ul>
              {t.saldoNoDepositoAnterior.length > 0 ? (
                <p className="mt-1" data-saldo-no-deposito-anterior>
                  Ficou no depósito anterior, sem transferência: {t.saldoNoDepositoAnterior.map((m) => `${m.material} ${m.saldo}`).join("; ")}. Transfira pelo almoxarifado se o estoque for acompanhar a farmácia.
                </p>
              ) : null}
            </div>
          ) : null}
          {t.deposito !== null && t.pode.trocar ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-primary)]">Trocar o depósito da farmácia</summary>
              <div className="mt-1"><FormTrocarDeposito depositos={t.depositosParaTroca} farmaciaId={t.id} hoje={hoje} /></div>
            </details>
          ) : null}
          {t.deposito === null ? (
            <>
              <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">A farmácia ainda não tem depósito: sem ele não há estoque para dispensar.</p>
              {t.pode.vincular ? <div className="mt-2"><FormVincularDeposito depositos={t.depositosLivres} farmaciaId={t.id} /></div> : null}
            </>
          ) : null}
        </section>
      </Card>

      {t.deposito !== null ? (
        <Card>
          <section aria-labelledby="t-lotes" data-estoque-por-lote>
            <h2 className="text-sm font-semibold" id="t-lotes">Estoque por lote</h2>
            {t.lotes.length === 0 ? <p className="mt-1 text-xs">Nenhum lote com saldo no depósito.</p> : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-xs">
                  <caption className="sr-only">Lotes com saldo no depósito da farmácia</caption>
                  <thead><tr className="text-left text-[color:var(--color-ink-2)]"><th className={CELULA} scope="col">Medicamento</th><th className={CELULA} scope="col">Lote</th><th className={CELULA} scope="col">Validade</th><th className={`${CELULA} text-right`} scope="col">Saldo</th></tr></thead>
                  <tbody>
                    {t.lotes.map((l) => (
                      <tr className="border-t border-[color:var(--color-border)]" data-lote={l.lote} data-vencido={l.vencido ? "sim" : "nao"} key={l.loteId}>
                        <td className={CELULA}>{l.material}</td>
                        <td className={CELULA}>{l.lote}</td>
                        <td className={CELULA}>{l.validade}{l.vencido ? " — vencido: não se dispensa; baixe como perda" : ""}</td>
                        <td className={`${CELULA} text-right`}>{l.saldo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </Card>
      ) : null}

      {t.deposito !== null && t.pode.dispensar ? (
        <Card>
          <section aria-labelledby="t-disp">
            <h2 className="text-sm font-semibold" id="t-disp">Dispensar</h2>
            <div className="mt-2"><FormDispensar farmaciaId={t.id} hoje={hoje} lotes={opcoes} /></div>
          </section>
        </Card>
      ) : null}

      {t.deposito !== null && t.pode.ajustar ? (
        <Card>
          <section aria-labelledby="t-aj">
            <h2 className="text-sm font-semibold" id="t-aj">Perda ou sobra</h2>
            <div className="mt-2"><FormAjuste farmaciaId={t.id} hoje={hoje} inventarios={t.inventarios} lotes={opcoes} /></div>
          </section>
        </Card>
      ) : null}

      <Card>
        <section aria-labelledby="t-lista" data-dispensacoes>
          <h2 className="text-sm font-semibold" id="t-lista">Dispensações</h2>
          {!t.dadosDoUsuarioVisiveis ? <p className="mt-1 text-xs text-[color:var(--color-ink-2)]" data-dados-do-usuario-ocultos>O identificador do usuário e a receita aparecem só para quem dispensa nesta unidade.</p> : null}
          {t.dispensacoes.length === 0 ? <p className="mt-1 text-xs">Nenhuma dispensação registrada.</p> : (
            <ul className="mt-2 space-y-1 text-xs">
              {t.dispensacoes.map((d) => (
                <li data-dispensacao={d.numero} key={d.numero}>
                  nº {d.numero}, {d.data}{d.usuario !== null ? `, usuário ${d.usuario}, ${d.receita ?? ""}` : ""}: {d.itens}; por {d.por}
                  {d.itensDetalhados.some((i) => i.correcao !== null) ? (
                    <ul className="ml-4 list-disc" data-correcoes-da-dispensacao>
                      {d.itensDetalhados.filter((i) => i.correcao !== null).map((i) => <li data-correcao-do-item={i.rotulo} key={i.id}>{i.rotulo}: {i.correcao}</li>)}
                    </ul>
                  ) : null}
                  {d.podeCorrigir ? <FormCorrigirDispensacao dispensacaoId={d.id} farmaciaId={t.id} hoje={hoje} itens={d.itensDetalhados.filter((i) => i.correcao === null).map((i) => ({ id: i.id, rotulo: i.rotulo }))} numero={d.numero} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      <Card>
        <section aria-labelledby="t-ajustes" data-ajustes-da-farmacia>
          <h2 className="text-sm font-semibold" id="t-ajustes">Perdas e sobras</h2>
          {t.ajustes.length === 0 ? <p className="mt-1 text-xs">Nenhuma perda ou sobra registrada.</p> : (
            <ul className="mt-2 space-y-1 text-xs">
              {t.ajustes.map((a, i) => (
                <li data-ajuste={a.sentido} key={`${a.data}-${String(i)}`}>{a.data}, {a.sentido} de {a.item}: {a.motivo}{a.destino !== null ? `; destino: ${a.destino}` : ""}; <span data-custo-do-ajuste>{a.valor}</span>; por {a.por}</li>
              ))}
            </ul>
          )}
        </section>
      </Card>
    </div>
  );
}
