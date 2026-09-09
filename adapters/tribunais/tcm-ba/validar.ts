import { Decimal } from "decimal.js";
import type {
  Competencia,
  Inconsistencia,
  Severidade,
} from "../../../packages/tribunais-core/porta.js";
import type { ArquivoSpec, CampoSpec } from "./siga/tipos.js";
import { formatarCampo, sanitizarAN, ANO_MINIMO_SIGA } from "./siga/writer.js";
import {
  CONCILIACAO_MOVIMENTACAO_SALDO,
  DETALHE_EXIGIDO_NO_TIPO_3,
  LIMITE_HISTORICO_EMPENHO,
  MINIMO_ORGAOS_SIGA,
  SPECS_INCOMPLETAS,
  TP_PAGAMENTO_EXIGIDO_NO_TIPO_3,
  TP_PODER_LEGISLATIVO,
} from "./siga/specs/index.js";

/**
 * A VALIDAÇÃO PRÉVIA DO SIGA (requisito 64 do TR) — APONTA, NUNCA CONSERTA.
 *
 * ═══ POR QUE VALIDAR ANTES DE GERAR ═══
 * O TCM valida do lado dele e recusa a REMESSA INTEIRA — não o registro. Um empenho com o de/para
 * de conta faltando derruba o lote todo, e a mensagem que volta é do sistema deles: genérica, sem
 * dizer qual empenho nem qual campo. Validar aqui é o que transforma "remessa recusada" em
 * "empenho 45: a conta 3.3.90.39 não tem de/para SIGA".
 *
 * ═══ ⚠️ A IDENTIDADE É O `origemId`, NÃO A LINHA ═══
 * Esta função roda ANTES de o arquivo existir. Falar em "linha 12" aqui seria falar de nada — a
 * linha só nasce na geração. Por isso toda inconsistência aponta o REGISTRO DE DOMÍNIO
 * (`origemTabela` + `origemId`), que é o que o contador consegue abrir no sistema. Os campos
 * `arquivo`/`linha` da `Inconsistencia` ficam vazios aqui e são preenchidos por `gerar()`.
 *
 * ⚠️ BLOQUEIA vs ALERTA — a diferença é se o arquivo SAIRIA ERRADO ou apenas DIFERENTE.
 *   · BLOQUEIA: o TCM recusaria, ou o dado sairia com outro significado. Não há remessa.
 *   · ALERTA: a remessa sai, mas o que vai não é exatamente o que está no banco (texto truncado,
 *     caractere trocado pela blacklist). Quem assina precisa saber ANTES, não descobrir depois.
 */

/**
 * OS CÓDIGOS DAS REGRAS — `SIGA-{E|A}{NNN}`, `E` para BLOQUEIA e `A` para ALERTA.
 *
 * ⚠️ O CÓDIGO É ESTÁVEL, A MENSAGEM NÃO. É o código que a tela filtra, que a documentação indexa e
 * que o contador cita ao pedir ajuda. Reescrever a mensagem é livre; renumerar não é.
 *
 * O namespace `SIGA-` é do adapter — o TCE-PB usa `SAGRES-`, e por isso a numeração pode ser livre
 * dentro de cada um sem risco de colisão.
 */
