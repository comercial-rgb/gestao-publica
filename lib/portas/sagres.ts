import { cliente, PortaSemBancoError } from "./cliente";
import { exigirSessao } from "./sessao";
import {
  gerarCadastroContaBancaria,
  gerarDespesaExtra,
  gerarDotacao,
  gerarEmpenhos,
  gerarLiquidacao,
  gerarMovimentacaoEntreContas,
  gerarPagamentos,
  gerarReceitaOrcamentaria,
  gerarRetencao,
  gerarSaldoMensal,
  lerFatosCadastroConta,
  lerFatosDespesaExtra,
  lerFatosDotacao,
  lerFatosEmpenhos,
  lerFatosLiquidacao,
  lerFatosMovimentacao,
  lerFatosPagamentos,
  lerFatosReceitaOrcamentaria,
  lerFatosRetencao,
  lerFatosSaldoMensal,
  montarPacote,
  validarDominioEmpenhos,
  validarLiquidacaoReferenciaEmpenho,
  validarObrigatorios,
  LAYOUT_CADASTRO_CONTA,
  LAYOUT_DESPESA_EXTRA,
  LAYOUT_DOTACAO,
  LAYOUT_EMPENHOS,
  LAYOUT_LIQUIDACAO,
  LAYOUT_MOVIMENTACAO,
  LAYOUT_PAGAMENTOS,
  LAYOUT_RECEITA_ORCAMENTARIA,
  LAYOUT_RETENCAO,
  LAYOUT_SALDO_MENSAL,
  type ArquivoGerado,
  type Manifesto,
  type Violacao,
} from "../../adapters/tribunais/tce-pb/sagres";
import { resolverTribunal, type ExportadorTribunal } from "../../packages/tribunais-core";
import { enteDoContexto } from "../../modules/m01-core-contabil/contexto-do-ente";
import { anoCivil, competenciaCivil, diaCivil, janelaCivilDoMes } from "../../packages/datas/index";

/**
 * PORTA — SAGRES TXT (M15). A ÚNICA superfície que a UI enxerga; o domínio (adapters/tribunais/tce-pb/sagres) nunca
 * é importado por `app/` direto (grep trivalente). Tudo aqui é LEITURA: gerar/validar/empacotar não
 * muta o razão. Exige sessão (a identidade que pede a exportação).
 *
 * ⚠️ COMUNICAÇÃO HONESTA (DIRETIVA §7): esta porta produz "formato oficial gerado e validado
 * LOCALMENTE". Ela NÃO transmite, NÃO tem recibo e NÃO fala com o TCE. O `natureza` do manifesto
 * carrega isso; a UI o exibe.
 */

export { PortaSemBancoError };

/**
 * QUAL TRIBUNAL É O DESTE ENTE — PERGUNTADO AO DADO, NÃO AO `import`.
 *
 * ═══ O QUE MUDOU, E POR QUE NÃO MUDA NADA HOJE ═══
 * Até este PR a versão do layout era uma constante deste arquivo (`"2026 v1.1 (12/12/2025)"`), e o
 * tribunal era a linha de import lá em cima: SAGRES, logo TCE-PB, sempre. Isso funciona enquanto o
 * monorepo atende UM ente. Com Lapão/BA (TCM-BA) no mesmo binário, "qual tribunal" vira DADO do
 * ente — `EnteConfig.tribunalCodigo` — e quem traduz código em exportador é o registro.
 *
 * ⚠️ O VALOR RESULTANTE É O MESMO, BYTE A BYTE. O único tribunal registrado é o TCE-PB, e o
 * `layoutVersao` do adapter é a MESMA string que a constante daqui carregava — ela foi movida para
 * junto do gerador que a implementa, que é onde ela sempre deveria ter morado. O manifesto sai
 * idêntico, e o hash do pacote prova isso.
 *
 * ⚠️ POR QUE OS `lerFatos*`/`gerar*` CONTINUAM IMPORTADOS DIRETO DAQUI. A porta SAGRES valida
 * ANTES de serializar, campo a campo, usando as funções granulares do gerador — superfície que a
 * `ExportadorTribunal` deliberadamente NÃO expõe (ela tem `validar` e `gerar`, e nesta fase o
 * `validar` do adapter devolve `[]` justamente porque as validações seguem VIVAS aqui). Roteá-las
 * pela porta agora significaria ou reescrever o gerador, ou rodar as validações duas vezes — as
 * duas coisas proibidas nesta fatia. Elas sobem quando houver um segundo tribunal para unificar.
 */
