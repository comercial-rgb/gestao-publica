import Link from "next/link";
import { Card } from "../../../../components/ui/Card";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_ROTULO } from "../../../../components/ui/Formulario";
import { lerTelaDeImportacao, type PecaDoPlanejamento } from "../../../../lib/portas/importacao-do-planejamento";
import { instanteCivilBr } from "../../../../packages/datas/index";
import { ConfirmarImportacao } from "./ConfirmarImportacao";

/**
 * V39-R2 (R2-021, R2-022) — A SEÇÃO DE IMPORTAÇÃO no detalhe da LDO e do PPA de destino. A prévia vem por GET (só
 * leitura); a confirmação é o formulário abaixo dela, com a versão da prévia.
 */
const CELULA = "px-2 py-1 align-top";

/** Os parâmetros da prévia na URL (`imp_origem`, `imp_bloco` repetido, `imp_anos`). */
export function pedidoDaImportacao(sp: Readonly<Record<string, string | string[] | undefined>>): { origem?: string; blocos: string[]; anos?: string } {
  const um = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
  const blocos = sp["imp_bloco"];
  const origem = um(sp["imp_origem"]);
  const anos = um(sp["imp_anos"]);
  return { ...(origem !== undefined ? { origem } : {}), blocos: blocos === undefined ? [] : Array.isArray(blocos) ? blocos : [blocos], ...(anos !== undefined ? { anos } : {}) };
}

