import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao, type Identidade } from "./sessao";
import { autorizarLeituraDoRegistroPara, EscopoDeLeituraError } from "./leitura";
import {
  listarEmpenhos,
  listarFichas,
  vocabularioDosEmpenhos,
  type EmpenhoNaLista,
  type FichaNaLista,
  type VinculoDoEmpenho,
} from "../../modules/m05-despesa/consultas";
export { DIMENSOES_CONSULTAVEIS, type VinculoDoEmpenho } from "../../modules/m05-despesa/consultas";
import { criarM05DepsComContratos } from "../../modules/m11-licitacoes/adapter-m05";
import { empenhar } from "../../modules/m05-despesa/servico";
import { roteiroEmpenho } from "../../modules/m01-core-contabil/roteiros";
import {
  dossieDoEmpenho,
  type DossieDoEmpenho,
  type FatoDaCadeia,
} from "../../modules/m05-despesa/dossie";

/**
 * PORTA — EMPENHOS (execução da despesa, TR 5.17).
 *
 * ═══ A ESCRITA VOLTOU (7.3), e o que a destravou ═══
 * A 7.1 deixou esta porta só-leitura porque `empenhar(input, roteiro, deps)` exige um
 * roteiro e **nenhum código de produção montava um**: `ContaPcasp` nascia só em teste,
 * e `resolverContas` é fail-closed. A 7.2 resolveu as duas pontas — os roteiros oficiais
 * em `modules/m01-core-contabil/roteiros.ts` e o plano em `prisma/seed/pcasp.ts`.
 *
 * ⚠️ A PORTA **ENCAMINHA** O ROTEIRO, NÃO O ESCOLHE. Ela importa `roteiroEmpenho` do
 * M01 e o passa adiante. Escolher contas aqui seria pôr contabilidade na camada de
 * pixel — foi exatamente o que a 7.1 se recusou a fazer.
 */

export { PortaSemBancoError, EscopoDeLeituraError };

/** O empenho como a TELA o consome — todo dinheiro em `string`, nunca `number`. */
export interface EmpenhoDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly credorCpfCnpj: string;
  /** V22: o nome do credor no cadastro de pessoas, quando o documento está lá; `null` quando não está. */
  readonly credorNome: string | null;
  /** V22: os vínculos voluntários do empenho, em texto ("CP-001/2026 — Vacinação"); `null` quando não há. */
  readonly campanha: string | null;
  readonly convenio: string | null;
  readonly historico: string;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly categoria: string;
  readonly valor: string;
  readonly empenhadoLiquido: string;
  readonly anulacoes: string;
  readonly liquidado: string;
  readonly pago: string;
  readonly saldoALiquidar: string;
  readonly saldoAPagar: string;
  readonly anulado: boolean;
  readonly status: string;
}

/**
 * Os empenhos do exercício (e da unidade, quando houver), com os saldos da TR 5.17.
 *
 * A porta NÃO deriva nada: quem soma é `modules/m05-despesa/consultas`. Aqui só se
 * troca `Decimal` por `string` — a regra de ouro do domínio atravessando a borda.
 */
export async function listarEmpenhosDaExecucao(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
  /**
   * ADITIVO (relatórios gerenciais). CPF/CNPJ **só dígitos** — casamento EXATO.
   *
   * ⚠️ NÃO É BUSCA POR NOME, e não pode ser: o schema não tem entidade Credor. O
   * `Empenho` guarda a string do documento e nada mais. Quem passa um documento
   * mascarado ("12.345.678/0001-95") não acha nada — a normalização é da BORDA, e é
   * lá que ela está (`soDigitos`, em lib/format/mascaras).
   */
  readonly credorCpfCnpj?: string | undefined;
  /** ADITIVO. Código da fonte de recursos — filtra pela ficha do empenho. */
  readonly fonteCodigo?: string | undefined;
  /** V31 — os empenhos de uma ficha. */
  readonly fichaId?: string | undefined;
  /** V36 — os empenhos de uma obra, convênio, precatório, consórcio ou dívida. */
  readonly vinculo?: VinculoDoEmpenho | undefined;
  /** V36 — os empenhos de um tipo (o encerramento lista os estimativos com saldo). */
  readonly tipoDoEmpenho?: "ORDINARIO" | "GLOBAL" | "ESTIMATIVO" | undefined;
}): Promise<readonly EmpenhoDaTela[]> {
  // ⚠️ TODO filtro desce ao SQL do módulo. A porta NUNCA recorta a lista depois de
  // recebê-la: um `.filter()` aqui traria o exercício inteiro do banco para jogar fora,
  // e — pior — separaria o empenho das anulações dele, arruinando o `empenhadoLiquido`.
  const linhas = await listarEmpenhos(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
    ...(p.credorCpfCnpj !== undefined ? { credorCpfCnpj: p.credorCpfCnpj } : {}),
    ...(p.fonteCodigo !== undefined ? { fonteCodigo: p.fonteCodigo } : {}),
    ...(p.fichaId !== undefined ? { fichaId: p.fichaId } : {}),
    ...(p.vinculo !== undefined ? { vinculo: p.vinculo } : {}),
    ...(p.tipoDoEmpenho !== undefined ? { tipoDoEmpenho: p.tipoDoEmpenho } : {}),
  });
  const [nomes, vinculos] = await Promise.all([
    nomesDosCredores(linhas.map((l) => l.credorCpfCnpj)),
    vinculosDosEmpenhos(linhas.map((l) => l.id)),
  ]);
  return linhas.map((l) => ({
    ...paraTela(l),
    credorNome: nomes.get(l.credorCpfCnpj) ?? null,
    campanha: vinculos.get(l.id)?.campanha ?? null,
    convenio: vinculos.get(l.id)?.convenio ?? null,
  }));
}