async function tribunalDoEnte(prisma: ReturnType<typeof cliente>): Promise<ExportadorTribunal> {
  // ⚠️ O `select` SAIU JUNTO COM A CHAVE. `enteDoContexto` devolve a linha inteira do
  // singleton — uma linha, poucas colunas — e em troca a suposição "o ente é a linha
  // `unico`" passa a existir em UM arquivo só. Ver docs/adr/ADR-eixo-de-municipio.md.
  const ente = await enteDoContexto(
    prisma,
    "É da configuração do ente que sai o tribunal de jurisdição (`tribunalCodigo`), e " +
      "sem ele não há a quem exportar. (A MSC e o MANAD param pelo mesmo motivo.)"
  );
  // `resolverTribunal` lança TRIBUNAL_NAO_SUPORTADO quando o código não tem adapter — o que é
  // exatamente o que deve acontecer: exportar para um tribunal que este binário não implementa
  // produziria um arquivo que ninguém pode receber.
  return resolverTribunal(ente.tribunalCodigo);
}

export interface PreviewArquivo {
  readonly nome: string;
  readonly entidade: string;
  readonly periodicidade: string;
  readonly registros: number;
  readonly largura: number;
  /** As linhas do arquivo (sem o CRLF), para a prévia monoespaçada. */
  readonly linhas: readonly string[];
}

export interface PreviewSagres {
  readonly codUnidadeGestora: string;
  readonly competenciaDiaria: string;
  readonly competenciaMensal: string;
  readonly arquivos: readonly PreviewArquivo[];
  readonly violacoes: readonly Violacao[];
  readonly manifesto: Manifesto;
  /** Régua de posições (2 linhas) para alinhar a prévia — dezenas e unidades. */
  readonly regua: { readonly dezenas: string; readonly unidades: string };
}

export interface ParamsSagres {
  readonly codUnidadeGestora: string;
  readonly cnpjGerenciadora: string;
  /** O dia de referência: sua data compõe o pacote DIÁRIO (empenho, liquidação, pagamento, ...). */
  readonly dia: Date;
  /**
   * O MÊS de referência do pacote MENSAL (Dotacao §4.4 e SaldoMensal §4.26) — qualquer data DENTRO
   * do mês desejado serve; a porta normaliza para o último dia dele.
   *
   * ⚠️ POR QUE SEPARADO DO `dia`. O diário e o mensal são periodicidades DIFERENTES do mesmo layout:
   * o TCE recebe um arquivo por dia e outro por mês, e não há razão contábil para que quem pede o
   * movimento de 14/09 esteja obrigado a receber o saldo de setembro. Amarrar os dois (o que esta
   * porta fazia) escondia essa liberdade da tela e impedia a Comissão de escolher "este dia, aquele
   * mês". Opcional para não quebrar chamador algum: ausente, cai no mês do próprio `dia` — que é
   * exatamente o comportamento anterior, byte a byte.
   */
  readonly mes?: Date;
  /**
   * Conta ARRECADADORA da UG (código) — PARÂMETRO de exportação da ReceitaOrcamentaria: o modelo não
   * amarra receita a conta ("a receita é do ENTE", art. 167), então a conta é uma designação da UG.
   */
  readonly codContaArrecadadora: string;
  /**
   * Fonte de recurso da DESPESA EXTRA (§4.20) — PARÂMETRO de exportação: o layout exige uma das
   * fontes STN de movimentação extraorçamentária (860/861/862/869), dimensão que o `FonteRecurso`
   * do modelo (500, orçamentária) não representa. Mesmo tratamento de `codContaArrecadadora`.
   */
  readonly codFonteRecursoExtra: string;
}

