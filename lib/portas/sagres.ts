import { cliente, PortaSemBancoError } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import {
  gerarCadastroContaBancaria,
  gerarDespesaExtra,
  gerarDotacao,
  gerarEmpenhos,
  gerarLiquidacao,
  gerarMovimentacaoEntreContas,
  gerarPagamentos,
  gerarEstornoPagamento,
  gerarEstornos,
  gerarEstornoLiquidacao,
  gerarEstornoRetencao,
  gerarArquivosDeRestos,
  gerarArquivosDeRelacionamentos,
  gerarArquivosDaV26,
  gerarArquivosDaFrotaEFarmacia,
  gerarEstornoDespesaExtra,
  gerarReceitaExtraOuRecusa,
  gerarEstornoReceitaExtraOuRecusa,
  planoVigenteDoTribunal,
  importarPlanoDoTribunal,
  gerarConciliacaoBancariaOuRecusa,
  gerarUnidadeOrcamentariaOuRecusa,
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
  lerFatosEstornoPagamento,
  lerFatosEstornos,
  lerFatosEstornoLiquidacao,
  lerFatosEstornoRetencao,
  lerFatosEstornoDespesaExtra,
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
  LAYOUT_ESTORNO_PAGAMENTO,
  LAYOUT_ESTORNOS,
  LAYOUT_ESTORNO_LIQUIDACAO,
  LAYOUT_ESTORNO_RETENCAO,
  LAYOUT_ESTORNO_DESPESA_EXTRA,
  LAYOUT_RECEITA_EXTRA,
  LAYOUT_ESTORNO_RECEITA_EXTRA,
  LAYOUT_CONCILIACAO_BANCARIA,
  LAYOUT_UNIDADE_ORCAMENTARIA,
  LAYOUT_RECEITA_ORCAMENTARIA,
  LAYOUT_RETENCAO,
  LAYOUT_SALDO_MENSAL,
  competenciaDoLeiaute,
  type ArquivoGerado,
  type Manifesto,
  type Violacao,
} from "../../adapters/tribunais/tce-pb/sagres";
import type { LayoutArquivo } from "../../adapters/tribunais/tce-pb/sagres/registry";
import { resolverTribunal, type ExportadorTribunal } from "../../packages/tribunais-core";
import { enteDoContexto } from "../../modules/m01-core-contabil/contexto-do-ente";
import { anoCivil, competenciaCivil, diaCivil } from "../../packages/datas/index";
import { unidadesGestorasOperadas } from "../../modules/m01-core-contabil/unidade-gestora";

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
  // O MÊS é o do calendário do ente; a ÂNCORA é a do leiaute (ver `competenciaDoLeiaute`). O último
  // instante civil do mês já é o mês seguinte em UTC, e o gerador lê o mês em UTC.
  return competenciaDoLeiaute(competenciaCivil(base));
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
  await exigirLeituraDoEnte("CONSULTAR_INTEGRACOES");
  const prisma = cliente();
  const tribunal = await tribunalDoEnte(prisma);
  // O MENSAL tem competência própria (§4.4 e §4.26); o exercício da Dotacao é o do MÊS pedido, não o
  // do dia — quem pede o dia 31/12 e o mês 01 de outro ano precisa das duas coisas certas.
  const mesRef = competenciaMensalDe(p);
  const exercicio = anoCivil(mesRef);

  // (1) LER OS FATOS (uma vez) — para validar antes de serializar.
  const [dotacao, empenhos, liquidacoes, pagamentos, estornosDePagamento, estornosDeEmpenho, estornosDeLiquidacao, estornosDeRetencao, estornosDeDespesaExtra, receitas, cadastro, saldos, movimentacoes, retencoes, despesasExtra] = await Promise.all([
    lerFatosDotacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, exercicio }),
    lerFatosEmpenhos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosPagamentos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    lerFatosEstornoPagamento(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosEstornos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosEstornoLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosEstornoRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosEstornoDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosReceitaOrcamentaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codContaArrecadadora: p.codContaArrecadadora, dia: p.dia }),
    lerFatosCadastroConta(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora }),
    lerFatosSaldoMensal(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef }),
    lerFatosMovimentacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    lerFatosDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codFonteRecursoExtra: p.codFonteRecursoExtra, dia: p.dia }),
  ]);

  // V21 — a CONCILIAÇÃO (§4.27): o arquivo, ou a recusa nomeada. Ver `gerarConciliacaoBancariaOuRecusa`.
  const conciliacao = await gerarConciliacaoBancariaOuRecusa(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef });
  // V21 — a UNIDADE ORÇAMENTÁRIA (§4.1), no mesmo regime: o arquivo, ou a recusa nomeada.
  const unidades = await gerarUnidadeOrcamentariaOuRecusa(prisma, { codUnidadeGestora: p.codUnidadeGestora, competencia: mesRef });
  // V23 — a RECEITA EXTRA (§4.19) e o estorno dela (§4.21), no mesmo regime.
  const receitaExtra = await gerarReceitaExtraOuRecusa(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codFonteRecursoExtra: p.codFonteRecursoExtra, dia: p.dia });
  const estornoReceitaExtra = await gerarEstornoReceitaExtraOuRecusa(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia });
  const semPlano = despesasExtra.length > 0 && (await planoVigenteDoTribunal(prisma, anoCivil(p.dia))) === null;
  // V24 — o grupo dos restos a pagar (§4.28 a §4.34; §4.40 em dezembro), com a recusa nomeada quando houver.
  const restos = await gerarArquivosDeRestos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia, competencia: mesRef });
  // V25 — fornecedores e os relacionamentos (§4.24, §4.35 diários; §4.37, §4.46, §4.58 do mês), no mesmo regime.
  const relacionamentos = await gerarArquivosDeRelacionamentos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia, competencia: mesRef });
  // V26 — o cadastro que dependia de decisão (programas, ações, ordenador, licitação no Tramita; em janeiro, o responsável
  // pelo sistema, a receita prevista e o saldo inicial), no mesmo regime: o arquivo, ou a recusa nomeada.
  const v26 = await gerarArquivosDaV26(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia, competencia: mesRef });
  // V27 — frota e farmácia pública (§4.50 a §4.57), do mês, no mesmo regime.
  const frota = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef });

  // (2) VALIDAR — obrigatoriedade (por layout) + domínio (Empenhos) + integridade referencial.
  const violacoes: Violacao[] = [
    ...restos.recusas.map((r) => ({ arquivo: r.arquivo, linha: 0, campo: "movimento", regra: "RESTOS_FORA_DO_PACOTE" as const, detalhe: `${r.detalhe} O arquivo fica FORA do pacote.` })),
    ...relacionamentos.recusas.map((r) => ({ arquivo: r.arquivo, linha: 0, campo: "cadastro", regra: "RELACIONAMENTO_FORA_DO_PACOTE" as const, detalhe: `${r.detalhe} O arquivo fica FORA do pacote.` })),
    ...v26.recusas.map((r) => ({ arquivo: r.arquivo, linha: 0, campo: "cadastro", regra: "CADASTRO_FORA_DO_PACOTE" as const, detalhe: `${r.detalhe} O arquivo fica FORA do pacote.` })),
    ...frota.recusas.map((r) => ({ arquivo: r.arquivo, linha: 0, campo: "cadastro", regra: "CADASTRO_FORA_DO_PACOTE" as const, detalhe: `${r.detalhe} O arquivo fica FORA do pacote.` })),
    ...("recusa" in unidades
      ? [{ arquivo: "UnidadeOrcamentaria", linha: 0, campo: "unidade", regra: "DADOS_DA_UNIDADE_AUSENTES" as const, detalhe: `${unidades.recusa} O arquivo das unidades fica FORA do pacote até a declaração.` }]
      : validarObrigatorios(LAYOUT_UNIDADE_ORCAMENTARIA, unidades.fatos)),
    ...("recusa" in conciliacao
      ? [{ arquivo: "ConciliacaoBancaria", linha: 0, campo: "conta", regra: "CONCILIACAO_NAO_FECHA" as const, detalhe: `${conciliacao.recusa} O arquivo da conciliação fica FORA do pacote até a conta fechar.` }]
      : validarObrigatorios(LAYOUT_CONCILIACAO_BANCARIA, conciliacao.fatos)),
    ...("recusa" in receitaExtra
      ? [{ arquivo: "ReceitaExtra", linha: 0, campo: "ingresso", regra: "RECEITA_EXTRA_FORA_DO_PACOTE" as const, detalhe: `${receitaExtra.recusa} O arquivo da receita extra fica FORA do pacote.` }]
      : validarObrigatorios(LAYOUT_RECEITA_EXTRA, receitaExtra.fatos)),
    ...("recusa" in estornoReceitaExtra
      ? [{ arquivo: "EstornoReceitaExtra", linha: 0, campo: "estorno", regra: "RECEITA_EXTRA_FORA_DO_PACOTE" as const, detalhe: `${estornoReceitaExtra.recusa} O arquivo do estorno da receita extra fica FORA do pacote.` }]
      : validarObrigatorios(LAYOUT_ESTORNO_RECEITA_EXTRA, estornoReceitaExtra.fatos)),
    ...(semPlano
      ? [{ arquivo: "DespesaExtra", linha: 0, campo: "receitaExtra", regra: "PLANO_DO_TRIBUNAL_AUSENTE" as const, detalhe: `O plano de contas do Tribunal para ${String(anoCivil(p.dia))} não foi importado: o vínculo da despesa extra com a receita extra saiu em branco sem ser conferido.` }]
      : []),
    ...validarObrigatorios(LAYOUT_DOTACAO, dotacao),
    ...validarObrigatorios(LAYOUT_EMPENHOS, empenhos),
    ...validarObrigatorios(LAYOUT_LIQUIDACAO, liquidacoes),
    ...validarObrigatorios(LAYOUT_PAGAMENTOS, pagamentos),
    ...validarObrigatorios(LAYOUT_ESTORNO_PAGAMENTO, estornosDePagamento),
    ...validarObrigatorios(LAYOUT_ESTORNOS, estornosDeEmpenho),
    ...validarObrigatorios(LAYOUT_ESTORNO_LIQUIDACAO, estornosDeLiquidacao),
    ...validarObrigatorios(LAYOUT_ESTORNO_RETENCAO, estornosDeRetencao),
    ...validarObrigatorios(LAYOUT_ESTORNO_DESPESA_EXTRA, estornosDeDespesaExtra),
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
  const [aDotacao, aEmpenhos, aLiquidacao, aPagamentos, aEstornoPagamento, aEstornos, aEstornoLiquidacao, aEstornoRetencao, aEstornoDespesaExtra, aReceita, aCadastro, aSaldo, aMovimentacao, aRetencao, aDespesaExtra] = await Promise.all([
    gerarDotacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, exercicio, competencia: mesRef }),
    gerarEmpenhos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarPagamentos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    gerarEstornoPagamento(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarEstornos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarEstornoLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarEstornoRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarEstornoDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarReceitaOrcamentaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codContaArrecadadora: p.codContaArrecadadora, dia: p.dia }),
    gerarCadastroContaBancaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    gerarSaldoMensal(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef }),
    gerarMovimentacaoEntreContas(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codFonteRecursoExtra: p.codFonteRecursoExtra, dia: p.dia }),
  ]);
  const arquivosGerados = [aDotacao, aEmpenhos, aLiquidacao, aPagamentos, aEstornoPagamento, aEstornos, aEstornoLiquidacao, aEstornoRetencao, aEstornoDespesaExtra, aReceita, aCadastro, aSaldo, aMovimentacao, aRetencao, aDespesaExtra, ...("arquivo" in conciliacao ? [conciliacao.arquivo] : []), ...("arquivo" in unidades ? [unidades.arquivo] : []), ...("arquivo" in receitaExtra ? [receitaExtra.arquivo] : []), ...("arquivo" in estornoReceitaExtra ? [estornoReceitaExtra.arquivo] : []), ...restos.arquivos.map((r) => r.arquivo), ...relacionamentos.arquivos.map((r) => r.arquivo)];

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
    { g: aEstornoPagamento, l: LAYOUT_ESTORNO_PAGAMENTO },
    { g: aEstornos, l: LAYOUT_ESTORNOS },
    { g: aEstornoLiquidacao, l: LAYOUT_ESTORNO_LIQUIDACAO },
    { g: aEstornoRetencao, l: LAYOUT_ESTORNO_RETENCAO },
    { g: aEstornoDespesaExtra, l: LAYOUT_ESTORNO_DESPESA_EXTRA },
    ...("arquivo" in conciliacao ? [{ g: conciliacao.arquivo, l: LAYOUT_CONCILIACAO_BANCARIA }] : []),
    ...("arquivo" in unidades ? [{ g: unidades.arquivo, l: LAYOUT_UNIDADE_ORCAMENTARIA }] : []),
    ...("arquivo" in receitaExtra ? [{ g: receitaExtra.arquivo, l: LAYOUT_RECEITA_EXTRA }] : []),
    ...("arquivo" in estornoReceitaExtra ? [{ g: estornoReceitaExtra.arquivo, l: LAYOUT_ESTORNO_RECEITA_EXTRA }] : []),
    { g: aReceita, l: LAYOUT_RECEITA_ORCAMENTARIA },
    { g: aCadastro, l: LAYOUT_CADASTRO_CONTA },
    { g: aSaldo, l: LAYOUT_SALDO_MENSAL },
    { g: aMovimentacao, l: LAYOUT_MOVIMENTACAO },
    { g: aRetencao, l: LAYOUT_RETENCAO },
    { g: aDespesaExtra, l: LAYOUT_DESPESA_EXTRA },
    ...restos.arquivos.map((r) => ({ g: r.arquivo, l: r.layout as LayoutArquivo<unknown> })),
    ...relacionamentos.arquivos.map((r) => ({ g: r.arquivo, l: r.layout as LayoutArquivo<unknown> })),
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