/**
 * V22 — OS VÍNCULOS VOLUNTÁRIOS (campanha publicitária e convênio), lidos numa consulta só para a
 * lista inteira. São exibição: a soma por vínculo é do M05 (`empenhadoLiquidoDaCampanha`,
 * `empenhadoLiquidoDoConvenio`).
 */
async function vinculosDosEmpenhos(ids: readonly string[]): Promise<ReadonlyMap<string, { readonly campanha: string | null; readonly convenio: string | null }>> {
  if (ids.length === 0) return new Map();
  const linhas = await cliente().empenho.findMany({
    where: { id: { in: [...ids] }, OR: [{ campanhaPublicitariaId: { not: null } }, { convenioId: { not: null } }] },
    select: {
      id: true,
      campanhaPublicitaria: { select: { identificador: true, titulo: true } },
      convenio: { select: { identificador: true, objeto: true } },
    },
  });
  return new Map(
    linhas.map((l) => [
      l.id,
      {
        campanha: l.campanhaPublicitaria === null ? null : `${l.campanhaPublicitaria.identificador} — ${l.campanhaPublicitaria.titulo}`,
        convenio: l.convenio === null ? null : `${l.convenio.identificador} — ${l.convenio.objeto}`,
      },
    ])
  );
}

/**
 * V22 — O NOME DO CREDOR, lido do cadastro numa consulta só. O empenho guarda o DOCUMENTO como
 * fato (não é chave do cadastro); o nome é exibição, e um documento sem cadastro fica sem nome —
 * a tela mostra o documento, nunca um nome inventado.
 */
export async function nomesDosCredores(documentos: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const unicos = [...new Set(documentos)].filter((d) => d !== "");
  if (unicos.length === 0) return new Map();
  const pessoas = await cliente().pessoa.findMany({
    where: { documento: { in: unicos } },
    select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } },
  });
  const m = new Map<string, string>();
  for (const x of pessoas) {
    const nome = x.versoes[0]?.nome;
    if (nome !== undefined) m.set(x.documento, nome);
  }
  return m;
}

/** As opções do filtro gerencial: os credores e as fontes que existem no recorte. */
export interface VocabularioDaTela {
  readonly credores: readonly string[];
  readonly fontes: readonly string[];
}

/**
 * O vocabulário do filtro — documentos e fontes REAIS do exercício/unidade.
 *
 * ⚠️ SEM O PRÓPRIO FILTRO. Ele descreve o universo escolhível, não o recorte escolhido:
 * um vocabulário já filtrado deixaria o `select` com uma opção só, e o usuário preso na
 * escolha anterior.
 */
export async function lerVocabularioDeEmpenhos(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}): Promise<VocabularioDaTela> {
  return vocabularioDosEmpenhos(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
  });
}

/** A ficha como o SELECT do form a consome. */
export interface FichaDaTela {
  readonly id: string;
  readonly numero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly saldoDisponivel: string;
}