/**
 * A COMPETÊNCIA CANÔNICA DO MENSAL — o ÚLTIMO DIA do mês pedido. Não é capricho de formatação: o
 * `lerFatosSaldoMensal` soma o extrato ATÉ o fim do mês, então o último dia é a única data que
 * nomeia o mês inteiro sem ambiguidade. É a mesma convenção do `scripts/poc-contingencia.ts` — se a
 * tela e a contingência normalizassem diferente, o mesmo mês produziria dois pacotes distintos.
 *
 * O nome do arquivo mensal usa só mm+aaaa (ver `nomeArquivo`), logo esta normalização NÃO muda o
 * nome nem o conteúdo de nenhum pacote já aceito — só torna a competência explícita.
 */
/**
 * ⚠️ A NORMALIZAÇÃO ERA EM UTC, e este é o lugar onde isso decide o CONTEÚDO da remessa:
 * o último dia do mês em Greenwich cai às 21:00 do penúltimo dia no ente durante o horário
 * de verão, e o pacote mensal perderia o último dia inteiro. A competência que o tribunal
 * espera é a do CALENDÁRIO DO ENTE.
 */
function competenciaMensalDe(p: ParamsSagres): Date {
  const base = p.mes ?? p.dia;
  return janelaCivilDoMes(competenciaCivil(base)).fim;
}

function reguaDe(largura: number): { dezenas: string; unidades: string } {
  let dezenas = "";
  let unidades = "";
  for (let i = 1; i <= largura; i++) {
    unidades += String(i % 10);
    dezenas += i % 10 === 0 ? String(Math.floor(i / 10) % 10) : " ";
  }
  return { dezenas, unidades };
}

/** Quebra o Buffer do arquivo em linhas (sem o CRLF) para a prévia. */
function linhasDe(arq: ArquivoGerado): string[] {
  const texto = arq.conteudo.toString("utf8");
  if (texto === "") return [];
  return texto.split("\r\n").filter((l) => l.length > 0);
}

/**
 * MONTA A PRÉVIA + AS VALIDAÇÕES do pacote SAGRES para a competência do `dia`. Lê o banco uma vez
 * (via `lerFatos*`), valida os fatos, e serializa os arquivos. Nada é transmitido.
 */