export const CODIGOS_SIGA = {
  CONTA_SEM_DE_PARA: "SIGA-E001",
  /**
   * ⚠️ E015 SERIA DUPLICATA DESTE. A tabela de códigos do lote 2 propôs `SIGA-E015` para "fonte
   * sem codigoTcmBa" — regra que já nasceu aqui como E002. Manter as duas criaria dois códigos
   * para a mesma recusa, e o código é justamente o que a tela filtra e o contador cita. E002
   * permanece; E015 fica QUEIMADO (nunca reutilizado para outra regra, para não confundir quem
   * leu a tabela antiga).
   */
  FONTE_SEM_DE_PARA: "SIGA-E002",
  CONTRATO_OBRIGATORIO: "SIGA-E003",
  LICITACAO_SEM_REFERENCIA: "SIGA-E004",
  ANO_INVALIDO: "SIGA-E005",
  VALOR_NAO_CABE: "SIGA-E006",
  CONTRATO_NAO_CABE: "SIGA-E007",
  HISTORICO_NAO_CABE: "SIGA-E008",
  EMPENHO_CONTA_SEM_DE_PARA: "SIGA-E009",
  EMPENHO_FONTE_SEM_DE_PARA: "SIGA-E010",
  GRANULARIDADE_NAO_SUPORTADA: "SIGA-E011",
  /** Spec com domínio ausente no manual — geração bloqueada (hoje: MovConta 32). */
  SPEC_INCOMPLETA: "SIGA-E014",
  ITEM_RECEITA_SEM_DE_PARA: "SIGA-E016",
  ITEM_DESPESA_SEM_DE_PARA: "SIGA-E017",
  ORGAOS_INSUFICIENTES: "SIGA-E018",
  CONCILIA_TIPO3_PAGAMENTO: "SIGA-E019",
  CONCILIA_TIPO3_DETALHE: "SIGA-E020",
  CONCILIA_VALOR_ZERO: "SIGA-E021",
  ESTORNO_EXCEDE_SALDO: "SIGA-E022",
  HISTORICO_NO_LIMITE: "SIGA-A001",
  TEXTO_SANITIZADO: "SIGA-A002",
} as const;

/**
 * ⚠️ CÓDIGO QUEIMADO — não reutilizar. Ver o comentário de `FONTE_SEM_DE_PARA`.
 * `SIGA-A008` (MovConta agregado não fecha D=C) também está reservado, mas ainda NÃO existe: ele
 * valida um arquivo que hoje é INGERÁVEL (`tp_MovContabil` sem domínio). Implementá-lo agora seria
 * conferir o equilíbrio de um agregado que nenhum código produz.
 */
export const CODIGOS_SIGA_QUEIMADOS: readonly string[] = ["SIGA-E015"];

/** O de/para de conta contábil: PCASP do ente → identificador da conta no TCM-BA. */
export interface DeParaConta {
  /** cuid da ContaPcasp — o `origemId` das inconsistências desta conta. */
  readonly contaPcaspId: string;
  readonly codigoPcasp: string;
  readonly sequencialTcm: number | null;
}

/** O de/para de fonte de recurso: fonte do ente → código do TCM-BA. */
export interface DeParaFonte {
  /** cuid da FonteRecurso. */
  readonly fonteRecursoId: string;
  readonly codigo: string;
  readonly codigoTcmBa: number | null;
}

/** Um empenho, na forma mínima que a validação precisa enxergar. */
export interface EmpenhoParaValidar {
  /** ⚠️ cuid do Empenho — é ele que vai no `origemId`, e é como o humano acha o fato. */
  readonly id: string;
  readonly nuEmpenho: string;
  readonly historico: string;
  readonly valor: Decimal;
  readonly data: Date;
  readonly contratoAplicavel: boolean;
  readonly nuContrato: string | null;
  readonly sujeitoLicitacao: boolean;
  readonly nuProcessoLicitatorio: string | null;
  readonly cdDispensa: string | null;
  readonly contaPcaspId: string | null;
  readonly fonteRecursoId: string | null;
}

/** Item de receita: código interno do município → código do TCM (arquivo EspRec 62). */
export interface DeParaItemReceita {
  readonly itemReceitaId: string;
  readonly codigoInterno: string;
  readonly codigoTcmBa: string | null;
}

/** Item de despesa: elemento interno → elemento do TCM (arquivo EspDesp 61). */
export interface DeParaItemDespesa {
  readonly elementoId: string;
  readonly codigoInterno: string;
  readonly codigoTcmBa: string | null;
}

/** Órgão, na forma que o arquivo Orgao (38) exige. */
export interface OrgaoParaValidar {
  readonly id: string;
  readonly codigo: string;
  /** `tp_poder`: 1=Executivo-Prefeitura 2=Legislativo 3=Executivo-Outros 4=Executivo-Fundos. */
  readonly tpPoder: string;
}

/** Um registro de conciliação bancária (arquivo Concilia 12). */
export interface ConciliacaoParaValidar {
  readonly id: string;
  /** `cd_Conciliacao` — 3 = Movimentação/Saldo (o único valor conhecido do domínio). */
  readonly cdConciliacao: number;
  readonly tpPagamento: string;
  readonly detalheTipoPagto: string;
  readonly valor: Decimal;
}