/** As fichas do exercício/unidade — o vocabulário do form de empenho. */
export async function listarFichasParaEmpenho(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}): Promise<readonly FichaDaTela[]> {
  const fichas = await listarFichas(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
  });
  return fichas.map((f: FichaNaLista) => ({
    id: f.id,
    numero: f.numero,
    unidadeCodigo: f.unidadeCodigo,
    unidadeNome: f.unidadeNome,
    fonteCodigo: f.fonteCodigo,
    naturezaCodigo: f.naturezaCodigo,
    naturezaDescricao: f.naturezaDescricao,
    saldoDisponivel: f.saldoDisponivel.toFixed(2),
  }));
}

/**
 * EMITIR O EMPENHO — escrita autenticada.
 *
 * Exige sessão (fail-closed), injeta o `criadoPor` real e grava o `RegistroDeOperacao`.
 * O `valor` é `string`: a regra de ouro atravessa a borda intacta.
 *
 * ⚠️ NENHUM GUARD AQUI. Saldo da dotação, categoria obrigatória sem contrato, vínculo
 * de obra (TR 4.50) — tudo isso é do domínio, dentro da transação, contra o SUM real. A
 * porta que "conferisse antes" estaria conferindo um número que já está velho quando a
 * gravação acontece, e o erro do domínio sobe para a tela com a mensagem que ele
 * escreveu.
 */
export async function registrarEmpenho(input: {
  readonly fichaId: string;
  readonly numero: string;
  readonly tipo: "ORDINARIO" | "GLOBAL" | "ESTIMATIVO";
  readonly valor: string;
  readonly data: Date;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  readonly categoriaOrdemCronologica:
    | "FORNECIMENTO_BENS"
    | "LOCACAO"
    | "PRESTACAO_SERVICOS"
    | "REALIZACAO_OBRAS";
  /** V4 (§8): o contrato do processo homologado — a TR 4.42 só libera a reserva vinculada com ele informado. */
  readonly contratoId?: string;
  /** V4 (§8): a reserva de dotação que este empenho consome. */
  readonly reservaId?: string;
  /** V5 Fila A: a ordem de compra da qual este empenho nasce. */
  readonly ordemDeCompraId?: string;
  /** V22: o convênio, a obra e a dívida fundada — vínculos que o M05 confere na transação. */
  readonly convenioId?: string;
  readonly obraId?: string;
  readonly dividaId?: string;
  /** V22: a campanha publicitária que o empenho custeia (o M05 confere que existe). */
  readonly campanhaPublicitariaId?: string;
  /** V32: o precatório que o empenho paga (o M05 confere inscrição e elemento 91). */
  readonly precatorioId?: string;
  /** V22: a solicitação autorizada de origem — o M05 confere situação e conteúdo, sob trava. */
  readonly solicitacaoDeEmpenhoId?: string;
}): Promise<string> {
  return comEscritaAutenticada("EMPENHAR", async (criadoPor) => {
    const { contratoId, reservaId, ordemDeCompraId, convenioId, obraId, dividaId, solicitacaoDeEmpenhoId, ...resto } = input;
    const r = await empenhar(
      {
        ...resto,
        ...(contratoId !== undefined ? { contratoId } : {}),
        ...(reservaId !== undefined ? { reservaId } : {}),
        ...(ordemDeCompraId !== undefined ? { ordemDeCompraId } : {}),
        ...(convenioId !== undefined ? { convenioId } : {}),
        ...(obraId !== undefined ? { obraId } : {}),
        ...(dividaId !== undefined ? { dividaId } : {}),
        ...(solicitacaoDeEmpenhoId !== undefined ? { solicitacaoDeEmpenhoId } : {}),
        criadoPor,
      },
      roteiroEmpenho(),
      // ⚠️ COM O M11 LIGADO: sem a port de contratos o M05 recusa qualquer `contratoId` ("módulo de
      // contratos não foi ligado") — e com ela confere homologação, vigência e saldo do contrato.
      criarM05DepsComContratos(cliente())
    );
    return r.empenhoId;
  });
}