export async function montarPreviewSagres(p: ParamsSagres): Promise<PreviewSagres> {
  await exigirSessao();
  const prisma = cliente();
  const tribunal = await tribunalDoEnte(prisma);
  // O MENSAL tem competência própria (§4.4 e §4.26); o exercício da Dotacao é o do MÊS pedido, não o
  // do dia — quem pede o dia 31/12 e o mês 01 de outro ano precisa das duas coisas certas.
  const mesRef = competenciaMensalDe(p);
  const exercicio = anoCivil(mesRef);

  // (1) LER OS FATOS (uma vez) — para validar antes de serializar.
  const [dotacao, empenhos, liquidacoes, pagamentos, receitas, cadastro, saldos, movimentacoes, retencoes, despesasExtra] = await Promise.all([
    lerFatosDotacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, exercicio }),
    lerFatosEmpenhos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosPagamentos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    lerFatosReceitaOrcamentaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codContaArrecadadora: p.codContaArrecadadora, dia: p.dia }),
    lerFatosCadastroConta(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora }),
    lerFatosSaldoMensal(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef }),
    lerFatosMovimentacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codFonteRecursoExtra: p.codFonteRecursoExtra, dia: p.dia }),
  ]);

  // (2) VALIDAR — obrigatoriedade (por layout) + domínio (Empenhos) + integridade referencial.
  const violacoes: Violacao[] = [
    ...validarObrigatorios(LAYOUT_DOTACAO, dotacao),
    ...validarObrigatorios(LAYOUT_EMPENHOS, empenhos),
    ...validarObrigatorios(LAYOUT_LIQUIDACAO, liquidacoes),
    ...validarObrigatorios(LAYOUT_PAGAMENTOS, pagamentos),
    ...validarObrigatorios(LAYOUT_RECEITA_ORCAMENTARIA, receitas),
    ...validarObrigatorios(LAYOUT_CADASTRO_CONTA, cadastro),
    ...validarObrigatorios(LAYOUT_SALDO_MENSAL, saldos),
    ...validarObrigatorios(LAYOUT_MOVIMENTACAO, movimentacoes),
    ...validarObrigatorios(LAYOUT_RETENCAO, retencoes),
    ...validarObrigatorios(LAYOUT_DESPESA_EXTRA, despesasExtra),
    ...validarDominioEmpenhos(empenhos),
    ...validarLiquidacaoReferenciaEmpenho(empenhos, liquidacoes),
  ];

  // (3) SERIALIZAR os arquivos + montar o pacote/manifesto.
  const [aDotacao, aEmpenhos, aLiquidacao, aPagamentos, aReceita, aCadastro, aSaldo, aMovimentacao, aRetencao, aDespesaExtra] = await Promise.all([
    gerarDotacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, exercicio, competencia: mesRef }),
    gerarEmpenhos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarPagamentos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    gerarReceitaOrcamentaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codContaArrecadadora: p.codContaArrecadadora, dia: p.dia }),
    gerarCadastroContaBancaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    gerarSaldoMensal(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef }),
    gerarMovimentacaoEntreContas(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codFonteRecursoExtra: p.codFonteRecursoExtra, dia: p.dia }),
  ]);
  const arquivosGerados = [aDotacao, aEmpenhos, aLiquidacao, aPagamentos, aReceita, aCadastro, aSaldo, aMovimentacao, aRetencao, aDespesaExtra];

  // ⚠️ AS COMPETÊNCIAS SÃO CIVIS. Um pacote pedido para 10/07 tem de conter os fatos do
  // 10/07 DO ENTE — e o nome do arquivo tem de dizer o mesmo dia que o conteúdo.
  const competenciaDiaria = diaCivil(p.dia);
  const competenciaMensal = competenciaCivil(mesRef);

  const { manifesto } = montarPacote(
    { layout: tribunal.layoutVersao, periodicidade: "PACOTE", competencia: competenciaDiaria, codUnidadeGestora: p.codUnidadeGestora },
    arquivosGerados
  );

  const meta = [
    { g: aDotacao, l: LAYOUT_DOTACAO },
    { g: aEmpenhos, l: LAYOUT_EMPENHOS },
    { g: aLiquidacao, l: LAYOUT_LIQUIDACAO },
    { g: aPagamentos, l: LAYOUT_PAGAMENTOS },
    { g: aReceita, l: LAYOUT_RECEITA_ORCAMENTARIA },
    { g: aCadastro, l: LAYOUT_CADASTRO_CONTA },
    { g: aSaldo, l: LAYOUT_SALDO_MENSAL },
    { g: aMovimentacao, l: LAYOUT_MOVIMENTACAO },
    { g: aRetencao, l: LAYOUT_RETENCAO },
    { g: aDespesaExtra, l: LAYOUT_DESPESA_EXTRA },
  ];
  const larguraMax = Math.max(...meta.map((m) => m.l.campos.reduce((mx, c) => Math.max(mx, c.posFinal), 0)));

  return {
    codUnidadeGestora: p.codUnidadeGestora,
    competenciaDiaria,
    competenciaMensal,
    arquivos: meta.map((m) => ({
      nome: m.g.nome,
      entidade: m.l.entidade,
      periodicidade: m.l.periodicidade,
      registros: m.g.registros,
      largura: m.l.campos.reduce((mx, c) => Math.max(mx, c.posFinal), 0),
      linhas: linhasDe(m.g),
    })),
    violacoes,
    manifesto,
    regua: reguaDe(larguraMax),
  };
}

export interface PacoteParaDownload {
  readonly nome: string;
  readonly zip: Buffer;
  readonly hashPacote: string;
}