/** Um estorno de receita (arquivo EstorRec 197), com o saldo do lançamento estornado. */
export interface EstornoReceitaParaValidar {
  readonly id: string;
  readonly valorEstorno: Decimal;
  /** O saldo DISPONÍVEL do lançamento original — o teto que o estorno não pode ultrapassar. */
  readonly saldoDisponivel: Decimal;
}

/**
 * Tudo o que a validação lê. Vem do banco; a função em si é PURA e testável sem Prisma.
 *
 * ⚠️ AS COLEÇÕES DO LOTE 2 SÃO OPCIONAIS de propósito: quem valida só o caminho crítico da despesa
 * (lote 1) não precisa montar órgãos e conciliações para chamar esta função. Ausente ≠ vazio em
 * intenção, mas o efeito é o mesmo — a regra correspondente simplesmente não roda.
 */
export interface MassaParaValidar {
  readonly competencia: Competencia;
  readonly contas: readonly DeParaConta[];
  readonly fontes: readonly DeParaFonte[];
  readonly empenhos: readonly EmpenhoParaValidar[];
  readonly itensReceita?: readonly DeParaItemReceita[];
  readonly itensDespesa?: readonly DeParaItemDespesa[];
  readonly orgaos?: readonly OrgaoParaValidar[];
  readonly conciliacoes?: readonly ConciliacaoParaValidar[];
  readonly estornosReceita?: readonly EstornoReceitaParaValidar[];
  /**
   * Os arquivos que a remessa vai incluir, por `identificacao`. Serve para acusar (SIGA-E014) que
   * um deles está bloqueado por domínio ausente. Ausente = a remessa padrão (caminho crítico), que
   * não inclui nenhum arquivo bloqueado.
   */
  readonly arquivosSolicitados?: readonly string[];
}

function achado(
  codigo: string,
  severidade: Severidade,
  origemTabela: string,
  origemId: string,
  mensagem: string,
  campo?: string
): Inconsistencia {
  // `exactOptionalPropertyTypes`: a chave `campo` é OMITIDA quando não há campo, nunca `undefined`.
  return campo === undefined
    ? { codigo, severidade, origemTabela, origemId, mensagem }
    : { codigo, severidade, origemTabela, origemId, mensagem, campo };
}

/**
 * O CAMPO CABE, DEPOIS DE SANITIZADO?
 *
 * ⚠️ A CONTA É FEITA SOBRE O TEXTO JÁ SANITIZADO, e essa ordem importa: a blacklist substitui por
 * espaço (não remove), então o comprimento não muda — mas o strip de ACENTO muda. "Manutenção"
 * tem 10 caracteres; em NFD, antes do strip, tem 12. Medir antes do saneamento acusaria overflow
 * onde não há.
 */
function cabeNoCampo(valor: string, campo: CampoSpec): boolean {
  return sanitizarAN(valor).length <= campo.fim - campo.inicio + 1;
}

function campoDe(spec: ArquivoSpec, nome: string): CampoSpec {
  const campo = spec.campos.find((c) => c.nome === nome);
  if (campo === undefined) {
    throw new Error(`SPEC_SEM_CAMPO: "${nome}" não existe em ${spec.identificacao}.`);
  }
  return campo;
}

/**
 * O SIGA RECEBE REMESSA MENSAL OU ANUAL — NUNCA DIÁRIA.
 *
 * ⚠️ ISTO SÓ É EXPRIMÍVEL PORQUE A `Competencia` É UNION ETIQUETADA. Com `{ exercicio, mes?, dia? }`
 * o adapter receberia um `dia` que não sabe usar e o IGNORARIA em silêncio: quem pedisse a remessa
 * de 15/03 receberia a de março inteiro, achando que pediu um dia. A etiqueta permite RECUSAR.
 */
export function granularidadeSuportada(c: Competencia): boolean {
  return c.granularidade !== "DIARIA";
}

/**
 * VALIDA A MASSA CONTRA AS REGRAS DO SIGA. Função PURA: recebe a massa já lida, devolve a lista.
 *
 * Separada da leitura do banco de propósito — é assim que ela é exercitável em teste sem Postgres,
 * e é assim que a mesma validação serve à tela (que já leu) e ao lote (que vai ler).
 */
