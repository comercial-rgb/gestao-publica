import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { DIAS_DE_AVISO_DA_CNH, lerTelaDaOperacaoDaFrota } from "../../../../../lib/portas/frota-operacao";
import { diaCivil } from "../../../../../packages/datas/index";
import { FormDoAto, type CampoDoAto } from "./FormDoAto";

/**
 * V39-R2 (R2-025 a R2-028) — A OPERAÇÃO DA FROTA: condutores e habilitação, ordens de abastecimento conferidas com o
 * abastecido, leituras e consumo de um bem, e manutenções do pedido à conclusão. ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";
const CELULA = "px-2 py-1 align-top";
const COMBUSTIVEIS = [["GASOLINA", "Gasolina"], ["DIESEL", "Diesel"], ["ETANOL", "Etanol"], ["GAS_NATURAL", "Gás natural"], ["ARLA_32", "Arla 32"], ["ELETRICIDADE", "Eletricidade"]].map(([valor, rotulo]) => ({ valor: valor!, rotulo: rotulo! }));
const CATEGORIAS = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"].map((c) => ({ valor: c, rotulo: c }));

export default async function OperacaoDaFrota({ searchParams }: { readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const sp = await searchParams;
  const bemPedido = typeof sp["bem"] === "string" ? sp["bem"] : undefined;
  const t = await lerTelaDaOperacaoDaFrota(bemPedido);
  const hoje = diaCivil(new Date());
  const bens = t.bens.map((b) => ({ valor: b.chave, rotulo: b.rotulo }));
  const condutoresAtivos = t.condutores.filter((c) => c.ativo).map((c) => ({ valor: c.id, rotulo: `${c.nome} (${c.matricula}, CNH ${c.categoria})` }));
  const dadosDaCnh: readonly CampoDoAto[] = [
    { nome: "cnhNumero", rotulo: "Número da CNH (11 dígitos)", obrigatorio: true },
    { nome: "cnhCategoria", rotulo: "Categoria da CNH", tipo: "selecao", opcoes: CATEGORIAS, obrigatorio: true },
    { nome: "cnhValidade", rotulo: "Validade da CNH", tipo: "data", obrigatorio: true },
    { nome: "vinculo", rotulo: "Vínculo (servidor efetivo, terceirizado...)", obrigatorio: true },
    { nome: "vigenteDesde", rotulo: "Vale desde", tipo: "data", obrigatorio: true, valor: hoje },
    { nome: "fundamento", rotulo: "De onde vêm os dados (CNH apresentada, ato)", obrigatorio: true },
  ];
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Operação da frota" subtitulo="Condutores, ordens de abastecimento, hodômetro e manutenção" />
      <p className="text-xs"><Link className="underline" href="/patrimonio/frota">Voltar à frota</Link></p>

      <Card>
        <section aria-labelledby="t-cond" data-condutores>
          <h2 className="text-sm font-semibold" id="t-cond">Condutores</h2>
          <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">A tela avisa a CNH vencida e a que vence em até {DIAS_DE_AVISO_DA_CNH} dias. Só os dados necessários à habilitação são guardados.</p>
          {t.condutores.length === 0 ? <p className="mt-1 text-xs">Nenhum condutor cadastrado.</p> : (
            <ul className="mt-2 space-y-1 text-xs">
              {t.condutores.map((c) => (
                <li data-condutor={c.matricula} key={c.id}>
                  <strong>{c.nome}</strong> ({c.matricula}): CNH {c.categoria}, validade {c.validade}{c.ativo ? "" : " — inativo"}
                  {c.aviso !== null ? <span className="ml-2 rounded bg-[color:var(--color-status-alerta-bg)] px-1 text-[color:var(--color-status-alerta-fg)]" data-aviso-da-cnh>{c.aviso}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {t.pode.cadastrar ? (
            <div className="mt-2 space-y-2">
              <FormDoAto ato="cadastrar-condutor" botao="Cadastrar" campos={[{ nome: "nome", rotulo: "Nome", obrigatorio: true }, { nome: "matricula", rotulo: "Matrícula ou registro do vínculo", obrigatorio: true }, ...dadosDaCnh]} titulo="Cadastrar condutor" />
              {t.condutores.length > 0 ? (
                <FormDoAto ato="versao-do-condutor" botao="Publicar versão" titulo="Renovação, nova categoria ou desligamento do condutor" campos={[
                  { nome: "condutorId", rotulo: "Condutor", tipo: "selecao", obrigatorio: true, opcoes: t.condutores.map((c) => ({ valor: c.id, rotulo: `${c.nome} (${c.matricula})` })) },
                  { nome: "ativo", rotulo: "Continua dirigindo pela unidade?", tipo: "selecao", obrigatorio: true, opcoes: [{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não (desligado a partir da data)" }] },
                  ...dadosDaCnh,
                ]} />
              ) : null}
              <FormDoAto ato="exigencia-de-habilitacao" botao="Declarar" titulo="Categorias de CNH aceitas para um bem (declaração do ente)" campos={[
                { nome: "bem", rotulo: "Bem", tipo: "selecao", obrigatorio: true, opcoes: bens },
                { nome: "categorias", rotulo: "Categorias aceitas", tipo: "marcar", opcoes: ["A", "B", "C", "D", "E"].map((c) => ({ valor: c, rotulo: c })) },
                { nome: "vigenteDesde", rotulo: "Vale desde", tipo: "data", obrigatorio: true, valor: hoje },
                { nome: "fundamento", rotulo: "De onde vem a exigência", obrigatorio: true },
              ]} />
            </div>
          ) : null}
        </section>
      </Card>

      <Card>
        <section aria-labelledby="t-ord" data-ordens-de-abastecimento>
          <h2 className="text-sm font-semibold" id="t-ord">Ordens de abastecimento</h2>
          {t.pode.ordem ? (
            <div className="mt-2">
              <FormDoAto ato="emitir-ordem" botao="Emitir" titulo="Emitir ordem de abastecimento" campos={[
                { nome: "bem", rotulo: "Bem", tipo: "selecao", obrigatorio: true, opcoes: bens },
                { nome: "condutorId", rotulo: "Condutor", tipo: "selecao", obrigatorio: true, opcoes: condutoresAtivos },
                { nome: "combustivel", rotulo: "Combustível", tipo: "selecao", obrigatorio: true, opcoes: COMBUSTIVEIS },
                { nome: "quantidadeAutorizada", rotulo: "Quantidade máxima (litros; m³ no gás natural)", obrigatorio: true, decimal: true },
                { nome: "emitidaEm", rotulo: "Emitida em", tipo: "data", obrigatorio: true, valor: hoje },
                { nome: "validaAte", rotulo: "Vale até", tipo: "data", obrigatorio: true },
                { nome: "local", rotulo: "Onde abastecer (posto, contrato, tanque)", obrigatorio: true },
              ]} />
            </div>
          ) : null}
          {t.ordens.length === 0 ? <p className="mt-2 text-xs">Nenhuma ordem emitida.</p> : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-xs">
                <caption className="sr-only">Ordens de abastecimento com o abastecido e o saldo</caption>
                <thead><tr className="text-left text-[color:var(--color-ink-2)]"><th className={CELULA} scope="col">Nº</th><th className={CELULA} scope="col">Bem e condutor</th><th className={CELULA} scope="col">Combustível</th><th className={`${CELULA} text-right`} scope="col">Autorizado</th><th className={`${CELULA} text-right`} scope="col">Abastecido</th><th className={`${CELULA} text-right`} scope="col">Saldo</th><th className={CELULA} scope="col">Prazo</th><th className={CELULA} scope="col">Situação</th></tr></thead>
                <tbody>
                  {t.ordens.map((o) => (
                    <tr className="border-t border-[color:var(--color-border)]" data-ordem={o.numero} key={o.id}>
                      <td className={CELULA}>{o.numero}</td><td className={CELULA}>{o.bem}, {o.condutor}</td><td className={CELULA}>{o.combustivel}</td>
                      <td className={`${CELULA} text-right`}>{o.autorizado}</td><td className={`${CELULA} text-right`}>{o.abastecido}</td><td className={`${CELULA} text-right`}>{o.saldo}</td>
                      <td className={CELULA}>{o.prazo}</td>
                      <td className={CELULA}>
                        {o.situacao}
                        {t.pode.ordem && o.situacao === "aberta" ? <FormDoAto ato="cancelar-ordem" botao="Cancelar a ordem" titulo="Cancelar" campos={[{ nome: "ordemId", rotulo: "", tipo: "oculto", valor: o.id }, { nome: "motivo", rotulo: "Motivo", obrigatorio: true }]} /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">O abastecimento feito pela ordem é registrado na tela da frota, informando o número dela: o bem, o combustível, o prazo, o saldo e a CNH do condutor são conferidos.</p>
        </section>
      </Card>

      <Card>
        <section aria-labelledby="t-cons" data-consumo>
          <h2 className="text-sm font-semibold" id="t-cons">Hodômetro, horímetro e consumo</h2>
          <form action="/patrimonio/frota/operacao" className="mt-2 flex flex-wrap items-end gap-2" data-acao="escolher-bem" method="get">
            <div>
              <label className="block text-xs" htmlFor="bem-consumo">Bem</label>
              <select className="rounded border px-2 py-1 text-xs" defaultValue={bemPedido ?? ""} id="bem-consumo" name="bem">
                <option value="">Escolha</option>
                {t.bens.map((b) => <option key={b.chave} value={b.chave}>{b.rotulo}</option>)}
              </select>
            </div>
            <button className="rounded border px-2 py-1 text-xs" type="submit">Ver</button>
          </form>
          {t.bemEscolhido !== null ? (
            <>
              <h3 className="mt-3 text-xs font-semibold">{t.bemEscolhido.rotulo}: consumo em {t.bemEscolhido.unidade}</h3>
              {t.bemEscolhido.consumo.length === 0 ? <p className="text-xs">Nenhum abastecimento registrado.</p> : (
                <table className="mt-1 w-full text-xs">
                  <caption className="sr-only">Consumo por abastecimento</caption>
                  <thead><tr className="text-left text-[color:var(--color-ink-2)]"><th className={CELULA} scope="col">Dia</th><th className={`${CELULA} text-right`} scope="col">Quantidade</th><th className={`${CELULA} text-right`} scope="col">Leitura</th><th className={`${CELULA} text-right`} scope="col">Desde a anterior</th><th className={`${CELULA} text-right`} scope="col">Consumo</th></tr></thead>
                  <tbody>
                    {t.bemEscolhido.consumo.map((c, i) => (
                      <tr className="border-t border-[color:var(--color-border)]" data-linha-do-consumo={c.data} key={`${c.data}-${String(i)}`}>
                        <td className={CELULA}>{c.data}</td><td className={`${CELULA} text-right`}>{c.quantidade}</td><td className={`${CELULA} text-right`}>{c.leitura ?? "sem leitura"}</td>
                        <td className={`${CELULA} text-right`}>{c.percorrido ?? ""}</td><td className={`${CELULA} text-right`}>{c.consumo ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {t.pode.leitura ? (
                <div className="mt-2">
                  <FormDoAto ato="leitura" botao="Registrar" titulo="Registrar ou corrigir leitura" campos={[
                    { nome: "bem", rotulo: "", tipo: "oculto", valor: t.bemEscolhido.chave },
                    { nome: "data", rotulo: "Dia", tipo: "data", obrigatorio: true, valor: hoje },
                    { nome: "valor", rotulo: "Leitura (ex.: 45.230,5)", obrigatorio: true, decimal: true },
                    { nome: "corrigeId", rotulo: "Corrige a leitura (se for correção)", tipo: "selecao", opcoes: t.bemEscolhido.leituras.map((l) => ({ valor: l.id, rotulo: l.rotulo })) },
                    { nome: "motivo", rotulo: "Por que a anterior está errada (na correção)" },
                  ]} />
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </Card>

      <Card>
        <section aria-labelledby="t-man" data-manutencoes>
          <h2 className="text-sm font-semibold" id="t-man">Manutenção</h2>
          {t.pode.cadastrar ? (
            <div className="mt-2">
              <FormDoAto ato="abrir-manutencao" botao="Registrar o pedido" titulo="Pedir manutenção" campos={[
                { nome: "bem", rotulo: "Bem", tipo: "selecao", obrigatorio: true, opcoes: bens },
                { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, opcoes: [{ valor: "CORRETIVA", rotulo: "Corretiva" }, { valor: "PREVENTIVA", rotulo: "Preventiva" }] },
                { nome: "descricao", rotulo: "Serviço pedido", obrigatorio: true },
                { nome: "solicitante", rotulo: "Quem pediu", obrigatorio: true },
                { nome: "dataDoPedido", rotulo: "Data do pedido", tipo: "data", obrigatorio: true, valor: hoje },
              ]} />
            </div>
          ) : null}
          {t.manutencoes.length === 0 ? <p className="mt-2 text-xs">Nenhuma manutenção registrada.</p> : (
            <ul className="mt-2 space-y-2 text-xs">
              {t.manutencoes.map((m) => (
                <li className="border-b border-[color:var(--color-border)] pb-2" data-manutencao={m.numero} data-situacao={m.situacao} key={m.id}>
                  <strong>nº {m.numero}</strong>, {m.bem}, {m.tipo}: {m.descricao} — {m.detalhe}
                  <div className="mt-1 grid gap-1 sm:grid-cols-3">
                    {m.situacao === "PEDIDA" && t.pode.autorizarManutencao ? <FormDoAto ato="autorizar-manutencao" botao="Autorizar" titulo="Autorizar" campos={[
                      { nome: "manutencaoId", rotulo: "", tipo: "oculto", valor: m.id },
                      { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true, valor: hoje },
                      { nome: "contratoId", rotulo: "Contrato (se houver)", tipo: "selecao", opcoes: t.contratos.map((c) => ({ valor: c.id, rotulo: c.rotulo })) },
                      { nome: "fornecedor", rotulo: "Quem executa", obrigatorio: true },
                      { nome: "valorEstimado", rotulo: "Valor estimado (R$)", obrigatorio: true, decimal: true },
                    ]} /> : null}
                    {m.situacao === "AUTORIZADA" && t.pode.cadastrar ? <FormDoAto ato="concluir-manutencao" botao="Concluir" titulo="Concluir" campos={[
                      { nome: "manutencaoId", rotulo: "", tipo: "oculto", valor: m.id },
                      { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true, valor: hoje },
                      { nome: "custo", rotulo: "Custo (R$)", obrigatorio: true, decimal: true },
                      { nome: "documento", rotulo: "Nota fiscal ou documento", obrigatorio: true },
                    ]} /> : null}
                    {(m.situacao === "PEDIDA" || m.situacao === "AUTORIZADA") && t.pode.autorizarManutencao ? <FormDoAto ato="cancelar-manutencao" botao="Cancelar" titulo="Cancelar" campos={[
                      { nome: "manutencaoId", rotulo: "", tipo: "oculto", valor: m.id },
                      { nome: "motivo", rotulo: "Motivo", obrigatorio: true },
                    ]} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>
    </div>
  );
}