/** Monta o ZIP do pacote para download (os 10 .txt + manifesto.json). Determinístico. */
export async function baixarPacoteSagres(p: ParamsSagres): Promise<PacoteParaDownload> {
  await exigirSessao();
  const prisma = cliente();
  const tribunal = await tribunalDoEnte(prisma);
  // Mesma normalização da prévia — o ZIP baixado TEM de ser o que a tela mostrou.
  const mesRef = competenciaMensalDe(p);
  const exercicio = anoCivil(mesRef);
  const arquivos = await Promise.all([
    gerarDotacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, exercicio, competencia: mesRef }),
    gerarEmpenhos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarPagamentos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    gerarReceitaOrcamentaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codContaArrecadadora: p.codContaArrecadadora, dia: p.dia }),
    gerarCadastroContaBancaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    gerarSaldoMensal(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef }),
    gerarMovimentacaoEntreContas(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codFonteRecursoExtra: p.codFonteRecursoExtra, dia: p.dia }),
  ]);

  const pacote = montarPacote(
    { layout: tribunal.layoutVersao, periodicidade: "PACOTE", competencia: diaCivil(p.dia), codUnidadeGestora: p.codUnidadeGestora },
    arquivos
  );
  return { nome: pacote.nome, zip: pacote.zip, hashPacote: pacote.manifesto.hashPacote };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * PERÍODOS COM MOVIMENTO — DESCOBERTOS DO BANCO
 * ──────────────────────────────────────────────────────────────────────────────────────────────*/

/** Quantos fatos exportáveis existem num período, por origem. Serve para a tela ROTULAR o atalho. */
export interface ResumoMovimento {
  readonly empenhos: number;
  readonly liquidacoes: number;
  readonly pagamentos: number;
  readonly receitas: number;
  readonly transferencias: number;
  /** Retenções: ingresso extraorçamentário AMARRADO a um pagamento (§4.14). */
  readonly retencoes: number;
  /** Despesa extra: dispêndio extraorçamentário — o recolhimento da consignação (§4.20). */
  readonly despesasExtra: number;
  /** A soma de todos os acima — 0 significa "dia/mês sem movimento", e a tela precisa dizer isso. */
  readonly total: number;
}

export interface DiaComMovimento {
  /** aaaa-mm-dd (UTC — a mesma base de data em que os exporters filtram). */
  readonly dia: string;
  readonly resumo: ResumoMovimento;
  /** Uma linha pronta para o botão de atalho: "2 empenhos · 1 liquidação". */
  readonly rotulo: string;
}

export interface MesComMovimento {
  /** aaaa-mm. */
  readonly mes: string;
  readonly resumo: ResumoMovimento;
  /** Quantos dias distintos daquele mês têm movimento. */
  readonly diasComMovimento: number;
  readonly rotulo: string;
}

export interface PeriodosComMovimento {
  readonly dias: readonly DiaComMovimento[];
  readonly meses: readonly MesComMovimento[];
  /** Os exercícios que têm ficha orçamentária — o que a Dotacao (§4.4, mensal) consegue exportar. */
  readonly exercicios: readonly number[];
}

/** Acumulador mutável interno — o público é o `ResumoMovimento` (readonly). */
interface Contagem {
  empenhos: number;
  liquidacoes: number;
  pagamentos: number;
  receitas: number;
  transferencias: number;
  retencoes: number;
  despesasExtra: number;
}

function contagemZero(): Contagem {
  return { empenhos: 0, liquidacoes: 0, pagamentos: 0, receitas: 0, transferencias: 0, retencoes: 0, despesasExtra: 0 };
}

function somar(alvo: Contagem, parcela: Contagem): void {
  alvo.empenhos += parcela.empenhos;
  alvo.liquidacoes += parcela.liquidacoes;
  alvo.pagamentos += parcela.pagamentos;
  alvo.receitas += parcela.receitas;
  alvo.transferencias += parcela.transferencias;
  alvo.retencoes += parcela.retencoes;
  alvo.despesasExtra += parcela.despesasExtra;
}