/** Monta o ZIP do pacote para download (os .txt + manifesto.json). Determinístico. */
export async function baixarPacoteSagres(p: ParamsSagres): Promise<PacoteParaDownload> {
  await exigirLeituraDoEnte("CONSULTAR_INTEGRACOES");
  const prisma = cliente();
  const tribunal = await tribunalDoEnte(prisma);
  // Mesma normalização da prévia — o ZIP baixado TEM de ser o que a tela mostrou.
  const mesRef = competenciaMensalDe(p);
  const exercicio = anoCivil(mesRef);
  const arquivos: ArquivoGerado[] = await Promise.all([
    gerarDotacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, exercicio, competencia: mesRef }),
    gerarEmpenhos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarPagamentos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    gerarEstornoPagamento(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarEstornos(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarEstornoLiquidacao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarEstornoRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarEstornoDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarReceitaOrcamentaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codContaArrecadadora: p.codContaArrecadadora, dia: p.dia }),
    gerarCadastroContaBancaria(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia }),
    gerarSaldoMensal(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef }),
    gerarMovimentacaoEntreContas(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarRetencao(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia }),
    gerarDespesaExtra(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codFonteRecursoExtra: p.codFonteRecursoExtra, dia: p.dia }),
  ]);
  // V21 — a conciliação entra quando fecha; quando não, a prévia já disse por quê.
  const conciliacao = await gerarConciliacaoBancariaOuRecusa(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef });
  if ("arquivo" in conciliacao) arquivos.push(conciliacao.arquivo);
  const unidades = await gerarUnidadeOrcamentariaOuRecusa(prisma, { codUnidadeGestora: p.codUnidadeGestora, competencia: mesRef });
  if ("arquivo" in unidades) arquivos.push(unidades.arquivo);
  const receitaExtra = await gerarReceitaExtraOuRecusa(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, codFonteRecursoExtra: p.codFonteRecursoExtra, dia: p.dia });
  if ("arquivo" in receitaExtra) arquivos.push(receitaExtra.arquivo);
  const estornoReceitaExtra = await gerarEstornoReceitaExtraOuRecusa(prisma, { codUnidadeGestora: p.codUnidadeGestora, dia: p.dia });
  if ("arquivo" in estornoReceitaExtra) arquivos.push(estornoReceitaExtra.arquivo);
  // V24 — o grupo dos restos: os mesmos arquivos da prévia (a recusa nomeada fica fora, como lá).
  const restos = await gerarArquivosDeRestos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia, competencia: mesRef });
  arquivos.push(...restos.arquivos.map((r) => r.arquivo));
  // V25 — fornecedores e relacionamentos: os mesmos da prévia (a recusa nomeada fica fora, como lá).
  const relacionamentos = await gerarArquivosDeRelacionamentos(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia, competencia: mesRef });
  arquivos.push(...relacionamentos.arquivos.map((r) => r.arquivo));
  // V26 — o mesmo grupo da prévia (a recusa nomeada fica fora, como lá).
  const v26 = await gerarArquivosDaV26(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, dia: p.dia, competencia: mesRef });
  arquivos.push(...v26.arquivos.map((r) => r.arquivo));
  // V27 — frota e farmácia: os mesmos da prévia.
  const frota = await gerarArquivosDaFrotaEFarmacia(prisma, { codUnidadeGestora: p.codUnidadeGestora, cnpjGerenciadora: p.cnpjGerenciadora, competencia: mesRef });
  arquivos.push(...frota.arquivos.map((r) => r.arquivo));

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
  /** V23 — anulações de empenho, liquidação e pagamento, e estornos extraorçamentários (§4.9, §4.11, §4.13, §4.15, §4.21, §4.22). */
  readonly estornos: number;
  /** V23 — ingresso extraorçamentário AVULSO (caução, depósito): ReceitaExtra §4.19. A retenção já conta em `retencoes`. */
  readonly receitasExtra: number;
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
  estornos: number;
  receitasExtra: number;
}

