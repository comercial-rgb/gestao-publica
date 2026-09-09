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