function fecharResumo(c: Contagem): ResumoMovimento {
  return {
    ...c,
    total: c.empenhos + c.liquidacoes + c.pagamentos + c.receitas + c.transferencias + c.retencoes + c.despesasExtra,
  };
}

/**
 * O rótulo humano do período. Só lista o que EXISTE — "0 empenhos" é ruído para quem só quer saber
 * onde clicar. Período sem nada devolve a frase inteira, porque um atalho mudo mentiria por omissão.
 */
function rotularResumo(r: ResumoMovimento): string {
  const partes: string[] = [];
  const por = (n: number, singular: string, plural: string): void => {
    if (n > 0) partes.push(`${n} ${n === 1 ? singular : plural}`);
  };
  por(r.empenhos, "empenho", "empenhos");
  por(r.liquidacoes, "liquidação", "liquidações");
  por(r.pagamentos, "pagamento", "pagamentos");
  por(r.receitas, "receita", "receitas");
  por(r.transferencias, "transferência", "transferências");
  por(r.retencoes, "retenção", "retenções");
  por(r.despesasExtra, "despesa extra", "despesas extra");
  return partes.length === 0 ? "sem movimento" : partes.join(" · ");
}

/** aaaa-mm-dd em UTC — a mesma normalização do `scripts/poc-contingencia.ts`. */
function isoDia(d: Date): string {
  return diaCivil(d);
}

/**
 * OS DIAS E MESES QUE TÊM FATO EXPORTÁVEL — DESCOBERTOS DO BANCO, nunca de uma lista escrita à mão.
 *
 * ⚠️ POR QUE ISTO EXISTE. A tela tinha uma constante com seis dias fixos. Uma lista fixa é uma
 * afirmação sobre a base que ninguém revalida: a massa cresceu (julho, agosto E setembro) e a lista
 * ficou para trás, oferecendo à Comissão um recorte que já não era o da base. Descobrir do banco
 * torna a afirmação verdadeira por construção — se a massa mudar, a tela acompanha sozinha.
 *
 * ⚠️ AS FONTES SÃO EXATAMENTE AS DO `scripts/poc-contingencia.ts` (`periodosComMovimento`), de
 * propósito: a contingência gera os pacotes em lote e a tela os gera ao vivo. Se as duas discordarem
 * sobre "que dias têm movimento", uma das duas está mentindo para o TCE — e não haveria como saber
 * qual. Mesma união, mesmos filtros:
 *   · empenho.data                       → Empenhos §4.8
 *   · liquidacao.data                    → Liquidacao §4.10
 *   · pagamento.data, EXCLUINDO estorno e anulação parcial (o mesmo filtro do exporter: estornar
 *     não é pagar, e contá-lo aqui prometeria linha em arquivo que sai vazio)
 *   · receitaArrecadada.dataArrecadacao  → ReceitaOrcamentaria §4.16
 *   · transferenciaEntreContas.data      → MovimentacaoEntreContas §4.59
 *   · movimentoExtraorcamentario INGRESSO COM pagamentoId → Retencao §4.14 (sem pagamento amarrado
 *     não é retenção exportável)
 *   · movimentoExtraorcamentario DISPENDIO → DespesaExtra §4.20
 *
 * ⚠️ O QUE ESTA FUNÇÃO NÃO DIZ. Ela não diz que os demais dias são inválidos. CadastroContaBancaria
 * (§4.23, diário) e os arquivos MENSAIS não dependem do dia e saem preenchidos em qualquer data. Um
 * dia fora desta lista é um dia legítimo cujos arquivos de FATO saem com 0 registro — vazios, não
 * omitidos. A tela precisa dizer isso com todas as letras, e por isso a lista é atalho, não filtro.
 */
export async function lerPeriodosComMovimento(): Promise<PeriodosComMovimento> {
  await exigirSessao();
  return periodosComMovimentoDe(cliente());
}