export async function SecaoDeImportacao(props: {
  readonly peca: PecaDoPlanejamento;
  readonly destinoId: string;
  readonly rota: string;
  readonly podeImportar: boolean;
  readonly pedido: { readonly origem?: string; readonly blocos: readonly string[]; readonly anos?: string };
}): Promise<React.ReactElement> {
  const t = await lerTelaDeImportacao(props.peca, props.destinoId, props.pedido);
  const titulo = props.peca === "LDO" ? "Importar de outra LDO" : "Preparar este plano a partir de um plano anterior";
  const origemEscolhida = t.origens.find((o) => o.id === t.escolha.origemId);
  return (
    <Card>
      <section aria-labelledby="titulo-importacao" data-importacao-do-planejamento={props.peca} id="importacao">
        <h2 className="text-sm font-semibold" id="titulo-importacao">{titulo}</h2>
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
          {props.peca === "LDO"
            ? "Copia os blocos escolhidos para esta LDO, que precisa estar em rascunho (sem envio, protocolo, sanção ou ato de alteração) e sem linhas nesses blocos. As metas vão pelo valor vigente. O trâmite da LDO de origem não é copiado."
            : "Copia programas (com indicadores e ações) e previsões de receita para este plano, que precisa começar depois do fim do plano de origem, sem ato de alteração e sem linhas nesses blocos. Os valores vão pelo vigente, e a versão da origem fica registrada."}
        </p>
        {props.peca === "PPA" ? (
          <p className="mt-1 text-xs text-[color:var(--color-ink-2)]" data-revisao-do-ciclo>
            Para revisar o plano em vigor, não se importa: registre um <Link className="underline" href="/planejamento/alteracoes">ato de alteração</Link> no próprio plano, que preserva a versão anterior.
          </p>
        ) : null}

        <form action={`${props.rota}#importacao`} className="mt-3 space-y-2" data-acao="previa-da-importacao" method="get">
          <div>
            <label className={CLASSE_ROTULO} htmlFor="imp-origem">{props.peca === "LDO" ? "LDO de origem" : "Plano de origem"}</label>
            <select className={CLASSE_CAMPO} defaultValue={t.escolha.origemId} id="imp-origem" name="imp_origem" required>
              <option value="">Escolha</option>
              {t.origens.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
            </select>
          </div>
          <fieldset>
            <legend className={CLASSE_ROTULO}>Blocos a importar</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {t.blocos.map((b) => (
                <label className="flex items-center gap-2 text-xs" key={b.codigo}>
                  <input defaultChecked={t.escolha.blocos.includes(b.codigo)} name="imp_bloco" type="checkbox" value={b.codigo} />
                  {b.rotulo}{b.comAno ? " (pelo mapa dos anos)" : ""}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className={CLASSE_ROTULO} htmlFor="imp-anos">Mapa dos anos (um por linha, ano da origem = ano do destino; ano sem linha não é copiado)</label>
            <textarea className={CLASSE_AREA_TEXTO} defaultValue={t.escolha.anos} id="imp-anos" name="imp_anos" placeholder={"2027=2027\n2028=2028"} rows={3} />
            {origemEscolhida !== undefined && origemEscolhida.anos.length > 0 ? (
              <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">Anos com linhas na origem: {origemEscolhida.anos.join(", ")}.</p>
            ) : null}
          </div>
          <button className={CLASSE_BOTAO_PRIMARIO} type="submit">Ver a prévia</button>
        </form>

        {t.erroDaPrevia !== null ? (
          <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]" data-erro-da-previa role="alert">{t.erroDaPrevia}</p>
        ) : null}

        {t.previa !== null ? (
          <div className="mt-4" data-previa-da-importacao>
            <h3 className="text-sm font-semibold">Prévia: de {t.previa.origem} para {t.previa.destino}</h3>
            {t.previa.versaoDaOrigem !== null ? <p className="text-xs text-[color:var(--color-ink-2)]">Versão da origem copiada: {t.previa.versaoDaOrigem}.</p> : null}
            {t.previa.recusas.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-[color:var(--color-status-erro-fg)]" data-recusas-da-previa>
                {t.previa.recusas.map((r) => <li key={r}>{r}</li>)}
              </ul>
            ) : null}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-xs">
                <caption className="sr-only">O que será copiado</caption>
                <thead>
                  <tr className="text-left text-[color:var(--color-ink-2)]">
                    <th className={CELULA} scope="col">Bloco</th>
                    <th className={CELULA} scope="col">Será copiado</th>
                    <th className={CELULA} scope="col">Ano</th>
                    <th className={CELULA} scope="col">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {t.previa.linhas.map((l, i) => (
                    <tr className="border-t border-[color:var(--color-border)]" data-linha-da-previa={l.descricao} key={`${l.bloco}-${String(i)}`}>
                      <td className={CELULA}>{l.bloco}</td>
                      <td className={CELULA}>{l.descricao}</td>
                      <td className={CELULA}>{l.anos}</td>
                      <td className={CELULA}>{l.observacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {t.previa.fora.length > 0 ? (
              <>
                <h4 className="mt-3 text-xs font-semibold">Fica de fora</h4>
                <ul className="mt-1 list-disc pl-5 text-xs" data-fora-da-previa>
                  {t.previa.fora.map((f, i) => <li data-linha-fora={f.descricao} key={`${f.descricao}-${String(i)}`}>{f.bloco}: {f.descricao} — {f.motivo}</li>)}
                </ul>
              </>
            ) : null}
            {/* Montado também com recusa: depois da confirmação a prévia passa a recusar (o bloco já tem linhas), e a
                resposta do servidor tem de continuar na tela; o botão é que some. */}
            {props.podeImportar ? (
              <ConfirmarImportacao anos={t.escolha.anos} blocos={t.escolha.blocos} destinoId={props.destinoId} origemId={t.escolha.origemId} peca={props.peca} podeConfirmar={t.previa.recusas.length === 0} versaoDaPrevia={t.previa.versao} />
            ) : null}
            {t.previa.recusas.length === 0 && !props.podeImportar ? (
              <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">Você pode ver a prévia, mas a importação exige permissão de cadastro desta peça.</p>
            ) : null}
          </div>
        ) : null}

        {t.importacoes.length > 0 ? (
          <div className="mt-4" data-importacoes-registradas>
            <h3 className="text-sm font-semibold">Importações registradas</h3>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {t.importacoes.map((i) => (
                <li key={i.id}>
                  {instanteCivilBr(i.quando)}: de {i.origem}{i.versaoDaOrigem !== null ? ` (${i.versaoDaOrigem})` : ""}, {i.blocos}; {i.linhas} linha(s); por {i.por}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </Card>
  );
}