function paraTela(e: EmpenhoNaLista): Omit<EmpenhoDaTela, "credorNome" | "campanha" | "convenio"> {
  return {
    id: e.id,
    numero: e.numero,
    data: e.data,
    credorCpfCnpj: e.credorCpfCnpj,
    historico: e.historico,
    fichaNumero: e.fichaNumero,
    unidadeCodigo: e.unidadeCodigo,
    unidadeNome: e.unidadeNome,
    fonteCodigo: e.fonteCodigo,
    naturezaCodigo: e.naturezaCodigo,
    categoria: e.categoriaOrdemCronologica,
    valor: e.valor.toFixed(2),
    empenhadoLiquido: e.empenhadoLiquido.toFixed(2),
    anulacoes: e.anulacoes.toFixed(2),
    liquidado: e.liquidado.toFixed(2),
    pago: e.pago.toFixed(2),
    saldoALiquidar: e.saldoALiquidar.toFixed(2),
    saldoAPagar: e.saldoAPagar.toFixed(2),
    anulado: e.anulado,
    status: e.status,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O DOSSIÊ DE UM EMPENHO — a tela de conferência.
//
// ⚠️ A PORTA SÓ TROCA `Decimal` POR `string`. Nenhuma soma nasce aqui: quem monta a
// cadeia, o líquido de cada fato, o retido vivo e o total por subsistema é
// `modules/m05-despesa/dossie.ts`. Uma aritmética a mais nesta camada seria a segunda
// resposta para "quanto deste empenho ainda vale" — e a tela mostraria a errada com a
// mesma confiança com que mostraria a certa.
// ═══════════════════════════════════════════════════════════════════════════

export interface FatoDaCadeiaDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: string;
  readonly natureza: string;
  readonly refereSeA: string | null;
  readonly lancamentoId: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

export interface RetencaoDaTela {
  readonly id: string;
  readonly tipoCodigo: string;
  readonly tipoDescricao: string;
  readonly credorConsignatario: string;
  readonly valor: string;
  readonly data: Date;
  readonly movimento: string;
  readonly estornoDeId: string | null;
  readonly criadoPor: string;
  /** V36 — o lançamento da retenção (o histórico do dossiê o abre). */
  readonly lancamentoId: string;
}

export interface PagamentoDoDossieDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: string;
  readonly pagoLiquido: string;
  readonly totalRetido: string;
  readonly saidaDeCaixa: string;
  readonly contaBancaria: string;
  readonly fonteCodigo: string;
  readonly anulado: boolean;
  readonly cadeia: readonly FatoDaCadeiaDaTela[];
  readonly retencoes: readonly RetencaoDaTela[];
}

export interface LiquidacaoDoDossieDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: string;
  readonly liquidadoLiquido: string;
  readonly pago: string;
  readonly saldoAPagar: string;
  readonly responsavelAtesto: string;
  readonly notaFiscalNum: string | null;
  readonly notaFiscalSerie: string | null;
  readonly notaFiscalData: Date | null;
  readonly anulado: boolean;
  readonly cadeia: readonly FatoDaCadeiaDaTela[];
  readonly pagamentos: readonly PagamentoDoDossieDaTela[];
}

export interface PartidaDaTela {
  readonly contaCodigo: string;
  readonly contaTitulo: string;
  readonly tipo: string;
  readonly subsistema: string;
  readonly valor: string;
  readonly fichaNumero: number | null;
}

export interface TotalDoSubsistemaDaTela {
  readonly subsistema: string;
  readonly debito: string;
  readonly credito: string;
  readonly fecha: boolean;
}

export interface LancamentoDaTela {
  readonly id: string;
  readonly numeroControle: string;
  readonly dataTransacao: Date;
  readonly historico: string;
  readonly origemTipo: string;
  readonly estornoDeId: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly partidas: readonly PartidaDaTela[];
  readonly totais: readonly TotalDoSubsistemaDaTela[];
}

export interface OrigemDaTela {
  readonly fichaId: string;
  readonly fichaNumero: number;
  readonly exercicio: number;
  readonly orgaoCodigo: string;
  readonly orgaoNome: string;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly funcaoCodigo: string;
  readonly funcaoDescricao: string;
  readonly subfuncaoCodigo: string;
  readonly subfuncaoDescricao: string;
  readonly programaCodigo: string;
  readonly programaDescricao: string;
  readonly acaoCodigo: string;
  readonly acaoDescricao: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  readonly saldoDisponivelHoje: string;
  readonly contratoId: string | null;
  readonly processoId: string | null;
  readonly processoNumero: string | null;
  readonly contratoNumero: string | null;
  readonly contratadoNome: string | null;
  readonly ordemDeCompraId: string | null;
  readonly ordemDeCompraNumero: string | null;
  readonly obraDescricao: string | null;
  /** V33 — a folha que gerou o empenho. */
  readonly folhaId: string | null;
}

