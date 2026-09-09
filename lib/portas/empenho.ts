import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  listarEmpenhos,
  listarFichas,
  vocabularioDosEmpenhos,
  type EmpenhoNaLista,
  type FichaNaLista,
} from "../../modules/m05-despesa/consultas";
import { criarM05Deps } from "../../modules/m05-despesa/adapter-prisma";
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

export { PortaSemBancoError };

/** O empenho como a TELA o consome — todo dinheiro em `string`, nunca `number`. */
export interface EmpenhoDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly fonteCodigo: string;
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
   * mascarado ("12.345.678/0001-99") não acha nada — a normalização é da BORDA, e é
   * lá que ela está (`soDigitos`, em lib/format/mascaras).
   */
  readonly credorCpfCnpj?: string | undefined;
  /** ADITIVO. Código da fonte de recursos — filtra pela ficha do empenho. */
  readonly fonteCodigo?: string | undefined;
}): Promise<readonly EmpenhoDaTela[]> {
  // ⚠️ TODO filtro desce ao SQL do módulo. A porta NUNCA recorta a lista depois de
  // recebê-la: um `.filter()` aqui traria o exercício inteiro do banco para jogar fora,
  // e — pior — separaria o empenho das anulações dele, arruinando o `empenhadoLiquido`.
  const linhas = await listarEmpenhos(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
    ...(p.credorCpfCnpj !== undefined ? { credorCpfCnpj: p.credorCpfCnpj } : {}),
    ...(p.fonteCodigo !== undefined ? { fonteCodigo: p.fonteCodigo } : {}),
  });
  return linhas.map(paraTela);
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
}): Promise<string> {
  return comEscritaAutenticada("EMPENHAR", async (criadoPor) => {
    const r = await empenhar(
      { ...input, criadoPor },
      roteiroEmpenho(),
      criarM05Deps(cliente())
    );
    return r.empenhoId;
  });
}

function paraTela(e: EmpenhoNaLista): EmpenhoDaTela {
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
  readonly contratoNumero: string | null;
  readonly contratadoNome: string | null;
  readonly obraDescricao: string | null;
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

export async function lerDossieDoEmpenho(
  empenhoId: string
): Promise<ResultadoDoDossie> {
  const d = await dossieDoEmpenho(cliente(), empenhoId);
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