/**
 * A CONSULTA PURA, recebendo o client — mesma forma dos `lerFatos*` do M15. Separada de
 * `lerPeriodosComMovimento` (que é a porta: sessão + client singleton) porque assim ela é
 * EXERCITÁVEL fora de um request HTTP — por teste ou por script de conferência. `exigirSessao` lê
 * cookies/headers do Next, que não existem fora do servidor; sem esta separação a única maneira de
 * conferir o resultado contra o banco seria reescrever a consulta em outro lugar, que é exatamente
 * o erro (duas verdades sobre a mesma massa) que esta função foi criada para eliminar.
 */
export async function periodosComMovimentoDe(prisma: ReturnType<typeof cliente>): Promise<PeriodosComMovimento> {
  const [empenhos, liquidacoes, pagamentos, receitas, transferencias, retencoes, despesasExtra, fichas] = await Promise.all([
    prisma.empenho.findMany({ select: { data: true } }),
    prisma.liquidacao.findMany({ select: { data: true } }),
    // Estorno e anulação parcial NÃO são pagamento — mesmo filtro de `lerFatosPagamentos`.
    prisma.pagamento.findMany({ where: { estornoDeId: null, anulacaoParcialDeId: null }, select: { data: true } }),
    prisma.receitaArrecadada.findMany({ select: { dataArrecadacao: true } }),
    prisma.transferenciaEntreContas.findMany({ select: { data: true } }),
    prisma.movimentoExtraorcamentario.findMany({ where: { tipo: "INGRESSO", pagamentoId: { not: null } }, select: { data: true } }),
    prisma.movimentoExtraorcamentario.findMany({ where: { tipo: "DISPENDIO" }, select: { data: true } }),
    prisma.fichaOrcamentaria.findMany({ select: { exercicio: true }, distinct: ["exercicio"] }),
  ]);

  const porDia = new Map<string, Contagem>();
  const acumular = (datas: readonly Date[], campo: keyof Contagem): void => {
    for (const d of datas) {
      const chave = isoDia(d);
      let c = porDia.get(chave);
      if (c === undefined) {
        c = contagemZero();
        porDia.set(chave, c);
      }
      c[campo] += 1;
    }
  };

  acumular(empenhos.map((l) => l.data), "empenhos");
  acumular(liquidacoes.map((l) => l.data), "liquidacoes");
  acumular(pagamentos.map((l) => l.data), "pagamentos");
  acumular(receitas.map((l) => l.dataArrecadacao), "receitas");
  acumular(transferencias.map((l) => l.data), "transferencias");
  acumular(retencoes.map((l) => l.data), "retencoes");
  acumular(despesasExtra.map((l) => l.data), "despesasExtra");

  // Ordem cronológica: a Comissão lê a massa como uma linha do tempo, não como um Map.
  const chavesOrdenadas = [...porDia.keys()].sort();
  const dias: DiaComMovimento[] = chavesOrdenadas.map((dia) => {
    const resumo = fecharResumo(porDia.get(dia) as Contagem);
    return { dia, resumo, rotulo: rotularResumo(resumo) };
  });

  // O MÊS é a soma dos seus dias — derivado, nunca contado de novo. Contar duas vezes seria abrir a
  // porta para o mensal e o diário discordarem sobre a mesma massa.
  const porMes = new Map<string, { c: Contagem; dias: number }>();
  for (const d of dias) {
    const mes = d.dia.slice(0, 7);
    let acc = porMes.get(mes);
    if (acc === undefined) {
      acc = { c: contagemZero(), dias: 0 };
      porMes.set(mes, acc);
    }
    somar(acc.c, porDia.get(d.dia) as Contagem);
    acc.dias += 1;
  }
  const meses: MesComMovimento[] = [...porMes.keys()].sort().map((mes) => {
    const acc = porMes.get(mes) as { c: Contagem; dias: number };
    const resumo = fecharResumo(acc.c);
    return { mes, resumo, diasComMovimento: acc.dias, rotulo: rotularResumo(resumo) };
  });

  return { dias, meses, exercicios: [...new Set(fichas.map((f) => f.exercicio))].sort((a, b) => a - b) };
}
