import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../../../components/ui/Card";
import { PageHeader } from "../../../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../../../components/ui/ValorMonetario";
import { exigirLeitura } from "../../../../../../../lib/portas/molde";
import { verContracheque } from "../../../../../../../lib/portas/recursos/folha-dados";
import type { MemoriaLida } from "../../../../../../../modules/m33-folha/memoria-do-contracheque";

/**
 * O CONTRACHEQUE COM A MEMÓRIA DE CÁLCULO (TR 5.12.51, 5.12.53, 5.12.54) — sem imprimir nada.
 *
 * ⚠️ CADA LINHA MOSTRA A CONTA, não só o valor: o vencimento com o fator de dias, o percentual
 * sobre a base, os lançamentos somados, as faixas percorridas da contribuição e os três cenários
 * do imposto com o que cada um deduziu. É a memória gravada no cálculo, não uma recontagem da
 * tela — e o sha256 ao pé é o dela.
 */
export const dynamic = "force-dynamic";

/**
 * A MEDIDA DESTA FOLHA — dias (mensal) ou AVOS (13º), e nunca um chute.
 *
 * ⚠️ O `${c.dias}/30 dias` como padrão era mentira na folha de 13º: ali `diasComputados` é ZERO
 * por desenho (o CHECK `ck_contracheque_avos_ou_dias` exige exatamente isso quando há avos), e a
 * tela anunciava "0/30 dias" a quem trabalhou o ano inteiro.
 */
function medida(m: MemoriaLida, diasDaColuna: number): string {
  if (m.avos.situacao === "PRESENTE") return `${m.avos.dados.computados}/${m.avos.dados.de} avos`;
  if (m.dias.situacao === "PRESENTE") return m.dias.dados.explicacao;
  // A memória DECLARA a grandeza (V11 V9.4b): quem mede diferença diz que mede diferença.
  if (m.medida.situacao === "PRESENTE") return m.medida.dados.explicacao;
  if (m.avos.situacao === "ILEGIVEL") return `medida não reconhecida na memória (${m.avos.motivo})`;
  if (m.medida.situacao === "ILEGIVEL") return `medida não reconhecida na memória (${m.medida.motivo})`;
  /**
   * ⚠️ O RAMO FINAL NÃO INVENTA UNIDADE — e este é o conserto de um defeito que já tinha sido
   * consertado uma vez, do jeito errado (V11 V9.4b).
   *
   * O docblock acima existe porque `${c.dias}/30 dias` "era mentira na folha de 13º". A correção
   * de então ENUMEROU o caso conhecido (`avos`) e deixou o ramo final fabricando dias — e o tipo
   * SEGUINTE caiu exatamente ali: o percurso mediu **"30/30 dias"** no cabeçalho de um
   * contracheque COMPLEMENTAR cujo líquido era 450,00 de diferença. Enumerar a forma acha só as
   * formas enumeradas; é a regra com nome deste repositório, e ela cobrou duas vezes no mesmo
   * ponto.
   *
   * Agora a grandeza é DECLARADA pela memória (`NATUREZA_DO_TIPO_DE_FOLHA.medida` diz qual é por
   * tipo) e a tela renderiza o que foi declarado. Sem declaração, ela diz que não sabe: `dias` da
   * COLUNA continua sendo mostrado porque é dado gravado e verdadeiro, mas sem afirmar que ele
   * mede este documento.
   *
   * ⚠️ PENDÊNCIA NOMEADA — `MEDIDA-DECLARADA-SO-NA-COMPLEMENTAR`: `MENSAL`,
   * `ADIANTAMENTO_DECIMO_TERCEIRO` e `DECIMO_TERCEIRO` ainda são reconhecidos pelos blocos
   * `dias`/`avos` que já escreviam, não pela declaração. Enquanto os quatro tipos não declararem
   * `medida`, um tipo NOVO que não escreva `dias` nem `avos` cai neste ramo — e agora cai dizendo
   * que não sabe, em vez de mentindo. Fechar a propriedade é fazer os quatro motores declararem.
   */
  return `${diasDaColuna}/30 dias registrados no cálculo — a memória não declara que grandeza este contracheque mede`;
}