export function validarMassaSiga(
  massa: MassaParaValidar,
  specEmpenho: ArquivoSpec
): Inconsistencia[] {
  const achados: Inconsistencia[] = [];

  // ── (0) A GRANULARIDADE PEDIDA É ATENDÍVEL? ──────────────────────────────────────────────────
  if (!granularidadeSuportada(massa.competencia)) {
    achados.push(
      achado(
        CODIGOS_SIGA.GRANULARIDADE_NAO_SUPORTADA,
        "BLOQUEIA",
        "Competencia",
        `${massa.competencia.exercicio}`,
        "O SIGA recebe remessa MENSAL ou ANUAL — não existe remessa diária no layout. Peça o mês " +
          "inteiro. (Gerar o mês e chamá-lo de 'o dia pedido' seria entregar outra coisa.)"
      )
    );
  }

  const contaPorId = new Map(massa.contas.map((c) => [c.contaPcaspId, c]));
  const fontePorId = new Map(massa.fontes.map((f) => [f.fonteRecursoId, f]));

  // ── (1) DE/PARA DE CONTA CONTÁBIL ────────────────────────────────────────────────────────────
  //
  // ⚠️ SEM `sequencialTcm` NÃO HÁ COMO GERAR. O TCM identifica a conta pelo número DELE; o código
  // PCASP do ente não serve. Inventar um número seria mandar lançamento para a conta errada.
  for (const conta of massa.contas) {
    if (conta.sequencialTcm === null) {
      achados.push(
        achado(
          CODIGOS_SIGA.CONTA_SEM_DE_PARA,
          "BLOQUEIA",
          "ContaPcasp",
          conta.contaPcaspId,
          `A conta contábil ${conta.codigoPcasp} não tem correspondência cadastrada para o ` +
            `TCM-BA. O Tribunal identifica a conta pelo número dele, não pelo código do plano do ` +
            `município — sem essa correspondência o arquivo não pode ser gerado.`,
          "nu_SequencialTC"
        )
      );
    }
  }

  // ── (2) DE/PARA DE FONTE DE RECURSO ──────────────────────────────────────────────────────────
  for (const fonte of massa.fontes) {
    if (fonte.codigoTcmBa === null) {
      achados.push(
        achado(
          CODIGOS_SIGA.FONTE_SEM_DE_PARA,
          "BLOQUEIA",
          "FonteRecurso",
          fonte.fonteRecursoId,
          `A fonte de recurso ${fonte.codigo} não tem código do TCM-BA cadastrado. As fontes do ` +
            `Tribunal não coincidem com as do município nem com as da STN.`,
          "cd_FonteRecurso"
        )
      );
    }
  }

  // ── (3) OS EMPENHOS, UM A UM ─────────────────────────────────────────────────────────────────
  const campoHistorico = campoDe(specEmpenho, "de_Historico");
  const campoValor = campoDe(specEmpenho, "vl_Empenho");
  const campoContrato = campoDe(specEmpenho, "nu_Contrato");

  for (const e of massa.empenhos) {
    // (3a) contrato aplicável exige o número do contrato
    if (e.contratoAplicavel && (e.nuContrato === null || e.nuContrato.trim() === "")) {
      achados.push(
        achado(
          CODIGOS_SIGA.CONTRATO_OBRIGATORIO,
          "BLOQUEIA",
          "Empenho",
          e.id,
          `O empenho ${e.nuEmpenho} está marcado como contratual mas não informa o número do ` +
            `contrato. Ou o contrato existe e deve ser informado, ou o empenho não é contratual.`,
          "nu_Contrato"
        )
      );
    }

    // (3b) sujeito a licitação exige processo OU dispensa
    const semProcesso = e.nuProcessoLicitatorio === null || e.nuProcessoLicitatorio.trim() === "";
    const semDispensa = e.cdDispensa === null || e.cdDispensa.trim() === "";
    if (e.sujeitoLicitacao && semProcesso && semDispensa) {
      achados.push(
        achado(
          CODIGOS_SIGA.LICITACAO_SEM_REFERENCIA,
          "BLOQUEIA",
          "Empenho",
          e.id,
          `O empenho ${e.nuEmpenho} está marcado como sujeito a licitação mas não informa nem o ` +
            `processo licitatório nem o código de dispensa. Um dos dois é obrigatório.`,
          "nu_ProcessoLicitatorio"
        )
      );
    }

    // (3c) data anterior a 2000
    if (e.data.getUTCFullYear() < ANO_MINIMO_SIGA) {
      achados.push(
        achado(
          CODIGOS_SIGA.ANO_INVALIDO,
          "BLOQUEIA",
          "Empenho",
          e.id,
          `O empenho ${e.nuEmpenho} tem data ${e.data.toISOString().slice(0, 10)}, anterior a ` +
            `${ANO_MINIMO_SIGA}. No SIGA isso é data não preenchida, não histórico.`,
          "dt_Empenho"
        )
      );
    }

    // (3d) o valor cabe na largura do campo V?
    try {
      formatarCampo(campoValor, e.valor);
    } catch {
      achados.push(
        achado(
          CODIGOS_SIGA.VALOR_NAO_CABE,
          "BLOQUEIA",
          "Empenho",
          e.id,
          `O valor ${e.valor.toFixed(2)} do empenho ${e.nuEmpenho} não cabe no campo do layout ` +
            `(${campoValor.fim - campoValor.inicio + 1} posições). Truncar um valor produziria ` +
            `outro valor.`,
          "vl_Empenho"
        )
      );
    }

    // (3e) o número do contrato cabe?
    if (e.nuContrato !== null && !cabeNoCampo(e.nuContrato, campoContrato)) {
      achados.push(
        achado(
          CODIGOS_SIGA.CONTRATO_NAO_CABE,
          "BLOQUEIA",
          "Empenho",
          e.id,
          `O contrato "${e.nuContrato}" do empenho ${e.nuEmpenho} excede as ` +
            `${campoContrato.fim - campoContrato.inicio + 1} posições do campo.`,
          "nu_Contrato"
        )
      );
    }

    // (3f) o histórico cabe?
    const historicoLimpo = sanitizarAN(e.historico);
    if (!cabeNoCampo(e.historico, campoHistorico)) {
      achados.push(
        achado(
          CODIGOS_SIGA.HISTORICO_NAO_CABE,
          "BLOQUEIA",
          "Empenho",
          e.id,
          `O histórico do empenho ${e.nuEmpenho} tem ${historicoLimpo.length} caracteres e o ` +
            `campo comporta ${LIMITE_HISTORICO_EMPENHO}. Encurte o histórico no empenho — cortar ` +
            `automaticamente mandaria ao Tribunal um texto que ninguém reviu.`,
          "de_Historico"
        )
      );
    } else if (historicoLimpo.length === LIMITE_HISTORICO_EMPENHO) {
      achados.push(
        achado(
          CODIGOS_SIGA.HISTORICO_NO_LIMITE,
          "ALERTA",
          "Empenho",
          e.id,
          `O histórico do empenho ${e.nuEmpenho} ocupa exatamente as ` +
            `${LIMITE_HISTORICO_EMPENHO} posições do campo — provavelmente já vinha cortado.`,
          "de_Historico"
        )
      );
    }

    // (3g) a blacklist ALTEROU o texto? O que sai passa a diferir do que está no banco.
    if (historicoLimpo !== e.historico) {
      achados.push(
        achado(
          CODIGOS_SIGA.TEXTO_SANITIZADO,
          "ALERTA",
          "Empenho",
          e.id,
          `O histórico do empenho ${e.nuEmpenho} sai alterado no arquivo: acentos e caracteres ` +
            `que o Tribunal recusa (aspa, ponto-e-vírgula, hífen duplo) foram substituídos. O ` +
            `arquivo não leva o texto exato do empenho.`,
          "de_Historico"
        )
      );
    }

    // (3h) as referências de de/para existem para ESTE empenho
    if (e.contaPcaspId !== null) {
      const conta = contaPorId.get(e.contaPcaspId);
      if (conta === undefined || conta.sequencialTcm === null) {
        achados.push(
          achado(
            CODIGOS_SIGA.EMPENHO_CONTA_SEM_DE_PARA,
            "BLOQUEIA",
            "Empenho",
            e.id,
            `O empenho ${e.nuEmpenho} usa uma conta contábil sem correspondência cadastrada para ` +
              `o TCM-BA.`,
            "cd_ContaContabil"
          )
        );
      }
    }
    if (e.fonteRecursoId !== null) {
      const fonte = fontePorId.get(e.fonteRecursoId);
      if (fonte === undefined || fonte.codigoTcmBa === null) {
        achados.push(
          achado(
            CODIGOS_SIGA.EMPENHO_FONTE_SEM_DE_PARA,
            "BLOQUEIA",
            "Empenho",
            e.id,
            `O empenho ${e.nuEmpenho} usa uma fonte de recurso sem código do TCM-BA cadastrado.`,
            "cd_FonteRecurso"
          )
        );
      }
    }
  }

  // ── (4) ARQUIVO PEDIDO QUE ESTÁ BLOQUEADO POR DOMÍNIO AUSENTE ────────────────────────────────
  //
  // ⚠️ SÓ DISPARA PARA O QUE FOI PEDIDO — e essa condição é o ponto.
  //
  // O MovConta (32) não está no caminho crítico, então a remessa mensal normal não o inclui e não
  // deve ser bloqueada por causa dele. Emitir este BLOQUEIA incondicionalmente faria
  // `exportarParaTribunal` devolver `ok: false` para SEMPRE, em toda competência — um fail-closed
  // que não protege nada e impede tudo.
  //
  // Quando alguém PEDE o arquivo, aí sim: a geometria dele fecha, mas falta a "Tabela Tipo
  // Movimento Contábil" do manual v44. Gerar assim classificaria todo o movimento contábil do mês
  // numa categoria inventada — e o TCM ACEITARIA, porque qualquer dígito cabe no campo. Erro que
  // não gera recusa é o pior tipo.
  const pedidos = massa.arquivosSolicitados;
  if (pedidos !== undefined) {
    for (const spec of SPECS_INCOMPLETAS) {
      if (!pedidos.includes(spec.identificacao)) continue;
      achados.push(
        achado(
          CODIGOS_SIGA.SPEC_INCOMPLETA,
          "BLOQUEIA",
          "ArquivoSpec",
          spec.identificacao,
          `O arquivo ${spec.identificacao} (${spec.numeroManual}) foi pedido, mas não pode ser ` +
            `gerado: o manual v44 não traz a tabela de domínio de um campo obrigatório dele. ` +
            `Preencher por analogia produziria um arquivo ACEITO pelo Tribunal com o dado ` +
            `classificado errado. Obtenha a tabela oficial junto ao TCM-BA antes de incluí-lo.`
        )
      );
    }
  }

  // ── (5) ITENS DE RECEITA E DESPESA SEM DE/PARA ───────────────────────────────────────────────
  for (const item of massa.itensReceita ?? []) {
    if (item.codigoTcmBa === null) {
      achados.push(
        achado(
          CODIGOS_SIGA.ITEM_RECEITA_SEM_DE_PARA,
          "BLOQUEIA",
          "ItemReceita",
          item.itemReceitaId,
          `O item de receita ${item.codigoInterno} não tem código do TCM-BA cadastrado ` +
            `(Res. TCM 1293/10). Sem ele a arrecadação não pode ser informada.`,
          "cd_ItemReceita"
        )
      );
    }
  }
  for (const item of massa.itensDespesa ?? []) {
    if (item.codigoTcmBa === null) {
      achados.push(
        achado(
          CODIGOS_SIGA.ITEM_DESPESA_SEM_DE_PARA,
          "BLOQUEIA",
          "ItemDespesa",
          item.elementoId,
          `O elemento de despesa ${item.codigoInterno} não tem código do TCM-BA cadastrado ` +
            `(Res. TCM 1293/10).`,
          "cd_Elemento"
        )
      );
    }
  }

  // ── (6) O MANUAL EXIGE EXECUTIVO **E** LEGISLATIVO ───────────────────────────────────────────
  //
  // ⚠️ Um município que envie só o Executivo tem a remessa recusada, e a mensagem do Tribunal não
  // diz qual órgão falta. A checagem é por PODER, não por contagem: dois órgãos executivos
  // continuam sem atender a exigência.
  const orgaos = massa.orgaos;
  if (orgaos !== undefined) {
    const temLegislativo = orgaos.some((o) => o.tpPoder === TP_PODER_LEGISLATIVO);
    if (orgaos.length < MINIMO_ORGAOS_SIGA || !temLegislativo) {
      achados.push(
        achado(
          CODIGOS_SIGA.ORGAOS_INSUFICIENTES,
          "BLOQUEIA",
          "Orgao",
          "remessa",
          `A remessa tem ${orgaos.length} órgão(s)` +
            `${temLegislativo ? "" : " e nenhum do poder Legislativo"}. O TCM-BA exige ao menos ` +
            `um órgão do Executivo e um do Legislativo (Câmara Municipal).`,
          "tp_poder"
        )
      );
    }
  }

  // ── (7) AS REGRAS ACOPLADAS DA CONCILIAÇÃO BANCÁRIA ──────────────────────────────────────────
  //
  // ⚠️ NENHUMA DELAS É EXPRESSÁVEL NA GEOMETRIA. Cada campo isolado passa em qualquer validação de
  // largura e domínio; é a COMBINAÇÃO que o TCM recusa. Por isso vivem aqui e não na spec.
  for (const c of massa.conciliacoes ?? []) {
    if (c.cdConciliacao === CONCILIACAO_MOVIMENTACAO_SALDO) {
      if (c.tpPagamento !== TP_PAGAMENTO_EXIGIDO_NO_TIPO_3) {
        achados.push(
          achado(
            CODIGOS_SIGA.CONCILIA_TIPO3_PAGAMENTO,
            "BLOQUEIA",
            "Conciliacao",
            c.id,
            `A conciliação do tipo ${CONCILIACAO_MOVIMENTACAO_SALDO} (Movimentação/Saldo) exige ` +
              `tipo de pagamento "${TP_PAGAMENTO_EXIGIDO_NO_TIPO_3}" (Cheque), e veio ` +
              `"${c.tpPagamento}".`,
            "tp_Pagamento"
          )
        );
      }
      if (c.detalheTipoPagto !== DETALHE_EXIGIDO_NO_TIPO_3) {
        achados.push(
          achado(
            CODIGOS_SIGA.CONCILIA_TIPO3_DETALHE,
            "BLOQUEIA",
            "Conciliacao",
            c.id,
            `A conciliação do tipo ${CONCILIACAO_MOVIMENTACAO_SALDO} exige o detalhe fixo ` +
              `"${DETALHE_EXIGIDO_NO_TIPO_3}", e veio "${c.detalheTipoPagto}".`,
            "de_DetalheTipoPagto"
          )
        );
      }
    } else if (c.valor.isZero()) {
      // Fora do tipo 3, valor zero não é conciliação de nada.
      achados.push(
        achado(
          CODIGOS_SIGA.CONCILIA_VALOR_ZERO,
          "BLOQUEIA",
          "Conciliacao",
          c.id,
          `A conciliação do tipo ${c.cdConciliacao} tem valor zero. Só o tipo ` +
            `${CONCILIACAO_MOVIMENTACAO_SALDO} (Movimentação/Saldo) admite valor zerado.`,
          "vl_MovConciliado"
        )
      );
    }
  }

  // ── (8) ESTORNO DE RECEITA NÃO EXCEDE O SALDO ────────────────────────────────────────────────
  //
  // ⚠️ É A MESMA DOUTRINA QUE O BANCO JÁ DEFENDE (uq_estorno_receita_unico, M01/M04): estorno é
  // append-only e limitado ao saldo. Aqui a recusa acontece ANTES do envio, nomeando a receita —
  // do lado do Tribunal ela voltaria genérica.
  for (const e of massa.estornosReceita ?? []) {
    if (e.valorEstorno.greaterThan(e.saldoDisponivel)) {
      achados.push(
        achado(
          CODIGOS_SIGA.ESTORNO_EXCEDE_SALDO,
          "BLOQUEIA",
          "EstornoReceita",
          e.id,
          `O estorno de ${e.valorEstorno.toFixed(2)} excede o saldo disponível de ` +
            `${e.saldoDisponivel.toFixed(2)} do lançamento original. Estornar mais do que se ` +
            `arrecadou criaria receita negativa que nunca existiu.`,
          "vl_Estorno"
        )
      );
    }
  }

  return achados;
}
