"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CADASTRO_DE_CREDOR, linkDeCadastro } from "../../../../lib/atalho-de-cadastro";
import { CampoReferenciado, type OpcaoDoSeletor } from "../../../../components/ui/CampoReferenciado";
import { fichasQueCasam } from "./busca-da-ficha";
import { CampoCpfCnpj, CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { empenharAction, type EstadoEmpenho } from "./actions";
import { debitosDoCredorAction, disponivelNaDataAction } from "./leitura-actions";
import { AvisoDeDebitoDoCredor } from "../../../../components/ui/AvisoDeDebitoDoCredor";

/**
 * A ficha como ESTE form a consome.
 *
 * ⚠️ DECLARADA AQUI, e não importada de `lib/portas/empenho`. Seria `import type` (some
 * na compilação, não bundla o Prisma), mas o grep trivalente é TEXTUAL e barra qualquer
 * `from ".../lib/portas/"` numa ilha client — e ele está certo em ser cego: a diferença
 * entre `import type` e `import` é uma palavra que alguém apaga sem perceber, e aí o
 * Prisma vai para o browser (ou o build quebra, no melhor caso). O form declara o que
 * precisa; a página mapeia. É o mesmo padrão das outras três frentes.
 */
export interface FichaParaEmpenho {
  readonly id: string;
  readonly numero: number;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  /** V36 — unidade e classificação, para a busca da dotação (opcionais: outros formulários usam a mesma forma). */
  readonly unidade?: string;
  readonly classificacao?: string;
  readonly saldoDisponivel: string;
}


type Categoria = "" | "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
const CATEGORIAS: readonly Exclude<Categoria, "">[] = ["FORNECIMENTO_BENS", "LOCACAO", "PRESTACAO_SERVICOS", "REALIZACAO_OBRAS"];
const ehCategoria = (v: string | undefined): v is Exclude<Categoria, ""> => v !== undefined && (CATEGORIAS as readonly string[]).includes(v);

/** O que cada vínculo escolhido trouxe do catálogo — só para compor sugestões. */
interface Origens {
  readonly solicitacao: OpcaoDoSeletor | null;
  readonly ordem: OpcaoDoSeletor | null;
  readonly contrato: OpcaoDoSeletor | null;
  readonly reserva: OpcaoDoSeletor | null;
}

const SEM_ORIGEM: Origens = { solicitacao: null, ordem: null, contrato: null, reserva: null };

/** Os vínculos que a solicitação autorizada fixa — o empenho emitido dela tem de levar os mesmos. */
const VINCULOS_DA_SOLICITACAO = [
  { campo: "contratoId", rotulo: "Contrato", chaveDoRotulo: "contratoRotulo" },
  { campo: "ordemDeCompraId", rotulo: "Ordem de compra", chaveDoRotulo: "ordemRotulo" },
  { campo: "convenioId", rotulo: "Convênio", chaveDoRotulo: "convenioRotulo" },
  { campo: "obraId", rotulo: "Obra", chaveDoRotulo: "obraRotulo" },
  { campo: "dividaId", rotulo: "Dívida fundada", chaveDoRotulo: "dividaRotulo" },
] as const;

/**
 * OS TEXTOS DE HISTÓRICO (V22) — compostos do documento de origem, nunca de uma lista fixa de
 * frases: o histórico tem de dizer QUAL ordem, QUAL contrato, QUAL processo, e isso só o vínculo
 * escolhido sabe. São sugestões: a pessoa escolhe uma, edita, ou escreve o seu.
 */
export function sugestoesDeHistorico(o: Origens, credorNome: string): readonly string[] {
  const s: string[] = [];
  // sem o ponto final do texto de origem: a frase recebe o dela, e "setembro.." não chega ao histórico
  // ⚠️ E SEM TRAVESSÃO: o histórico do empenho é imutável e vai ao MANAD da Receita, que só aceita
  // ISO 8859-1 — um "—" sugerido aqui tornava o empenho impossível de exportar. O separador é " - ",
  // e o travessão que vier no texto de origem (objeto da ordem, do contrato) também é trocado.
  const a = (x: string | undefined): string => (x ?? "").trim().replace(/[—–]/g, "-").replace(/[.;,\s]+$/, "");
  // (⚠️ era `[.;,s]`: sem a barra, a classe comia o "s" final — "materiais" virava "materiai".)
  const credor = credorNome.trim() !== "" ? ` Credor: ${credorNome.trim()}.` : "";
  if (o.solicitacao !== null) {
    const d = o.solicitacao.dados ?? {};
    // o histórico AUTORIZADO vem primeiro, como foi escrito; a referência à solicitação, em seguida
    if (a(d["objeto"]) !== "") s.push(`${a(d["objeto"])}.`);
    s.push(`Empenho conforme a Solicitação de Empenho ${a(d["numero"])}, autorizada - ${a(d["objeto"])}.${credor}`);
  }
  if (o.ordem !== null) {
    const d = o.ordem.dados ?? {};
    s.push(`Empenho referente à Ordem de Compra ${a(d["numero"])} - ${a(d["objeto"])}.${credor}`);
  }
  if (o.contrato !== null) {
    const d = o.contrato.dados ?? {};
    s.push(`Empenho para atender ao Contrato ${a(d["numero"])}, processo ${a(d["processo"])} - ${a(d["objeto"])}.${credor}`);
    s.push(`Despesa com ${a(d["objeto"]).toLowerCase()}, conforme Contrato ${a(d["numero"])}.`);
  }
  if (o.reserva !== null) {
    const d = o.reserva.dados ?? {};
    const proc = a(d["processo"]) !== "" ? `, processo ${a(d["processo"])}` : "";
    s.push(`Empenho à conta da reserva de dotação${proc} - ${a(d["objeto"])}.${credor}`);
  }
  return s.filter((x) => x.replace(/[\s.,-]/g, "") !== "");
}

/**
 * FORM DE EMPENHO — ilha client, Server Action autenticada.
 *
 * ⚠️ A CATEGORIA DA ORDEM CRONOLÓGICA NASCE VAZIA, de propósito. O `zEmpenharInput`
 * recusa empenho sem contrato e sem categoria, e o comentário dele diz por quê: um
 * default a faria virar FORNECIMENTO_BENS em silêncio, e a fila de obras se misturaria
 * com a de bens sem ninguém perceber. O `required` do select repete a regra do domínio
 * na tela — não a substitui. (V22: o contrato escolhido PREENCHE a categoria dele — é a
 * categoria declarada no contrato, não um default.)
 *
 * ⚠️ V22 — A ORIGEM PREENCHE, NÃO DECIDE. Escolher a ordem, o contrato ou a reserva sugere a ficha,
 * o credor, o valor, a categoria e o histórico; tudo continua editável, e o que viaja é o que está
 * nos campos. Saldo, vigência, fonte e elemento continuam conferidos pelo domínio, na transação.
 */
export function FormEmpenho({
  fichas,
  ordemPadrao = "",
  solicitacaoPadrao = "",
  reservaPadrao = "",
  contratoPadrao = "",
  numeroSugerido,
  credorPadrao,
  podeCadastrarCredor = false,
}: {
  readonly fichas: readonly FichaParaEmpenho[];
  readonly ordemPadrao?: string;
  /** V22: a solicitação autorizada vinda da tela de solicitações ("Emitir empenho"). */
  readonly solicitacaoPadrao?: string;
  /** V37 — a reserva vinda da ficha ("Empenhar com esta reserva"): sugere a ficha e o valor. */
  readonly reservaPadrao?: string;
  /** V37 — o contrato vindo da ordem de serviço ("Empenhar por este contrato"): sugere credor, valor e categoria. */
  readonly contratoPadrao?: string;
  /** V37 — o próximo número livre do exercício (inclusive os reservados pelo sistema), já no campo. */
  readonly numeroSugerido?: string | undefined;
  /** V37 — o credor que volta escolhido do atalho de cadastro (`?credor=` da URL). */
  readonly credorPadrao?: string | undefined;
  /** V37 — o servidor diz se quem está aqui pode cadastrar o credor; sem isso, o atalho não aparece. */
  readonly podeCadastrarCredor?: boolean;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoEmpenho, FormData>(empenharAction, {});
  const ref = useRef<HTMLFormElement>(null);

  const [fichaId, setFichaId] = useState("");
  const [buscaFicha, setBuscaFicha] = useState("");
  const [credor, setCredor] = useState<{ doc: string; nome: string; versao: number }>({ doc: credorPadrao ?? "", nome: "", versao: 0 });
  const [credorManual, setCredorManual] = useState(false);
  // Quando o documento digitado não está no cadastro de credores, a tela passa sozinha para o credor
  // sem cadastro, com o documento já preenchido — e diz por quê.
  const [credorNaoCadastrado, setCredorNaoCadastrado] = useState(false);
  // V36 (TR 5.10.1.38) — o débito do credor escolhido em dívida ativa, consultado no servidor a cada credor novo.
  const [debito, setDebito] = useState<{ readonly inscricoes: number; readonly saldo: string } | "indisponivel" | undefined>(undefined);
  useEffect(() => {
    const doc = [...credor.doc].filter((c) => c >= "0" && c <= "9").join("");
    if (doc.length !== 11 && doc.length !== 14) {
      setDebito(undefined);
      return;
    }
    let vivo = true;
    void debitosDoCredorAction(doc).then((r) => {
      if (vivo) setDebito(r ?? undefined);
    });
    return () => {
      vivo = false;
    };
  }, [credor.doc]);
  const [valor, setValor] = useState<{ cru: string; versao: number }>({ cru: "", versao: 0 });
  // V36 (TR 5.10.1.10) — o disponível da ficha na data de emissão (o empenho com data anterior não consome crédito de
  // data posterior) e o de agora, consultados no servidor a cada ficha ou data nova. A guarda é a do servidor.
  const [dataEmissao, setDataEmissao] = useState("");
  const [naData, setNaData] = useState<{ readonly naData: string; readonly atual: string } | "indisponivel" | undefined>(undefined);
  useEffect(() => {
    if (fichaId === "" || !/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao)) {
      setNaData(undefined);
      return;
    }
    let vivo = true;
    setNaData(undefined);
    void disponivelNaDataAction(fichaId, dataEmissao).then((r) => {
      if (vivo) setNaData(r ?? "indisponivel");
    });
    return () => {
      vivo = false;
    };
  }, [fichaId, dataEmissao]);
  const [categoria, setCategoria] = useState<Categoria>("");
  const [tipo, setTipo] = useState<"ORDINARIO" | "GLOBAL" | "ESTIMATIVO">("ORDINARIO");
  const [historico, setHistorico] = useState("");
  const historicoAutomatico = useRef("");
  const [origens, setOrigens] = useState<Origens>(SEM_ORIGEM);
  const [rodada, setRodada] = useState(0);

  // Sucesso: limpa o formulário inteiro (inclusive os seletores, pela `key` da rodada).
  useEffect(() => {
    if (estado.sucesso === undefined) return;
    ref.current?.reset();
    setFichaId("");
    setCredor({ doc: "", nome: "", versao: 0 });
    setCredorManual(false);
    setValor({ cru: "", versao: 0 });
    setCategoria("");
    setTipo("ORDINARIO");
    setHistorico("");
    historicoAutomatico.current = "";
    setOrigens(SEM_ORIGEM);
    setRodada((r) => r + 1);
  }, [estado]);

  const sugestoes = sugestoesDeHistorico(origens, credor.nome);

  // O histórico se autopreenche enquanto a pessoa não escreveu o dela.
  useEffect(() => {
    const primeira = sugestoes[0] ?? "";
    if (historico === "" || historico === historicoAutomatico.current) {
      historicoAutomatico.current = primeira;
      setHistorico(primeira);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só quando a origem muda
  }, [origens, credor.nome]);

  function aplicarOrigem(tipo: keyof Origens, o: OpcaoDoSeletor | null): void {
    setOrigens((atual) => ({ ...atual, [tipo]: o }));
    if (o === null) return;
    const d = o.dados ?? {};
    const ficha = d["fichaId"];
    if (ficha !== undefined && ficha !== "" && fichas.some((f) => f.id === ficha)) setFichaId(ficha);
    const doc = d["credorDocumento"];
    if (doc !== undefined && doc !== "") {
      setCredor((c) => ({ doc, nome: d["credorNome"] ?? "", versao: c.versao + 1 }));
    }
    const v = d["valor"] ?? (tipo === "reserva" ? d["saldo"] : undefined);
    if (v !== undefined && v !== "") setValor((x) => ({ cru: v, versao: x.versao + 1 }));
    if (ehCategoria(d["categoria"])) setCategoria(d["categoria"]);
    // o tipo do empenho acompanha o tipo da ordem (ordinária → ordinário...) — o M05 recusa o contrário
    const t = d["tipoEmpenho"];
    if (t === "ORDINARIO" || t === "GLOBAL" || t === "ESTIMATIVO") setTipo(t);
  }

  if (fichas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Nenhuma ficha disponível</strong> para a unidade e o
        exercício selecionados. O empenho exige uma ficha de dotação da LOA.
      </div>
    );
  }

  const fichaEscolhida = fichas.find((f) => f.id === fichaId);
  // A ficha escolhida continua na lista mesmo que a busca a exclua: o select não pode perder o valor que tem.
  const fichasVisiveis = ((casam) => (fichaEscolhida !== undefined && !casam.includes(fichaEscolhida) ? [fichaEscolhida, ...casam] : casam))(fichasQueCasam(fichas, buscaFicha));
  // V22: escolhida uma solicitação, os vínculos são os DELA (enviados como estão; o M05 confere).
  const solicitacaoEscolhida: Readonly<Record<string, string>> | null = origens.solicitacao === null ? null : (origens.solicitacao.dados ?? {});

  return (
    <form ref={ref} action={action} data-acao="empenhar" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Emitir empenho</h2>
      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        Comece pela origem: a solicitação autorizada, a ordem de compra, o contrato ou a reserva
        preenchem a ficha, o credor, o valor e o histórico. Tudo continua editável.
      </p>

      <fieldset className="mb-4 grid gap-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 md:grid-cols-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink-2)]">Origem (opcional)</legend>
        <CampoReferenciado
          key={`solicitacao-${rodada}`}
          name="solicitacaoDeEmpenhoId"
          rotulo="Solicitação de empenho autorizada"
          catalogo="solicitacoes-autorizadas-para-empenho"
          placeholder="Digite o número da solicitação ou parte do histórico"
          ajuda="O empenho emitido de uma solicitação mantém a ficha, o credor, o tipo e os vínculos autorizados; o valor pode ser igual ou menor."
          largura={3}
          valorInicial={solicitacaoPadrao}
          avisarInicial
          aoEscolher={(o) => aplicarOrigem("solicitacao", o)}
        />
        {solicitacaoEscolhida !== null ? (
          <div className="md:col-span-3" data-vinculos-da-solicitacao>
            <span className={ROTULO}>Vínculos definidos pela solicitação</span>
            {VINCULOS_DA_SOLICITACAO.filter((v) => (solicitacaoEscolhida[v.campo] ?? "") !== "").length === 0 ? (
              <p className="text-xs text-[color:var(--color-ink-3)]">A solicitação não indica contrato, ordem de compra, convênio, obra nem dívida fundada.</p>
            ) : (
              <ul className="flex flex-wrap gap-2 text-xs">
                {VINCULOS_DA_SOLICITACAO.filter((v) => (solicitacaoEscolhida[v.campo] ?? "") !== "").map((v) => (
                  <li key={v.campo} className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-2 py-1 text-[color:var(--color-ink-2)]">
                    {v.rotulo}: <strong className="text-[color:var(--color-ink)]">{solicitacaoEscolhida[v.chaveDoRotulo] ?? ""}</strong>
                  </li>
                ))}
              </ul>
            )}
            {VINCULOS_DA_SOLICITACAO.map((v) =>
              (solicitacaoEscolhida[v.campo] ?? "") !== "" ? (
                <input key={v.campo} type="hidden" name={v.campo} value={solicitacaoEscolhida[v.campo]} />
              ) : null
            )}
          </div>
        ) : (
          <>
            <CampoReferenciado
              key={`ordem-${rodada}`}
              name="ordemDeCompraId"
              rotulo="Ordem de compra"
              catalogo="ordens-para-empenho"
              placeholder="Digite o número da ordem"
              largura={1}
              valorInicial={ordemPadrao}
              avisarInicial
              aoEscolher={(o) => aplicarOrigem("ordem", o)}
            />
            <CampoReferenciado
              key={`contrato-${rodada}`}
              name="contratoId"
              rotulo="Contrato"
              catalogo="contratos-para-empenho"
              placeholder="Digite o número do contrato"
              largura={1}
              valorInicial={contratoPadrao}
              avisarInicial
              aoEscolher={(o) => aplicarOrigem("contrato", o)}
            />
          </>
        )}
        <CampoReferenciado
          key={`reserva-${rodada}`}
          name="reservaId"
          rotulo="Reserva de dotação"
          catalogo="reservas-para-empenho"
          placeholder="Ficha, processo ou texto"
          largura={1}
          valorInicial={reservaPadrao}
          avisarInicial
          aoEscolher={(o) => aplicarOrigem("reserva", o)}
        />
      </fieldset>

      {solicitacaoEscolhida === null ? (
        <fieldset className="mb-4 grid gap-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 md:grid-cols-3" data-vinculacoes>
          <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink-2)]">Vinculações (opcional)</legend>
          <CampoReferenciado
            key={`convenio-${rodada}`}
            name="convenioId"
            rotulo="Convênio"
            catalogo="convenios-para-empenho"
            placeholder="Número do termo, objeto ou concedente"
            ajuda="Vincule quando a despesa executa um convênio, inclusive a contrapartida."
            largura={1}
          />
          <CampoReferenciado
            key={`obra-${rodada}`}
            name="obraId"
            rotulo="Obra"
            catalogo="obras-para-empenho"
            placeholder="Identificador ou descrição da obra"
            ajuda="Obrigatória no elemento 51 (obras e instalações); nos demais, vincule para acompanhar a obra."
            largura={1}
          />
          <CampoReferenciado
            key={`divida-${rodada}`}
            name="dividaId"
            rotulo="Dívida fundada"
            catalogo="dividas-para-empenho"
            placeholder="Identificador, credor ou objeto"
            ajuda="Somente em empenho de amortização da dívida (grupo 6), onde é obrigatória."
            largura={1}
          />
          <CampoReferenciado
            key={`campanha-${rodada}`}
            name="campanhaPublicitariaId"
            rotulo="Campanha publicitária"
            catalogo="campanhas-para-empenho"
            placeholder="Identificador ou título da campanha"
            ajuda="Vincule quando a despesa custeia uma campanha publicitária cadastrada."
            largura={1}
          />
          <CampoReferenciado
            key={`ppp-${rodada}`}
            name="contratoPppId"
            rotulo="Parceria público-privada"
            catalogo="ppps-para-empenho"
            placeholder="Número do contrato ou empresa parceira"
            ajuda="Vincule quando a despesa é contraprestação ou aporte de uma parceria cadastrada."
            largura={1}
          />
          <CampoReferenciado
            key={`precatorio-${rodada}`}
            name="precatorioId"
            rotulo="Precatório"
            catalogo="precatorios-para-empenho"
            placeholder="Número do processo ou beneficiário"
            ajuda="Vincule quando o empenho paga um precatório inscrito; a ficha tem de ser de sentenças judiciais. O pagamento baixa o precatório e confere a ordem cronológica."
            largura={1}
          />
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Buscar a dotação</span>
          <input
            type="search"
            value={buscaFicha}
            onChange={(e) => setBuscaFicha(e.target.value)}
            placeholder="Número, natureza, fonte, unidade, programa, ação ou código reduzido"
            className={CAMPO}
            data-busca-da-ficha
          />
          <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]" data-fichas-encontradas>
            {fichasVisiveis.length === fichas.length ? `${String(fichas.length)} fichas` : `${String(fichasVisiveis.length)} de ${String(fichas.length)} fichas`}
          </span>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Ficha (dotação)</span>
          <select name="fichaId" required value={fichaId} onChange={(e) => setFichaId(e.target.value)} className={CAMPO}>
            <option value="" disabled>
              Escolha a ficha…
            </option>
            {fichasVisiveis.map((f) => (
              <option key={f.id} value={f.id}>
                {f.numero} — {f.naturezaCodigo} {f.naturezaDescricao} · fonte {f.fonteCodigo} · disponível R${" "}
                {formatarMoeda(f.saldoDisponivel).texto}
              </option>
            ))}
          </select>
          {fichaEscolhida !== undefined ? (
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]" data-disponivel>
              Disponível na ficha: <strong className="tabular text-[color:var(--color-ink)]">R$ {formatarMoeda(fichaEscolhida.saldoDisponivel).texto}</strong>
            </span>
          ) : null}
          {/* V38 — a classificação herdada da dotação, inteira: a contadora sentiu falta dela depois de escolher a ficha. */}
          {fichaEscolhida !== undefined ? (
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-2)]" data-dotacao-escolhida>
              {fichaEscolhida.unidade !== undefined ? `Unidade ${fichaEscolhida.unidade} · ` : ""}
              {fichaEscolhida.classificacao !== undefined ? `${fichaEscolhida.classificacao} · ` : ""}
              natureza {fichaEscolhida.naturezaCodigo} {fichaEscolhida.naturezaDescricao} · fonte {fichaEscolhida.fonteCodigo}
            </span>
          ) : null}
          {fichaEscolhida !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(dataEmissao) ? (
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]" data-disponivel-na-data={dataEmissao}>
              {naData === undefined ? (
                "Consultando o disponível na data do empenho…"
              ) : naData === "indisponivel" ? (
                "Não foi possível consultar o disponível na data do empenho; a emissão confere no servidor."
              ) : (
                <>
                  Disponível em {dataEmissao.split("-").reverse().join("/")}:{" "}
                  <strong className="tabular text-[color:var(--color-ink)]" data-valor-na-data>R$ {formatarMoeda(naData.naData).texto}</strong>
                  {" "}· hoje: <strong className="tabular text-[color:var(--color-ink)]" data-valor-atual>R$ {formatarMoeda(naData.atual).texto}</strong>
                  . O empenho tem de caber nos dois.
                </>
              )}
            </span>
          ) : null}
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da nota</span>
          <input name="numero" required inputMode="numeric" defaultValue={numeroSugerido} placeholder={numeroSugerido !== undefined && numeroSugerido !== "" ? numeroSugerido : "0000001"} className={CAMPO} />
          <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">Só números, até 7 dígitos: é assim que o SAGRES recebe. Já vem o próximo número livre do exercício.</span>
        </label>

        {credorManual ? (
          <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
            <span className={ROTULO}>Credor (CPF/CNPJ sem cadastro)</span>
            {/*
              ⚠️ O `minLength={11}` SAIU com a máscara, e não foi um afrouxamento. Quem mede o
              comprimento é o domínio, sobre os DÍGITOS que o hidden submete (`zEmpenharInput`).
            */}
            <CampoCpfCnpj key={`manual-${credor.versao}`} name="credor" required defaultValue={credor.doc} placeholder="12.345.678/0001-95" className={CAMPO} />
            {credorNaoCadastrado ? (
              <span role="status" className="mt-1 block text-[11px] text-[color:var(--color-ink-2)]">
                Este documento não está no cadastro de credores. Confira o número e emita como credor sem cadastro, ou cadastre o credor antes.
                {podeCadastrarCredor ? (
                  <>
                    {" "}
                    <a href={linkDeCadastro(CADASTRO_DE_CREDOR, credor.doc, typeof window === "undefined" ? "/despesa/empenhos" : `${window.location.pathname}${window.location.search}`)} className="font-medium text-[color:var(--color-primary)] hover:underline" data-atalho-de-cadastro>
                      Cadastrar este credor
                    </a>
                  </>
                ) : null}
              </span>
            ) : null}
            <button type="button" onClick={() => { setCredorManual(false); setCredorNaoCadastrado(false); }} className="mt-1 text-[11px] font-medium text-[color:var(--color-primary)] hover:underline">
              Buscar no cadastro de credores
            </button>
          </label>
        ) : (
          <div className="sm:col-span-2">
            <CampoReferenciado
              key={`credor-${rodada}-${credor.versao}`}
              name="credor"
              rotulo="Credor"
              catalogo="credores"
              obrigatorio
              placeholder="Digite o CPF, o CNPJ ou o nome"
              largura={4}
              {...(credor.doc !== "" ? { valorInicial: credor.doc } : {})}
              aoEscolher={(o) => setCredor((c) => ({ doc: o?.valor ?? "", nome: o?.dados?.["credorNome"] ?? "", versao: c.versao }))}
              {...(podeCadastrarCredor ? { cadastro: { href: CADASTRO_DE_CREDOR, rotulo: "Cadastrar este credor" } } : {})}
              aoNaoEncontrar={(t) => {
                const digitos = t.replace(/\D/g, "");
                if (digitos.length !== 11 && digitos.length !== 14) return;
                setCredor((c) => ({ doc: digitos, nome: "", versao: c.versao + 1 }));
                setCredorNaoCadastrado(true);
                setCredorManual(true);
              }}
            />
            <button type="button" onClick={() => setCredorManual(true)} className="mt-1 text-[11px] font-medium text-[color:var(--color-primary)] hover:underline">
              Credor sem cadastro? Digitar o documento
            </button>
          </div>
        )}
        {debito !== undefined ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <AvisoDeDebitoDoCredor debito={debito} />
          </div>
        ) : null}

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor key={`valor-${rodada}-${valor.versao}`} name="valor" required defaultValue={valor.cru} placeholder="10.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do empenho</span>
          <input name="data" type="date" required value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo</span>
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={CAMPO}>
            <option value="ORDINARIO">Ordinário</option>
            <option value="GLOBAL">Global</option>
            <option value="ESTIMATIVO">Estimativo</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Categoria (art. 141)</span>
          {/* ⚠️ sem default — ver o cabeçalho: por decisão do domínio. */}
          <select name="categoria" required value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            <option value="FORNECIMENTO_BENS">Fornecimento de bens</option>
            <option value="LOCACAO">Locação</option>
            <option value="PRESTACAO_SERVICOS">Prestação de serviços</option>
            <option value="REALIZACAO_OBRAS">Realização de obras</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <textarea
            name="historico"
            required
            rows={2}
            value={historico}
            onChange={(e) => setHistorico(e.target.value)}
            placeholder="aquisição de material de expediente — processo 2026/001"
            className={CAMPO}
          />
        </label>
        {sugestoes.length > 0 ? (
          <div className="sm:col-span-2 lg:col-span-3" data-sugestoes-de-historico>
            <span className={ROTULO}>Textos sugeridos pela origem</span>
            <ul className="flex flex-col gap-1">
              {sugestoes.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      historicoAutomatico.current = s;
                      setHistorico(s);
                    }}
                    aria-pressed={historico === s}
                    className={`w-full rounded-[var(--radius-md)] border px-3 py-1.5 text-left text-xs ${
                      historico === s
                        ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary-soft)] text-[color:var(--color-ink)]"
                        : "border-[color:var(--color-border)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                    }`}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-do-envio="erro" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-do-envio="sucesso" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Emitindo…" : "Emitir empenho"}
      </button>
    </form>
  );
}