/**
 * O que se mostra quando um bloco NÃO está presente.
 *
 * ⚠️ AUSENTE E ILEGÍVEL NÃO SE MISTURAM. "Não incide, e aqui está o porquê" é informação; "a
 * memória traz um detalhamento que esta tela não entendeu" é um DEFEITO, e ele aparece em vez de
 * virar espaço em branco. Foi um espaço em branco — um `as` — que derrubou esta página.
 */
function SemBloco({ b }: { readonly b: { readonly situacao: "AUSENTE" | "ILEGIVEL"; readonly motivo: string } }): React.ReactElement {
  if (b.situacao === "AUSENTE") return <p className="text-xs text-[color:var(--color-ink-2)]">{b.motivo}</p>;
  return (
    <p role="alert" className="text-xs text-[color:var(--color-perigo)]">
      A memória deste cálculo traz um detalhamento que esta tela não reconheceu: {b.motivo}. O valor total continua
      correto nos totais acima; o que falta é a explicação da conta. Avise a administração do sistema.
    </p>
  );
}


export default async function Pagina({ params }: { readonly params: Promise<{ readonly id: string; readonly vinculoId: string }> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id, vinculoId } = await params;
  const c = await verContracheque(id, vinculoId);
  if (c === null) notFound();
  // ⚠️ SEM CAST. A porta já devolve a memória LIDA (`lerMemoriaDoContracheque`), com cada bloco
  // dizendo se está presente, ausente com motivo, ou ilegível — ver o cabeçalho daquele arquivo.
  const m = c.memoria;
  return (
    <div className="space-y-4">
      <PageHeader
        titulo={`Contracheque de ${c.servidor}`}
        subtitulo={`Matrícula ${c.matricula} · competência ${c.competencia} · cálculo nº ${c.calculoNumero} · regime ${c.regime} · ${medida(m, c.dias)}`}
      />
      <p className="text-xs">
        <Link href={`/folha/folhas/${c.folhaId}`} className="text-[color:var(--color-acento)] underline underline-offset-2">
          Voltar à folha de {c.competencia}
        </Link>
      </p>

      {/*
        ⚠️ A DECLARAÇÃO DO DOCUMENTO VEM ANTES DOS NÚMEROS, E VEM PORQUE FALTAVA (V11 V9.4b).
        A memória do contracheque complementar já dizia, lacrada no sha256, que ele NÃO é a
        remuneração da competência e sob que regime a retenção foi calculada. Nada disso chegava à
        tela: o servidor lia um contracheque de 450,00 e concluía que ganhara 450,00 no mês. Uma
        declaração que não chega a quem lê não produz efeito — é a doença desta rodada inteira.
        Só aparece quando a memória declara; num contracheque mensal não há bloco e não há ruído.
      */}
      {m.natureza.situacao === "PRESENTE" || m.regimeDeTributacao.situacao === "PRESENTE" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">O que este documento é</h2>
          {m.natureza.situacao === "PRESENTE" ? (
            <p data-natureza-do-contracheque className="text-xs text-[color:var(--color-ink)]">{m.natureza.dados}</p>
          ) : null}
          {m.regimeDeTributacao.situacao === "PRESENTE" ? (
            <p data-regime-de-tributacao className="mt-2 text-xs text-[color:var(--color-ink-2)]">{m.regimeDeTributacao.dados}</p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Linhas do contracheque</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-2 pr-3 text-left">Código</th>
                <th scope="col" className="py-2 pr-3 text-left">Descrição</th>
                <th scope="col" className="py-2 pr-3 text-left">Como foi calculada</th>
                <th scope="col" className="py-2 pr-3 text-right">Provento</th>
                <th scope="col" className="py-2 text-right">Desconto</th>
              </tr>
            </thead>
            <tbody>
              {c.linhas.map((l) => (
                <tr key={l.id} data-linha={l.codigo} className="border-b border-[color:var(--color-border)] align-top">
                  <td className="py-2 pr-3 font-medium tabular-nums">{l.codigo}</td>
                  <td className="py-2 pr-3 text-[color:var(--color-ink)]">{l.descricao}</td>
                  <td className="py-2 pr-3 text-xs text-[color:var(--color-ink-2)]">{l.memoria}</td>
                  <td className="py-2 pr-3 text-right">{l.tipo === "PROVENTO" ? <ValorMonetario valor={l.valor} /> : null}</td>
                  <td className="py-2 text-right">{l.tipo === "DESCONTO" ? <ValorMonetario valor={l.valor} /> : null}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-semibold">
                <td className="py-2 pr-3" colSpan={3}>Totais</td>
                <td className="py-2 pr-3 text-right"><ValorMonetario valor={c.totais.proventos} /></td>
                <td className="py-2 text-right"><ValorMonetario valor={c.totais.descontos} /></td>
              </tr>
              <tr className="text-sm font-semibold">
                <td className="py-2 pr-3" colSpan={4}>Líquido</td>
                <td className="py-2 text-right"><ValorMonetario valor={c.totais.liquido} comSimbolo /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Contribuição previdenciária</h2>
        {/*
          ⚠️ QUEM RETÉM EXPLICA A RETENÇÃO (V11 V9.4b). Num contracheque de DIFERENÇA a conta não é
          deste documento: o que ele retém é o DELTA (está na linha da rubrica) e a conta que o
          produziu é a do recálculo INTEGRAL. Antes disto a tela caía no `SemBloco` e dizia "a
          memória deste cálculo não traz o detalhamento da contribuição" — enquanto descontava do
          servidor. O silêncio é pior que um número errado: um número errado se questiona, um
          silêncio se lê como "não houve". Aqui o integral é mostrado DITO COMO INTEGRAL, nunca
          como se fosse o valor descontado nesta folha.
        */}
        {m.contribuicao.situacao !== "PRESENTE" && m.contribuicaoDoRecalculoIntegral.situacao === "PRESENTE" ? (
          <div data-contribuicao-do-integral className="space-y-2 text-xs text-[color:var(--color-ink-2)]">
            <p className="text-[color:var(--color-ink)]">
              Esta folha retém a DIFERENÇA de contribuição, e o valor retido é o que está na linha da rubrica acima.
              A conta abaixo é o recálculo INTEGRAL da competência — a base de onde a diferença saiu —, e não o valor
              descontado neste documento.
            </p>
            <p>
              Regime {m.contribuicaoDoRecalculoIntegral.dados.regime} · base {m.contribuicaoDoRecalculoIntegral.dados.base}
              {m.contribuicaoDoRecalculoIntegral.dados.tetoAplicado ? ` (teto aplicado sobre ${m.contribuicaoDoRecalculoIntegral.dados.baseAntesDoTeto})` : ""}
              {" "}· contribuição integral da competência {m.contribuicaoDoRecalculoIntegral.dados.aplicada}
            </p>
            <ul className="list-disc pl-4">
              {m.contribuicaoDoRecalculoIntegral.dados.faixas.map((f) => (
                <li key={f.ordem}>
                  faixa {f.de}–{f.ate} · base na faixa {f.baseNaFaixa} · alíquota {f.aliquota} · {f.valor}
                </li>
              ))}
            </ul>
            <p>{m.contribuicaoDoRecalculoIntegral.dados.fundamentacao}</p>
          </div>
        ) : m.contribuicao.situacao !== "PRESENTE" ? (
          <SemBloco b={m.contribuicao} />
        ) : (
          <div className="space-y-2 text-xs text-[color:var(--color-ink-2)]">
            <p>
              Regime {m.contribuicao.dados.regime} · base {m.contribuicao.dados.base}
              {m.contribuicao.dados.tetoAplicado ? ` (teto aplicado sobre ${m.contribuicao.dados.baseAntesDoTeto})` : ""} · descontado {m.contribuicao.dados.aplicada}
            </p>
            {m.contribuicao.dados.imposta !== undefined ? <p className="text-[color:var(--color-ink)]">Imposta pela acumulação: {m.contribuicao.dados.imposta}</p> : null}
            {m.contribuicao.dados.faixas.length > 0 ? (
              <ul className="ml-4 list-disc">
                {m.contribuicao.dados.faixas.map((f) => (
                  <li key={f.ordem}>faixa {f.ordem}: {f.baseNaFaixa} x {f.aliquota} = {f.valor} (de {f.de} ate {f.ate})</li>
                ))}
              </ul>
            ) : null}
            <p>Fundamentação: {m.contribuicao.dados.fundamentacao}</p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Imposto de renda retido na fonte</h2>
        {m.irrf.situacao !== "PRESENTE" ? (
          <SemBloco b={m.irrf} />
        ) : (
          <div className="space-y-2 text-xs text-[color:var(--color-ink-2)]">
            <p>Renda tributável {m.irrf.dados.rendaTributavel} · base {m.irrf.dados.base} · retido {m.irrf.dados.aplicado} · cenário escolhido: {m.irrf.dados.cenario} (o de menor imposto entre os aplicáveis)</p>
            {m.irrf.dados.imposto !== undefined ? <p className="text-[color:var(--color-ink)]">Imposto pela acumulação: {m.irrf.dados.imposto}</p> : null}
            <ul className="ml-4 list-disc">
              {m.irrf.dados.cenarios.map((x) => (
                <li key={x.nome} className={x.nome === (m.irrf.situacao === "PRESENTE" ? m.irrf.dados.cenario : "") ? "text-[color:var(--color-ink)]" : ""}>
                  {x.nome}: {x.aplicavel ? `base ${x.base} → ${x.valor}${x.deducoes.length > 0 ? ` (deduções: ${x.deducoes.map((d) => `${d.tipo} ${d.valor}`).join(", ")})` : ""}` : `não aplicável — ${x.motivo ?? "sem motivo declarado"}`}
                </li>
              ))}
            </ul>
            <p>Fundamentação: {m.irrf.dados.fundamentacao}</p>
          </div>
        )}
      </Card>

      {m.salarioFamilia.situacao === "PRESENTE" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Salário-família</h2>
          <div className="space-y-2 text-xs text-[color:var(--color-ink-2)]">
            <p>Renda bruta {m.salarioFamilia.dados.rendaBruta} (máxima {m.salarioFamilia.dados.rendaMaxima}) · {m.salarioFamilia.dados.elegiveis} dependente(s) elegível(is) x {m.salarioFamilia.dados.valorPorDependente} = {m.salarioFamilia.dados.valor}</p>
            <ul className="ml-4 list-disc">
              {m.salarioFamilia.dados.considerados.map((d) => (
                <li key={d.nome}>{d.nome}, {d.idade} anos: {d.elegivel ? "elegível" : `não elegível — ${d.motivo ?? "sem motivo declarado"}`}</li>
              ))}
            </ul>
            <p>Fundamentação: {m.salarioFamilia.dados.fundamentacao}</p>
          </div>
        </Card>
      ) : m.salarioFamilia.situacao === "ILEGIVEL" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Salário-família</h2>
          <SemBloco b={m.salarioFamilia} />
        </Card>
      ) : null}

      {m.avos.situacao === "PRESENTE" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Avos do exercício</h2>
          {/*
            ⚠️ OS DOZE MESES, E NÃO SÓ O TOTAL. "9/12" sozinho é indefensável: quem recebeu nove
            avos quer saber QUAIS três meses não contaram, e o controle interno quer conferir sem
            recalcular. O motor já gravava mês a mês com o motivo; a tela é que não mostrava.
          */}
          <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">
            {m.avos.dados.computados} de {m.avos.dados.de} avos · um mês conta quando alcança {m.avos.dados.diasMinimos} dia(s)
            computado(s). A medida do 13º é o MÊS, não o dia: o mês conta inteiro ou não conta.
          </p>
          <ul className="ml-4 list-disc text-xs text-[color:var(--color-ink-2)]">
            {m.avos.dados.meses.map((x) => (
              <li key={x.mes} className={x.conta ? "text-[color:var(--color-ink)]" : ""}>
                {x.mes}: {x.explicacao}
              </li>
            ))}
          </ul>
        </Card>
      ) : m.avos.situacao === "ILEGIVEL" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Avos do exercício</h2>
          <SemBloco b={m.avos} />
        </Card>
      ) : null}

      {m.procedenciaDoAbatimento.situacao === "PRESENTE" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">De onde veio o abatimento</h2>
          {/*
            ⚠️ O QUE SUSTENTA O DESCONTO, E O QUE NÃO SUSTENTA — E DESDE A V11 V9.3 ISSO VARIA.
            Quando o ente DECLAROU o critério (no parâmetro versionado, com ato), o contracheque
            diz qual estado foi exigido e qual foi verificado, e quem lê confere contra o ato. Sem
            declaração, o desconto saiu pelo FECHAMENTO — critério de engenharia — e o documento
            tem de dizer que aquilo é SIMULAÇÃO, em vez de calar. O motivo gravado vem junto, por
            escrito, e é ele que o servidor leva a quem for reclamar.
          */}
          <div className="space-y-1 text-xs text-[color:var(--color-ink-2)]">
            {m.procedenciaDoAbatimento.dados.natureza === "SIMULACAO" ? (
              <p className="font-semibold text-[color:var(--color-ink)]">
                SIMULAÇÃO — não é apuração aprovada. O ente não declarou qual estado o adiantamento precisa ter
                alcançado para ser abatido.
              </p>
            ) : null}
            <p>
              1ª parcela apurada na folha de adiantamento de {m.procedenciaDoAbatimento.dados.folhaDeAdiantamento} ·
              cálculo nº {m.procedenciaDoAbatimento.dados.calculoNumero} · certificação {m.procedenciaDoAbatimento.dados.situacaoDaCertificacao} ·
              parâmetro na versão {m.procedenciaDoAbatimento.dados.versaoDoParametroDoAdiantamento}
            </p>
            {m.procedenciaDoAbatimento.dados.estadoVerificado === undefined ? null : (
              <p>
                Critério exigido pelo ente: {m.procedenciaDoAbatimento.dados.estadoExigidoPeloEnte ?? "nenhum declarado"} ·
                estado verificado neste cálculo: {m.procedenciaDoAbatimento.dados.estadoVerificado}
              </p>
            )}
            <p>{m.procedenciaDoAbatimento.dados.motivo}</p>
          </div>
        </Card>
      ) : null}

      {m.incidencias.situacao === "PRESENTE" ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Incidências desta parcela</h2>
          <p className="text-xs text-[color:var(--color-ink-2)]">
            Contribuição: {m.incidencias.dados.contribuicao ? "incide" : "não incide"} · imposto de renda:{" "}
            {m.incidencias.dados.irrf ? "incide" : "não incide"}. {m.incidencias.dados.motivo}
          </p>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Impressão digital</h2>
        <p className="break-all font-mono text-xs text-[color:var(--color-ink-2)]" data-sha256={c.sha256}>{c.sha256}</p>
        <p className="mt-1 text-[11px] text-[color:var(--color-ink-3)]">
          sha256 da memória canônica deste contracheque. Recalcular com os mesmos dados devolve o mesmo valor; um centavo
          diferente muda o hash inteiro.
        </p>
      </Card>
    </div>
  );
}