export interface DossieDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly tipo: string;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  readonly categoriaOrdemCronologica: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly valor: string;
  readonly empenhadoLiquido: string;
  readonly anulacoes: string;
  readonly liquidado: string;
  readonly pago: string;
  readonly saldoALiquidar: string;
  readonly saldoAPagar: string;
  readonly totalRetido: string;
  readonly saidaDeCaixa: string;
  readonly anulado: boolean;
  readonly status: string;
  readonly origem: OrigemDaTela;
  readonly cadeia: readonly FatoDaCadeiaDaTela[];
  readonly liquidacoes: readonly LiquidacaoDoDossieDaTela[];
  readonly lancamentos: readonly LancamentoDaTela[];
}

/** O que a página recebe: o dossiê, um desvio para o original, ou nada. */
export type ResultadoDoDossie =
  | { readonly tipo: "dossie"; readonly dossie: DossieDaTela }
  /** O id era de uma ANULAÇÃO. A tela leva o usuário ao empenho de origem. */
  | { readonly tipo: "anulacao"; readonly empenhoOriginalId: string }
  | { readonly tipo: "inexistente" };

/**
 * O DOSSIÊ, AUTORIZADO PELO PRÓPRIO REGISTRO (orquestração V3, 4.1).
 *
 * ═══ ⚠️ A PENDÊNCIA `DOSSIE-SEM-ESCOPO`, FECHADA ═══
 * Até aqui isto era `dossieDoEmpenho(cliente(), id)` — `findUnique` por id, sem exercício,
 * unidade ou identidade. `/despesa/empenhos/<id alheio>` entregava o dossiê inteiro, e o
 * recorte autorizado da LISTA não fechava o furo: o detalhe não passa pela lista.
 *
 * Agora o escopo sai do REGISTRO: a unidade da ficha do empenho é lida ANTES de qualquer
 * outra coisa, e `CONSULTAR_DESPESA` é cobrada naquela unidade. Quem não pode recebe a
 * recusa nomeando o escopo que TEM — nunca a unidade do empenho, que é metadado proibido.
 *
 * ⚠️ E O REDIRECIONAMENTO TAMBÉM É AUTORIZADO. Quando o id é de uma ANULAÇÃO, a tela leva
 * ao empenho de origem — e a origem é da mesma ficha (a anulação aponta para o empenho
 * pela FK), logo a mesma autorização cobre os dois. Um id relacionado só sai daqui depois
 * de a leitura da unidade ter passado.
 *
 * ⚠️ `inexistente` só para o id que NÃO EXISTE. Um id que existe fora do escopo recusa,
 * em vez de fingir que não existe: dizer "não encontrado" a quem seguiu um link válido o
 * manda procurar um erro de digitação que não há (a decisão da ENT10). Os ids são cuids
 * não enumeráveis; a existência de um id não é o que se protege — o conteúdo é.
 */
export async function lerDossieDoEmpenho(
  empenhoId: string
): Promise<ResultadoDoDossie> {
  return lerDossieDoEmpenhoPara(await exigirSessao(), empenhoId);
}

/** A mesma leitura com a identidade por parâmetro — a que a suíte exercita. */
export async function lerDossieDoEmpenhoPara(
  sessao: Identidade,
  empenhoId: string
): Promise<ResultadoDoDossie> {
  const tx = cliente();
  const alvo = await tx.empenho.findUnique({
    where: { id: empenhoId },
    select: { ficha: { select: { unidadeOrc: { select: { codigo: true } } } } },
  });
  if (alvo === null) return { tipo: "inexistente" };

  await autorizarLeituraDoRegistroPara(sessao, "CONSULTAR_DESPESA", alvo.ficha.unidadeOrc.codigo);

  const d = await dossieDoEmpenho(tx, empenhoId);
  if (d === null) return { tipo: "inexistente" };
  if ("redirecionarPara" in d) {
    return { tipo: "anulacao", empenhoOriginalId: d.redirecionarPara };
  }
  return { tipo: "dossie", dossie: paraTelaODossie(d) };
}

function fato(f: FatoDaCadeia): FatoDaCadeiaDaTela {
  return { ...f, valor: f.valor.toFixed(2) };
}