function contagemZero(): Contagem {
  return { empenhos: 0, liquidacoes: 0, pagamentos: 0, receitas: 0, transferencias: 0, retencoes: 0, despesasExtra: 0, estornos: 0, receitasExtra: 0 };
}

function somar(alvo: Contagem, parcela: Contagem): void {
  alvo.empenhos += parcela.empenhos;
  alvo.liquidacoes += parcela.liquidacoes;
  alvo.pagamentos += parcela.pagamentos;
  alvo.receitas += parcela.receitas;
  alvo.transferencias += parcela.transferencias;
  alvo.retencoes += parcela.retencoes;
  alvo.despesasExtra += parcela.despesasExtra;
  alvo.estornos += parcela.estornos;
  alvo.receitasExtra += parcela.receitasExtra;
}

function fecharResumo(c: Contagem): ResumoMovimento {
  return {
    ...c,
    total: c.empenhos + c.liquidacoes + c.pagamentos + c.receitas + c.transferencias + c.retencoes + c.despesasExtra + c.estornos + c.receitasExtra,
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
  por(r.receitasExtra, "receita extra", "receitas extra");
  por(r.estornos, "anulação", "anulações");
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
 *   · empenho.data, só os genuínos       → Empenhos §4.8
 *   · liquidacao.data, só as genuínas    → Liquidacao §4.10
 *   · as anulações de empenho, liquidação e pagamento → Estornos §4.9, EstornoLiquidacao §4.11 e
 *     EstornoPagamento §4.13 (V23: antes a anulação de empenho e de liquidação contava como documento
 *     novo, e a de pagamento não contava)
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
  await exigirLeituraDoEnte("CONSULTAR_INTEGRACOES");
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
  const anulacao = { OR: [{ estornoDeId: { not: null } }, { anulacaoParcialDeId: { not: null } }] };
  const [empenhos, liquidacoes, pagamentos, receitas, transferencias, retencoes, despesasExtra, fichas, anEmp, anLiq, anPag, estExtra, ingressosAvulsos] = await Promise.all([
    prisma.empenho.findMany({ where: { estornoDeId: null, anulacaoParcialDeId: null }, select: { data: true } }),
    prisma.liquidacao.findMany({ where: { estornoDeId: null, anulacaoParcialDeId: null }, select: { data: true } }),
    // Estorno e anulação parcial NÃO são pagamento — mesmo filtro de `lerFatosPagamentos`.
    prisma.pagamento.findMany({ where: { estornoDeId: null, anulacaoParcialDeId: null }, select: { data: true } }),
    prisma.receitaArrecadada.findMany({ select: { dataArrecadacao: true } }),
    prisma.transferenciaEntreContas.findMany({ select: { data: true } }),
    prisma.movimentoExtraorcamentario.findMany({ where: { tipo: "INGRESSO", pagamentoId: { not: null } }, select: { data: true } }),
    prisma.movimentoExtraorcamentario.findMany({ where: { tipo: "DISPENDIO" }, select: { data: true } }),
    prisma.fichaOrcamentaria.findMany({ select: { exercicio: true }, distinct: ["exercicio"] }),
    prisma.empenho.findMany({ where: anulacao, select: { data: true } }),
    prisma.liquidacao.findMany({ where: anulacao, select: { data: true } }),
    prisma.pagamento.findMany({ where: anulacao, select: { data: true } }),
    prisma.movimentoExtraorcamentario.findMany({ where: { OR: [{ tipo: "ESTORNO_INGRESSO" }, { tipo: "ESTORNO_DISPENDIO" }] }, select: { data: true } }),
    prisma.movimentoExtraorcamentario.findMany({ where: { tipo: "INGRESSO", pagamentoId: null }, select: { data: true } }),
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
  acumular([...anEmp, ...anLiq, ...anPag, ...estExtra].map((l) => l.data), "estornos");
  acumular(ingressosAvulsos.map((l) => l.data), "receitasExtra");

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

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * V23 — O PLANO DE CONTAS DO TRIBUNAL (as exigências por conta da receita e da despesa extra)
 * ──────────────────────────────────────────────────────────────────────────────────────────────*/

export interface ResumoDoPlanoDoTribunal {
  readonly exercicio: number;
  readonly vigente: {
    readonly anoDaTabela: number;
    readonly arquivoNome: string;
    readonly arquivoSha256: string;
    readonly fundamento: string;
    readonly criadoEm: Date;
    readonly criadoPor: string;
    readonly contas: number;
    readonly exigemRetencao: number;
    readonly exigemReceitaExtra: number;
  } | null;
}

/** A tabela vigente do exercício, resumida para a tela. Leitura. */
export async function lerPlanoDoTribunal(exercicio: number): Promise<ResumoDoPlanoDoTribunal> {
  await exigirLeituraDoEnte("CONSULTAR_INTEGRACOES");
  const plano = await planoVigenteDoTribunal(cliente(), exercicio);
  if (plano === null) return { exercicio, vigente: null };
  const contas = [...plano.contas.values()];
  return {
    exercicio,
    vigente: {
      anoDaTabela: plano.anoDaTabela,
      arquivoNome: plano.arquivoNome,
      arquivoSha256: plano.arquivoSha256,
      fundamento: plano.fundamento,
      criadoEm: plano.criadoEm,
      criadoPor: plano.criadoPor,
      contas: contas.length,
      exigemRetencao: contas.filter((c) => c.exigeRetencao).length,
      exigemReceitaExtra: contas.filter((c) => c.exigeReceitaExtra).length,
    },
  };
}

/** IMPORTA a planilha do Tribunal designada para o exercício. O serviço cobra IMPORTAR_PLANO_DO_TRIBUNAL. */
export async function importarPlanoDoTribunalPelaTela(input: {
  readonly exercicio: number;
  readonly anoDaTabela: number;
  readonly arquivoNome: string;
  readonly conteudo: Buffer;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("IMPORTAR_PLANO_DO_TRIBUNAL", (criadoPor) =>
    importarPlanoDoTribunal(cliente(), { ...input, criadoPor })
  );
  return (
    `Tabela de ${String(input.anoDaTabela)} importada para ${String(input.exercicio)}: ${String(r.contas)} contas, ` +
    `${String(r.exigemRetencao)} exigem o vínculo com a retenção e ${String(r.exigemReceitaExtra)} com a receita extra.`
  );
}

// ── V26 — A UNIDADE GESTORA DA REMESSA ───────────────────────────────────────────────────────

export interface UgDaRemessa {
  readonly codUnidadeGestora: string;
  readonly cnpjGerenciadora: string;
  readonly nome: string;
  /** Sem unidade gestora cadastrada: o pacote sai com o código de demonstração, e a tela diz isso. */
  readonly demonstracao: boolean;
  readonly opcoes: readonly { readonly codigo: string; readonly nome: string }[];
}

/**
 * A UG cuja remessa se monta: a pedida, ou a única escriturada aqui e vigente no dia. O CNPJ é o da UG, ou o da
 * entidade que a escritura; sem nenhum dos dois, a recusa nomeia a UG — nenhum CNPJ é emprestado.
 */
export async function ugDaRemessa(dia: Date, codigoPedido?: string, demonstracao?: { readonly codUnidadeGestora: string; readonly cnpjGerenciadora: string }): Promise<UgDaRemessa> {
  await exigirLeituraDoEnte("CONSULTAR_INTEGRACOES");
  const prisma = cliente();
  const operadas = await unidadesGestorasOperadas(prisma, dia);
  if (operadas.length === 0) {
    if (demonstracao === undefined) throw new Error("Nenhuma unidade gestora escriturada aqui está vigente no dia. Cadastre-a em Contabilidade › Unidades gestoras.");
    return { ...demonstracao, nome: "Unidade de demonstração", demonstracao: true, opcoes: [] };
  }
  const escolhida = codigoPedido === undefined || codigoPedido === "" ? operadas[0] : operadas.find((u) => u.codigoTce === codigoPedido);
  if (escolhida === undefined) throw new Error(`A unidade gestora ${codigoPedido ?? ""} não é escriturada aqui ou não está vigente em ${diaCivil(dia)}.`);
  let cnpj = escolhida.cnpj;
  if (cnpj === null) {
    const ug = await prisma.unidadeGestora.findUniqueOrThrow({ where: { id: escolhida.id }, select: { entidadeContabil: { select: { versoes: { orderBy: { versao: "desc" }, take: 1, select: { cnpj: true } } } } } });
    cnpj = ug.entidadeContabil?.versoes[0]?.cnpj ?? null;
  }
  if (cnpj === null) throw new Error(`A unidade gestora ${escolhida.codigoTce} não tem CNPJ, nem a entidade que a escritura. Informe-o no cadastro antes de montar a remessa.`);
  return { codUnidadeGestora: escolhida.codigoTce, cnpjGerenciadora: cnpj, nome: escolhida.nome, demonstracao: false, opcoes: operadas.map((u) => ({ codigo: u.codigoTce, nome: u.nome })) };
}
