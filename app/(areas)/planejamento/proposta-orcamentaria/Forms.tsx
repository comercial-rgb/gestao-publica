"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import {
  CLASSE_BOTAO_PRIMARIO as BOTAO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO as PAINEL,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  abrirExercicioAction,
  ajustarLinhaAction,
  efetivarPropostaAction,
  elaborarPropostaAction,
  type EstadoDaProposta,
  incluirFichaAction,
  incluirReceitaAction,
  previaImportacaoAction,
  previaReajusteAction,
  reajustarAction,
  realocarAction,
} from "./actions";
import { formatarMoeda } from "../../../../lib/format/moeda";

const BOTAO_SECUNDARIO =
  "inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 text-sm font-semibold text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40";

function Resultado({ estado, acao }: { readonly estado: EstadoDaProposta; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao={acao} className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao={acao} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
        {estado.propostaOrcamentariaId !== undefined ? (
          <>
            {" "}
            <Link className="font-semibold underline" href={`/planejamento/proposta-orcamentaria/${estado.propostaOrcamentariaId}`}>
              Abrir a proposta
            </Link>
          </>
        ) : null}
      </p>
    );
  }
  return null;
}

/** IMPORTAR um exercício numa proposta nova, com a prévia do que vem (V38, AUD-103) antes de criar. */
export function FormElaborarProposta({
  exercicios,
  sugestaoDeDestino,
}: {
  readonly exercicios: readonly number[];
  readonly sugestaoDeDestino: number;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(elaborarPropostaAction, {});
  const [previa, previaAction, calculando] = useActionState<EstadoDaProposta, FormData>(previaImportacaoAction, {});
  // ⚠️ CAMPOS CONTROLADOS, como no reajuste em lote: ao terminar a ação da prévia, o React limpa os campos não
  // controlados; a importação que vem depois leria o formulário vazio.
  const [v, setV] = useState({
    exercicio: String(sugestaoDeDestino),
    exercicioDeOrigem: exercicios[0] === undefined ? "" : String(exercicios[0]),
    descricao: `Proposta ${String(sugestaoDeDestino)}`,
    baseDaReceita: "PREVISAO_ATUALIZADA",
    percentualDaReceita: "0",
    baseDaDespesa: "DOTACAO_INICIAL",
    percentualDaDespesa: "0",
  });
  const [marcas, setMarcas] = useState({ aproveitaReceitas: true, aproveitaFichas: true, reajustaProjetos: true, incluiFichasAbertasPorCredito: false });
  const mudar = (c: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [c]: e.target.value }));
  const marcar = (c: keyof typeof marcas) => (e: React.ChangeEvent<HTMLInputElement>) => setMarcas((s) => ({ ...s, [c]: e.target.checked }));
  return (
    <form action={action} className={PAINEL} data-acao="elaborar-proposta" aria-label="Importar um exercício numa proposta nova">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Nova proposta a partir de um exercício</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        Importa as receitas previstas e as fichas do exercício escolhido, aplica o percentual sobre a base e abre a proposta
        para alteração. Nada é lançado na contabilidade até a proposta ser efetivada. Use &quot;Ver o que vai ser importado&quot;
        para conferir antes de criar.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Orçamento do exercício</span>
          <input className={CAMPO} name="exercicio" type="number" min={2000} max={2100} required value={v.exercicio} onChange={mudar("exercicio")} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Importar de</span>
          <select className={CAMPO} name="exercicioDeOrigem" required value={v.exercicioDeOrigem} onChange={mudar("exercicioDeOrigem")}>
            {exercicios.length === 0 ? <option value="">Nenhum exercício cadastrado</option> : null}
            {exercicios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Nome da proposta</span>
          <input className={CAMPO} name="descricao" required minLength={3} value={v.descricao} onChange={mudar("descricao")} />
        </label>
        <fieldset className="text-xs sm:col-span-3">
          <legend className={ROTULO}>O que aproveitar</legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="aproveitaReceitas" checked={marcas.aproveitaReceitas} onChange={marcar("aproveitaReceitas")} /> Receitas previstas
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="aproveitaFichas" checked={marcas.aproveitaFichas} onChange={marcar("aproveitaFichas")} /> Fichas de despesa
            </label>
          </div>
        </fieldset>
        <label className="text-xs">
          <span className={ROTULO}>Receita: valor de partida</span>
          <select className={CAMPO} name="baseDaReceita" required value={v.baseDaReceita} onChange={mudar("baseDaReceita")}>
            <option value="PREVISAO_ATUALIZADA">Previsão atualizada (com as reestimativas)</option>
            <option value="PREVISAO_INICIAL">Previsão inicial da lei</option>
            <option value="SEM_VALOR">Só a estrutura, sem valores</option>
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Receita: reajuste (%)</span>
          <input className={CAMPO} name="percentualDaReceita" inputMode="decimal" value={v.percentualDaReceita} onChange={mudar("percentualDaReceita")} />
        </label>
        <span className="hidden sm:block" />
        <label className="text-xs">
          <span className={ROTULO}>Despesa: valor de partida</span>
          <select className={CAMPO} name="baseDaDespesa" required value={v.baseDaDespesa} onChange={mudar("baseDaDespesa")}>
            <option value="DOTACAO_INICIAL">Dotação inicial da lei</option>
            <option value="DOTACAO_AUTORIZADA">Dotação autorizada (com créditos e realocações)</option>
            <option value="EMPENHADO">Empenhado até hoje</option>
            <option value="SEM_VALOR">Só a estrutura, sem valores</option>
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Despesa: reajuste (%)</span>
          <input className={CAMPO} name="percentualDaDespesa" inputMode="decimal" value={v.percentualDaDespesa} onChange={mudar("percentualDaDespesa")} />
        </label>
        <fieldset className="space-y-1 text-xs sm:col-span-3">
          <legend className={ROTULO}>Fichas</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reajustaProjetos" checked={marcas.reajustaProjetos} onChange={marcar("reajustaProjetos")} /> Aplicar o reajuste também a projetos e operações especiais
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="incluiFichasAbertasPorCredito" checked={marcas.incluiFichasAbertasPorCredito} onChange={marcar("incluiFichasAbertasPorCredito")} /> Incluir fichas abertas no exercício por crédito especial ou extraordinário, e as de recurso de exercício anterior
          </label>
        </fieldset>
      </div>
      <div className="mt-3 space-y-2">
        {previa.previaDaImportacao !== undefined ? <PreviaDaImportacaoQuadro p={previa.previaDaImportacao} /> : null}
        {previa.erro !== undefined ? <Resultado estado={previa} acao="previa-da-importacao" /> : null}
        <Resultado estado={estado} acao="elaborar-proposta" />
        <div className="flex flex-wrap gap-3">
          <button className={BOTAO_SECUNDARIO} disabled={pendente || calculando || exercicios.length === 0} type="submit" formAction={previaAction} data-botao="previa-da-importacao">
            {calculando ? "Calculando…" : "Ver o que vai ser importado"}
          </button>
          <button className={BOTAO} disabled={pendente || calculando || exercicios.length === 0} type="submit" data-botao="importar">
            {pendente ? "Importando…" : "Importar e criar a proposta"}
          </button>
        </div>
      </div>
    </form>
  );
}