function paraTelaODossie(d: DossieDoEmpenho): DossieDaTela {
  return {
    id: d.id,
    numero: d.numero,
    data: d.data,
    tipo: d.tipo,
    credorCpfCnpj: d.credorCpfCnpj,
    historico: d.historico,
    categoriaOrdemCronologica: d.categoriaOrdemCronologica,
    criadoEm: d.criadoEm,
    criadoPor: d.criadoPor,
    valor: d.valor.toFixed(2),
    empenhadoLiquido: d.empenhadoLiquido.toFixed(2),
    anulacoes: d.anulacoes.toFixed(2),
    liquidado: d.liquidado.toFixed(2),
    pago: d.pago.toFixed(2),
    saldoALiquidar: d.saldoALiquidar.toFixed(2),
    saldoAPagar: d.saldoAPagar.toFixed(2),
    totalRetido: d.totalRetido.toFixed(2),
    saidaDeCaixa: d.saidaDeCaixa.toFixed(2),
    anulado: d.anulado,
    status: d.status,
    origem: {
      ...d.origem,
      saldoDisponivelHoje: d.origem.saldoDisponivelHoje.toFixed(2),
    },
    cadeia: d.cadeia.map(fato),
    liquidacoes: d.liquidacoes.map((l) => ({
      id: l.id,
      numero: l.numero,
      data: l.data,
      valor: l.valor.toFixed(2),
      liquidadoLiquido: l.liquidadoLiquido.toFixed(2),
      pago: l.pago.toFixed(2),
      saldoAPagar: l.saldoAPagar.toFixed(2),
      responsavelAtesto: l.responsavelAtesto,
      notaFiscalNum: l.notaFiscalNum,
      notaFiscalSerie: l.notaFiscalSerie,
      notaFiscalData: l.notaFiscalData,
      anulado: l.anulado,
      cadeia: l.cadeia.map(fato),
      pagamentos: l.pagamentos.map((p) => ({
        id: p.id,
        numero: p.numero,
        data: p.data,
        valor: p.valor.toFixed(2),
        pagoLiquido: p.pagoLiquido.toFixed(2),
        totalRetido: p.totalRetido.toFixed(2),
        saidaDeCaixa: p.saidaDeCaixa.toFixed(2),
        contaBancaria: p.contaBancaria,
        fonteCodigo: p.fonteCodigo,
        anulado: p.anulado,
        cadeia: p.cadeia.map(fato),
        retencoes: p.retencoes.map((r) => ({
          id: r.id,
          tipoCodigo: r.tipoCodigo,
          tipoDescricao: r.tipoDescricao,
          credorConsignatario: r.credorConsignatario,
          valor: r.valor.toFixed(2),
          data: r.data,
          movimento: r.movimento,
          estornoDeId: r.estornoDeId,
          criadoPor: r.criadoPor,
          lancamentoId: r.lancamentoId,
        })),
      })),
    })),
    lancamentos: d.lancamentos.map((l) => ({
      id: l.id,
      numeroControle: l.numeroControle,
      dataTransacao: l.dataTransacao,
      historico: l.historico,
      origemTipo: l.origemTipo,
      estornoDeId: l.estornoDeId,
      criadoEm: l.criadoEm,
      criadoPor: l.criadoPor,
      partidas: l.partidas.map((p) => ({ ...p, valor: p.valor.toFixed(2) })),
      totais: l.totais.map((t) => ({
        subsistema: t.subsistema,
        debito: t.debito.toFixed(2),
        credito: t.credito.toFixed(2),
        fecha: t.fecha,
      })),
    })),
  };
}

/**
 * V36 — COMO SE CHAMA o registro de que se abriram os empenhos ("obra OB-2026-001"). É o que a tela
 * e o PDF imprimem no recorte: um id opaco no papel não diz ao leitor o que ele está vendo. Registro
 * inexistente devolve `null`, e quem chama diz isso em vez de imprimir um rótulo inventado.
 */
export async function rotuloDoVinculoDoEmpenho(v: VinculoDoEmpenho): Promise<string | null> {
  const db = cliente();
  switch (v.dimensao) {
    case "obraId": {
      const r = await db.obra.findUnique({ where: { id: v.id }, select: { identificador: true, descricao: true } });
      return r === null ? null : `obra ${r.identificador} — ${r.descricao}`;
    }
    case "convenioId": {
      const r = await db.convenio.findUnique({ where: { id: v.id }, select: { identificador: true } });
      return r === null ? null : `convênio ${r.identificador}`;
    }
    case "precatorioId": {
      const r = await db.precatorio.findUnique({ where: { id: v.id }, select: { numeroProcesso: true } });
      return r === null ? null : `precatório ${r.numeroProcesso}`;
    }
    case "consorcioId": {
      const r = await db.consorcioPublico.findUnique({ where: { id: v.id }, select: { identificador: true } });
      return r === null ? null : `consórcio ${r.identificador}`;
    }
    case "dividaId": {
      const r = await db.dividaConsolidada.findUnique({ where: { id: v.id }, select: { identificador: true } });
      return r === null ? null : `dívida ${r.identificador}`;
    }
  }
}