const reais = (v: string): string => formatarMoeda(v).texto;

/**
 * O QUADRO DA PRÉVIA (AUD-103): o que vem copiado, o que leva reajuste, o que fica de fora e o que vai pedir
 * complemento. O que não vem da origem é dito sempre: é a pergunta de quem esperava receber pronto.
 */
function PreviaDaImportacaoQuadro({ p }: { readonly p: NonNullable<EstadoDaProposta["previaDaImportacao"]> }): React.ReactElement {
  const r = p.receitas;
  const f = p.fichas;
  return (
    <div
      data-previa-da-importacao={`${String(r.linhas)}/${String(f.linhas)}`}
      className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]"
    >
      <p className="text-sm font-semibold text-[color:var(--color-ink)]">
        Prévia: o que vem de {String(p.exercicioDeOrigem)} para a proposta de {String(p.exercicio)}. Nada foi gravado.
      </p>
      {p.recusa !== null ? (
        <p role="alert" data-recusa-da-importacao className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-[color:var(--color-status-erro-fg)]">
          A importação seria recusada: {p.recusa}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="font-semibold text-[color:var(--color-ink)]">Receitas</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li data-previa-receitas={String(r.linhas)}>
              {String(r.linhas)} de {String(r.naOrigem)} receita(s) prevista(s) copiada(s); líquido das deduções: lei de origem {reais(r.lei)}, partida {reais(r.partida)}, com
              reajuste {reais(r.comReajuste)}.
            </li>
            {r.semValor > 0 ? <li>{String(r.semValor)} linha(s) chegam com valor zero: só entram no orçamento se alguém informar o valor.</li> : null}
            {r.deducoesSemTipo > 0 ? (
              <li>{String(r.deducoesSemTipo)} dedução(ões) sem o tipo da dedução na origem: no exercício novo, informe o tipo em Receita prevista.</li>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-[color:var(--color-ink)]">Fichas</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li data-previa-fichas={String(f.linhas)}>
              {String(f.linhas)} de {String(f.naOrigem)} ficha(s) copiada(s); lei de origem {reais(f.lei)}, partida {reais(f.partida)}, com reajuste{" "}
              {reais(f.comReajuste)}.
            </li>
            {f.deixadasDeFora > 0 ? (
              <li data-previa-deixadas={String(f.deixadasDeFora)}>
                {String(f.deixadasDeFora)} ficha(s) ficam de fora: abertas no exercício por crédito especial ou extraordinário, ou de recurso de exercício
                anterior.
              </li>
            ) : null}
            {f.semReajuste > 0 ? <li>{String(f.semReajuste)} projeto(s) ou operação(ões) especial(is) entram sem o reajuste, como escolhido.</li> : null}
            {f.semValor > 0 ? <li>{String(f.semValor)} ficha(s) chegam com valor zero: só viram ficha se alguém informar o valor.</li> : null}
          </ul>
        </div>
      </div>
      <p>
        <strong className="text-[color:var(--color-ink)]">Não vem da origem:</strong> empenhos, liquidações e pagamentos (o empenhado serve só como valor de
        partida), saldos bancários, a aprovação e o número da lei. Fichas e receitas novas se incluem na proposta depois de criada.
      </p>
    </div>
  );
}

/** ALTERAR o valor de uma linha. Fica recolhido na linha; abre só quando a pessoa pede. */
export function FormAjusteDaLinha({
  propostaOrcamentariaId,
  lado,
  linhaId,
  rotulo,
  valorAtual,
}: {
  readonly propostaOrcamentariaId: string;
  readonly lado: "RECEITA" | "DESPESA";
  readonly linhaId: string;
  readonly rotulo: string;
  readonly valorAtual: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(ajustarLinhaAction, {});
  return (
    <details data-forma="ajustar-linha" data-linha={linhaId}>
      <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-primary)]">Alterar</summary>
      <form action={action} className="mt-2 space-y-2" data-acao="ajustar-linha" aria-label={`Alterar o valor de ${rotulo}`}>
        <ChaveDeComando />
        <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
        <input type="hidden" name="lado" value={lado} />
        <input type="hidden" name="linhaId" value={linhaId} />
        <label className="block text-xs">
          <span className={ROTULO}>Novo valor (R$)</span>
          <input className={CAMPO} name="valor" inputMode="decimal" required defaultValue={valorAtual.replace(".", ",")} />
        </label>
        <label className="block text-xs">
          <span className={ROTULO}>Motivo</span>
          <input className={CAMPO} name="motivo" required minLength={5} />
        </label>
        <Resultado estado={estado} acao="ajustar-linha" />
        <button className={BOTAO_SECUNDARIO} disabled={pendente} type="submit">
          {pendente ? "Gravando…" : "Gravar"}
        </button>
      </form>
    </details>
  );
}

/**
 * ABRIR o exercício de destino, quando ele ainda não existe.
 *
 * ⚠️ O FORMULÁRIO NÃO SOME COM O PRÓPRIO SUCESSO: depois de abrir, a página recarrega com o exercício
 * aberto; se o formulário saísse da árvore, a confirmação sairia junto e a pessoa não veria resposta
 * nenhuma (o percurso da V29 mediu "silêncio" aqui). Ele fica montado e só o botão sai.
 */
export function FormAbrirExercicio({
  ano,
  propostaOrcamentariaId,
  aberto,
}: {
  readonly ano: number;
  readonly propostaOrcamentariaId: string;
  readonly aberto: boolean;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(abrirExercicioAction, {});
  return (
    <form action={action} className="space-y-2" data-acao="abrir-exercicio" aria-label={`Abrir o exercício ${String(ano)}`}>
      <ChaveDeComando />
      <input type="hidden" name="ano" value={ano} />
      <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
      <Resultado estado={estado} acao="abrir-exercicio" />
      {aberto ? null : (
        <button className={BOTAO_SECUNDARIO} disabled={pendente} type="submit">
          {pendente ? "Abrindo…" : `Abrir o exercício ${String(ano)}`}
        </button>
      )}
    </form>
  );
}

/** EFETIVAR: gera as fichas e a receita prevista do exercício. Fica montado depois do sucesso (ver acima). */
/**
 * GERAR O ORÇAMENTO, com o que permite executar (V39-021): a lei aprovada; a execução provisória que a LDO autoriza
 * enquanto a lei não sai (o dispositivo transcrito); ou o ensaio, que só aparece quando o banco declara a base de
 * demonstração ou de ensaio. A escolha é controlada (o React 19 zera campo não controlado depois da ação).
 */
export function FormEfetivarProposta({
  propostaOrcamentariaId,
  exercicio,
  pronta,
  efetivada,
  leiAprovada,
  admiteEnsaio,
  tiposDeAto,
}: {
  readonly propostaOrcamentariaId: string;
  readonly exercicio: number;
  readonly pronta: boolean;
  readonly efetivada: boolean;
  /** O número da lei aprovada do exercício, ou null quando a aprovação não está registrada. */
  readonly leiAprovada: string | null;
  readonly admiteEnsaio: boolean;
  readonly tiposDeAto: readonly { readonly codigo: string; readonly rotulo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(efetivarPropostaAction, {});
  const [fundamento, setFundamento] = useState<string>(leiAprovada === null ? "" : "LEI_APROVADA");
  const [ato, setAto] = useState({ atoTipo: "LEI", atoNumero: "", atoAno: "", atoDispositivo: "", atoCitacao: "" });
  const muda = (campo: keyof typeof ato) => (e: { target: { value: string } }): void => setAto((a) => ({ ...a, [campo]: e.target.value }));
  return (
    <form action={action} className="space-y-2" data-acao="efetivar-proposta" aria-label={`Gerar o orçamento de ${String(exercicio)}`}>
      <ChaveDeComando />
      <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
      <Resultado estado={estado} acao="efetivar-proposta" />
      {efetivada ? null : (
        <>
          <fieldset className="space-y-1 text-sm" data-fundamento-da-efetivacao>
            <legend className={ROTULO}>O que permite executar o orçamento de {String(exercicio)}</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="fundamento" value="LEI_APROVADA" checked={fundamento === "LEI_APROVADA"} disabled={leiAprovada === null} onChange={() => setFundamento("LEI_APROVADA")} />
              <span>
                A lei orçamentária aprovada
                {leiAprovada === null ? <span className="block text-xs text-[color:var(--color-ink-2)]">A aprovação ainda não está registrada: registre o número da lei, a sanção e a publicação em Leis orçamentárias.</span> : <span className="block text-xs text-[color:var(--color-ink-2)]">Lei {leiAprovada}</span>}
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="fundamento" value="EXECUCAO_PROVISORIA" checked={fundamento === "EXECUCAO_PROVISORIA"} disabled={leiAprovada !== null} onChange={() => setFundamento("EXECUCAO_PROVISORIA")} />
              <span>
                A execução provisória autorizada pela LDO, enquanto a lei não é sancionada
                <span className="block text-xs text-[color:var(--color-ink-2)]">Informe o dispositivo da LDO e transcreva o trecho.</span>
              </span>
            </label>
            {admiteEnsaio ? (
              <label className="flex items-start gap-2">
                <input type="radio" name="fundamento" value="ENSAIO" checked={fundamento === "ENSAIO"} onChange={() => setFundamento("ENSAIO")} />
                <span>
                  Ensaio nesta base de demonstração
                  <span className="block text-xs text-[color:var(--color-ink-2)]">Só para exercitar o sistema; não vale como orçamento aprovado.</span>
                </span>
              </label>
            ) : null}
          </fieldset>
          {fundamento === "EXECUCAO_PROVISORIA" ? (
            <div className="grid gap-2 sm:grid-cols-4" data-ato-da-execucao-provisoria>
              <label className={ROTULO}>Tipo do ato
                <select name="atoTipo" className={CAMPO} value={ato.atoTipo} onChange={muda("atoTipo")}>
                  {tiposDeAto.map((t) => <option key={t.codigo} value={t.codigo}>{t.rotulo}</option>)}
                </select>
              </label>
              <label className={ROTULO}>Número
                <input name="atoNumero" required className={CAMPO} value={ato.atoNumero} onChange={muda("atoNumero")} />
              </label>
              <label className={ROTULO}>Ano
                <input name="atoAno" required inputMode="numeric" pattern="\d{4}" className={CAMPO} value={ato.atoAno} onChange={muda("atoAno")} />
              </label>
              <label className={ROTULO}>Dispositivo
                <input name="atoDispositivo" required placeholder="art. 45" className={CAMPO} value={ato.atoDispositivo} onChange={muda("atoDispositivo")} />
              </label>
              <label className={`${ROTULO} sm:col-span-4`}>Trecho transcrito
                <textarea name="atoCitacao" required rows={3} className={CAMPO} value={ato.atoCitacao} onChange={muda("atoCitacao")} />
              </label>
            </div>
          ) : null}
          <button className={BOTAO} disabled={pendente || !pronta || fundamento === ""} type="submit">
            {pendente ? "Gerando o orçamento…" : `Gerar o orçamento de ${String(exercicio)}`}
          </button>
        </>
      )}
    </form>
  );
}

// ═══ V38 — INCLUIR O QUE A LEI DE ORIGEM NÃO TINHA, E REAJUSTAR EM LOTE ═══

const PAINEL_RECOLHIDO = "rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3";
const SUMARIO = "cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]";

/** INCLUIR uma ficha nova: a classificação completa pela busca, o valor e o motivo. O número vem na efetivação. */
export function FormIncluirFicha({ propostaOrcamentariaId }: { readonly propostaOrcamentariaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(incluirFichaAction, {});
  return (
    <details className={PAINEL_RECOLHIDO} data-forma="incluir-ficha">
      <summary className={SUMARIO}>Incluir uma ficha nova (despesa que a lei de origem não tinha)</summary>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-acao="incluir-ficha" aria-label="Incluir uma ficha nova na proposta">
        <ChaveDeComando />
        <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
        <CampoReferenciado name="unidadeOrc" rotulo="Unidade orçamentária" catalogo="unidades-para-ficha" obrigatorio largura={2} placeholder="Código ou nome" ajuda="Unidades em que você pode criar ficha; o órgão é o da unidade." />
        <CampoReferenciado name="funcao" rotulo="Função" catalogo="funcoes" obrigatorio largura={1} />
        <CampoReferenciado name="subfuncao" rotulo="Subfunção" catalogo="subfuncoes" obrigatorio largura={1} />
        <CampoReferenciado name="programa" rotulo="Programa" catalogo="programas" obrigatorio largura={2} />
        <CampoReferenciado name="acao" rotulo="Ação (projeto ou atividade)" catalogo="acoes" obrigatorio largura={2} />
        <CampoReferenciado name="naturezaDespesa" rotulo="Natureza da despesa" catalogo="naturezas-de-despesa" obrigatorio largura={2} ajuda="Categoria, grupo, modalidade e elemento (6 dígitos)." />
        <CampoReferenciado name="fonte" rotulo="Fonte de recurso" catalogo="fontes" obrigatorio largura={1} />
        <CampoReferenciado name="co" rotulo="Código de acompanhamento (opcional)" catalogo="codigos-de-acompanhamento" largura={1} />
        <label className="block text-xs">
          <span className={ROTULO}>Valor (R$)</span>
          <input className={CAMPO} name="valor" inputMode="decimal" required placeholder="50.000,00" />
        </label>
        <label className="block text-xs sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Motivo da inclusão</span>
          <input className={CAMPO} name="motivo" required minLength={5} placeholder="Posto de saúde novo no distrito" />
        </label>
        <div className="space-y-2 sm:col-span-2 lg:col-span-4">
          <Resultado estado={estado} acao="incluir-ficha" />
          <button className={BOTAO_SECUNDARIO} disabled={pendente} type="submit">
            {pendente ? "Incluindo…" : "Incluir a ficha na proposta"}
          </button>
        </div>
      </form>
    </details>
  );
}

/** INCLUIR uma receita nova: natureza e fonte pela busca, o tipo, o valor e o motivo. Dedução não entra aqui. */
export function FormIncluirReceita({ propostaOrcamentariaId }: { readonly propostaOrcamentariaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(incluirReceitaAction, {});
  return (
    <details className={PAINEL_RECOLHIDO} data-forma="incluir-receita">
      <summary className={SUMARIO}>Incluir uma receita nova (que a lei de origem não previa)</summary>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-acao="incluir-receita" aria-label="Incluir uma receita nova na proposta">
        <ChaveDeComando />
        <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
        <CampoReferenciado name="naturezaReceita" rotulo="Natureza da receita" catalogo="naturezas-de-receita" obrigatorio largura={2} placeholder="Código ou descrição" />
        <CampoReferenciado name="fonte" rotulo="Fonte de recurso" catalogo="fontes" obrigatorio largura={1} />
        <label className="block text-xs">
          <span className={ROTULO}>Tipo</span>
          <select className={CAMPO} name="tipoReceita" defaultValue="ORCAMENTARIA" required>
            <option value="ORCAMENTARIA">Orçamentária</option>
            <option value="INTRA_ORCAMENTARIA">Intraorçamentária</option>
          </select>
          <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">A dedução (FUNDEB e outras) se informa na receita prevista do exercício, depois de gerado o orçamento.</span>
        </label>
        <label className="block text-xs">
          <span className={ROTULO}>Valor (R$)</span>
          <input className={CAMPO} name="valor" inputMode="decimal" required placeholder="70.000,00" />
        </label>
        <label className="block text-xs sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Motivo da inclusão</span>
          <input className={CAMPO} name="motivo" required minLength={5} placeholder="Transferência nova da União" />
        </label>
        <div className="space-y-2 sm:col-span-2 lg:col-span-4">
          <Resultado estado={estado} acao="incluir-receita" />
          <button className={BOTAO_SECUNDARIO} disabled={pendente} type="submit">
            {pendente ? "Incluindo…" : "Incluir a receita na proposta"}
          </button>
        </div>
      </form>
    </details>
  );
}

/**
 * REAJUSTAR EM LOTE: um percentual sobre o valor da proposta das linhas de um recorte (fonte, unidade, começo da
 * natureza, tipo da ação ou da receita). "Calcular a prévia" só lê; "Aplicar" grava um ajuste por linha, com o motivo.
 */
export function FormReajusteEmLote({ propostaOrcamentariaId }: { readonly propostaOrcamentariaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(reajustarAction, {});
  // A prévia é outra ação (só leitura, sem chave de comando): o botão dela aponta para ela, no mesmo formulário.
  const [previa, previaAction, calculando] = useActionState<EstadoDaProposta, FormData>(previaReajusteAction, {});
  // ⚠️ CAMPOS CONTROLADOS, DE PROPÓSITO (medido no percurso V38): ao terminar a ação da prévia, o React limpa os campos
  // não controlados do formulário; o percentual ficava vazio e o clique em "Aplicar" era barrado pela validação do
  // navegador sem mensagem. Com o valor em estado, a prévia e a aplicação leem o mesmo que a pessoa digitou.
  const [v, setV] = useState({ lado: "DESPESA", percentual: "", naturezaPrefixo: "", tipoDaAcao: "", tipoReceita: "", motivo: "" });
  const mudar = (campo: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [campo]: e.target.value }));
  return (
    <details className={PAINEL_RECOLHIDO} data-forma="reajuste-em-lote">
      <summary className={SUMARIO}>Reajustar em lote (um percentual sobre as linhas de um recorte)</summary>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-acao="reajuste-em-lote" aria-label="Reajustar linhas da proposta em lote">
        <ChaveDeComando />
        {/* V39-016 — a versão do que a prévia mostrou; sem prévia, ou com prévia de outro recorte, a aplicação é recusada. */}
        <input type="hidden" name="versaoDaPrevia" value={previa.previa?.versao ?? ""} />
        <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
        <label className="block text-xs">
          <span className={ROTULO}>O que reajustar</span>
          <select className={CAMPO} name="lado" value={v.lado} onChange={mudar("lado")} required>
            <option value="DESPESA">Despesas (fichas)</option>
            <option value="RECEITA">Receitas</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className={ROTULO}>Percentual (%)</span>
          <input className={CAMPO} name="percentual" inputMode="decimal" required placeholder="5 ou -2,5" value={v.percentual} onChange={mudar("percentual")} />
        </label>
        <CampoReferenciado name="fonte" rotulo="Só a fonte (opcional)" catalogo="fontes" largura={1} />
        <CampoReferenciado name="unidadeOrc" rotulo="Só a unidade (opcional, despesas)" catalogo="unidades-para-ficha" largura={1} />
        <label className="block text-xs">
          <span className={ROTULO}>Começo da natureza (opcional)</span>
          <input className={CAMPO} name="naturezaPrefixo" placeholder="3390 ou 1112" value={v.naturezaPrefixo} onChange={mudar("naturezaPrefixo")} />
        </label>
        <label className="block text-xs">
          <span className={ROTULO}>Tipo da ação (opcional, despesas)</span>
          <select className={CAMPO} name="tipoDaAcao" value={v.tipoDaAcao} onChange={mudar("tipoDaAcao")}>
            <option value="">Todas</option>
            <option value="ATIVIDADE">Atividades</option>
            <option value="PROJETO">Projetos</option>
            <option value="OPERACAO_ESPECIAL">Operações especiais</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className={ROTULO}>Tipo da receita (opcional, receitas)</span>
          <select className={CAMPO} name="tipoReceita" value={v.tipoReceita} onChange={mudar("tipoReceita")}>
            <option value="">Todas</option>
            <option value="ORCAMENTARIA">Orçamentária</option>
            <option value="INTRA_ORCAMENTARIA">Intraorçamentária</option>
            <option value="DEDUCAO">Dedução</option>
          </select>
        </label>
        <label className="block text-xs sm:col-span-2 lg:col-span-1">
          <span className={ROTULO}>Motivo (para aplicar)</span>
          <input className={CAMPO} name="motivo" minLength={5} placeholder="Reajuste do piso" value={v.motivo} onChange={mudar("motivo")} />
        </label>
        <div className="space-y-2 sm:col-span-2 lg:col-span-4">
          {previa.previa !== undefined ? (
            <p data-previa-do-reajuste={String(previa.previa.linhas)} className="text-xs text-[color:var(--color-ink-2)]">
              Prévia: {String(previa.previa.linhas)} linha(s) no recorte; total de {previa.previa.totalAntes.replace(".", ",")} para {previa.previa.totalDepois.replace(".", ",")}.
            </p>
          ) : null}
          {previa.erro !== undefined ? <Resultado estado={previa} acao="previa-do-reajuste" /> : null}
          <Resultado estado={estado} acao="reajuste-em-lote" />
          <div className="flex flex-wrap gap-3">
            <button className={BOTAO_SECUNDARIO} disabled={pendente || calculando} type="submit" formAction={previaAction} data-botao="previa">
              {calculando ? "Calculando…" : "Calcular a prévia"}
            </button>
            <button className={BOTAO} disabled={pendente || calculando || previa.previa === undefined} type="submit" data-botao="aplicar">
              {pendente ? "Aplicando…" : "Aplicar o reajuste"}
            </button>
          </div>
        </div>
      </form>
    </details>
  );
}

/**
 * V38 (AUD-113) — REALOCAR entre linhas: tira um valor de uma linha e põe noutra do mesmo lado, num ato só. O total da
 * proposta não muda; as duas linhas guardam o motivo e o nome da outra no histórico.
 */
export function FormRealocar({ propostaOrcamentariaId }: { readonly propostaOrcamentariaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(realocarAction, {});
  const [lado, setLado] = useState("DESPESA");
  return (
    <details className={PAINEL_RECOLHIDO} data-forma="realocar">
      <summary className={SUMARIO}>Realocar entre linhas (tirar de uma e pôr noutra, sem mudar o total)</summary>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-acao="realocar" aria-label="Realocar valor entre linhas da proposta">
        <ChaveDeComando />
        <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
        <label className="block text-xs">
          <span className={ROTULO}>Entre</span>
          <select className={CAMPO} name="lado" value={lado} onChange={(e) => setLado(e.target.value)} required>
            <option value="DESPESA">Fichas</option>
            <option value="RECEITA">Receitas</option>
          </select>
        </label>
        <CampoReferenciado
          name="deLinhaId"
          rotulo="Tirar de"
          catalogo="linhas-da-proposta"
          contexto={["propostaOrcamentariaId", "lado"]}
          obrigatorio
          largura={2}
          placeholder="Ficha, natureza ou fonte"
        />
        <label className="block text-xs">
          <span className={ROTULO}>Valor (R$)</span>
          <input className={CAMPO} name="valor" inputMode="decimal" required placeholder="10.000,00" />
        </label>
        <CampoReferenciado
          name="paraLinhaId"
          rotulo="Pôr em"
          catalogo="linhas-da-proposta"
          contexto={["propostaOrcamentariaId", "lado"]}
          obrigatorio
          largura={2}
          placeholder="Ficha, natureza ou fonte"
        />
        <label className="block text-xs sm:col-span-2">
          <span className={ROTULO}>Motivo</span>
          <input className={CAMPO} name="motivo" required minLength={5} placeholder="Remanejamento para o transporte escolar" />
        </label>
        <div className="space-y-2 sm:col-span-2 lg:col-span-4">
          <Resultado estado={estado} acao="realocar" />
          <button className={BOTAO_SECUNDARIO} disabled={pendente} type="submit">
            {pendente ? "Realocando…" : "Realocar"}
          </button>
        </div>
      </form>
    </details>
  );
}
