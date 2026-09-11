import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { raizesExistentes, RAIZES_DE_ESCRITA } from "./raizes-dominio.js";
import { somenteCodigo } from "./prosa.js";

/**
 * ═══ O CENSO DE AUSÊNCIAS — a contraprova de `AUSENTE_CONFIRMADO` ═══
 *
 * O ENT03c varreu os módulos existentes contra o catálogo e marcou dezenas de cláusulas
 * como **AUSENTE_CONFIRMADO**. Essa marcação vale tanto quanto uma presença — foi a
 * marcação da 5.10.2.6 que trouxe a conta multifonte para a mesa **antes** de alguém
 * construir por cima dela. Mas ela tem um modo de falha próprio, e é silencioso:
 *
 * ⚠️ **A AUSÊNCIA ENVELHECE.** Alguém constrói a requisição de material em março, e o
 * catálogo continua dizendo "não existe" porque ninguém voltou para desmarcar. O
 * inventário passa a MENTIR — e mente na direção pessimista, que é a que faz o próximo
 * lote reconstruir o que já estava lá.
 *
 * Este arquivo é a guarda no outro sentido. Cada linha abaixo afirma que um conceito
 * **continua ausente** no código. No dia em que ele nascer, o teste QUEBRA e diz qual
 * cláusula do catálogo precisa mudar de situação. É a mesma ideia da lista de exceções
 * do `data-civil.test.ts`: uma lista vigiada, não uma lista escrita e esquecida.
 *
 * ⚠️ **E É POR ISSO QUE O PADRÃO É UM NOME DE MODELO OU DE CAMPO, e não uma palavra
 * solta.** `/etiqueta/` acha onze arquivos e nenhum é código de barras — é um adereço de
 * interface. O padrão tem de ser o nome que a COISA teria se ela existisse.
 */

const RAIZ = resolve(import.meta.dirname, "..");

interface Ausencia {
  /** As cláusulas do catálogo que esta ausência sustenta. */
  readonly clausulas: readonly string[];
  /** O que não existe, em linguagem de negócio. */
  readonly oQue: string;
  /** O nome que a coisa teria se existisse — modelo Prisma, campo ou caso de uso. */
  readonly padrao: RegExp;
}

/**
 * ⚠️ AS DUAS FAMÍLIAS QUE A VARREDURA ACHOU, e as duas são a mesma classe de engano:
 *
 *  · **o almoxarifado do M10 é CONTÁBIL, não FÍSICO.** Ele move VALOR por classe de
 *    material contra a conta de estoque do PCASP. Não há quantidade, unidade, depósito,
 *    lote nem validade — e sem quantidade não há preço médio, saldo físico nem
 *    inventário. O mapa de lacunas classificou a 5.18 inteira como BASE_FORTE olhando o
 *    nome do arquivo;
 *  · **o patrimônio do M10 é a CONTABILIDADE do bem, não a GESTÃO dele.** Há tombamento,
 *    classe, valor contábil, depreciação por competência e alienação com resultado. Não
 *    há localização, responsável, estado de conservação, comissão nem termo.
 *
 * Nos dois casos o motor existe e é bom; o que falta é o cadastro que o alimenta.
 */
const AUSENCIAS: readonly Ausencia[] = [
  // ── 5.18 · ALMOXARIFADO: o que exige QUANTIDADE, e o modelo só tem VALOR ──
  {
    // ⚠️ A 5.18.24 MIGROU PARA CÁ no ENT05. Ela dizia "uma ou mais requisições podem ser
    // vinculadas à remessa": a REQUISIÇÃO passou a existir, a REMESSA não — e o vínculo
    // entre as duas é o que a cláusula pede. Ela é ausência de remessa, não de requisição.
    clausulas: ["5.18.23", "5.18.24", "5.18.25"],
    oQue: "remessa de saída com fluxo de separação, conferência, transporte e entrega",
    padrao: /model Remessa\b|remessaId|etapaDaRemessa/,
  },
  {
    clausulas: ["5.18.22"],
    oQue: "virada mensal do almoxarifado",
    padrao: /viradaMensal|virada_mensal|viradaDoAlmoxarifado/,
  },

  // ── 5.19 · PATRIMÔNIO: o que é GESTÃO do bem, e o modelo só tem CONTABILIDADE ──
  {
    // ⚠️ PADRÃO APERTADO NO ENT05, E O MOTIVO É UM FALSO POSITIVO REAL. O `inventarioId`
    // do padrão antigo passou a casar com o inventário DE ESTOQUE (5.18.12), que é outro
    // objeto: um conta prateleira de almoxarifado, o outro percorre bens tombados com
    // comissão e termo. Deixar como estava marcaria seis cláusulas de patrimônio como
    // prontas por causa de um campo do almoxarifado.
    // ⚠️ ENCOLHEU NO ENT05. O inventário de bens nasceu com comissão, termo, contagem e
    // inconsistência derivada — o que cobre 5.19.1, .17, .20, .21 e .22. NÃO nasceu a
    // atualização EM LOTE por grupo (repartição, responsável, conta, classe), que é outra
    // coisa: percorrer o acervo escolhendo por critério em vez de bem a bem.
    clausulas: ["5.19.18"],
    oQue: "atualização de inventário em LOTE, por grupo (repartição, responsável, classe)",
    padrao: /atualizacaoEmLoteDeInventario|InventarioEmGrupo/,
  },
  {
    // ⚠️ ENCOLHEU NO ENT05. Localização, responsável e unidade gestora do bem passaram a
    // existir como MOVIMENTO derivado (5.19.10 e 5.19.27). O que falta é a CONSULTA por
    // critério livre e o RELATÓRIO por situação/repartição/espécie — telas, não modelo.
    clausulas: ["5.19.14", "5.19.34"],
    oQue: "consulta do bem por critério livre e relatório por situação/repartição/espécie",
    padrao: /consultaDeBensPorCriterio|relatorioDeBensPorSituacao/,
  },
  {
    // ⚠️ ENCOLHEU NO ENT05. A transferência entre entidades (5.19.28) e a correção pelo
    // inventário (5.19.19) existem. O que falta é a SOLICITAÇÃO de transferência, com
    // notificação a quem tem pendência — que é fluxo de aprovação, não movimento.
    clausulas: ["5.19.33"],
    oQue: "solicitação de transferência de bem, com notificação ao responsável",
    padrao: /SolicitacaoDeTransferencia|solicitacaoDeTransferenciaId/,
  },
  {
    clausulas: ["5.19.38", "5.19.39"],
    oQue: "virada mensal da depreciação em lote (a competência hoje é bem a bem)",
    padrao: /viradaMensalDaDepreciacao|processarViradaPatrimonial/,
  },
  {
    clausulas: ["5.19.43", "5.19.44", "5.19.45", "5.19.46"],
    oQue: "concessão de bem imóvel, com matrícula e cobrança da taxa",
    padrao: /model Concessao\b|concessaoId|matriculaDoImovel/,
  },
  {
    clausulas: ["5.19.41"],
    oQue: "manutenção prevista e realizada de bem",
    padrao: /ManutencaoDeBem|manutencaoPrevista/,
  },
  // ── 5.17 · COMPRAS: o M11 tem o PROCESSO e o CONTRATO; não tem a COMPRA ──
  {
    // ⚠️ ESTA LINHA ENCOLHEU NO ENT05, e o que sobrou é o que de fato não existe. O
    // `model Material` nasceu com descrição sem limite, grupo/classe/subclasse, N unidades
    // de medida, classificação, categoria, CATMAT e desabilitação com histórico — o que
    // cobre 5.17.2, .3, .6 e .8. NÃO nasceram: marca pré-aprovada, imagem de referência, o
    // vínculo com elemento de despesa, o histórico de aquisições e o rol de itens.
    // ⚠️ ENCOLHEU DE NOVO NO ENT05. Marca pré-aprovada (5.17.5) e vínculo com elemento de
    // despesa (5.17.9, com a RECUSA que a cláusula pede) nasceram. Não nasceram: imagem
    // de referência, histórico de aquisições e rol de itens reutilizável.
    clausulas: ["5.17.7", "5.17.10", "5.17.11", "5.17.74"],
    oQue: "imagem de referência, histórico de aquisições e rol de itens do material",
    padrao: /imagemDoProduto|RolDeItens|historicoDeAquisicoes/,
  },
  {
    clausulas: ["5.17.25", "5.17.26", "5.17.27", "5.17.30", "5.17.31", "5.17.32", "5.17.36", "5.17.60", "5.17.68"],
    oQue: "proposta do participante e rodada de lances do pregão",
    padrao: /model Proposta\b|model Lance\b|propostaId|rodadaDeLances/,
  },
  {
    clausulas: ["5.17.13", "5.17.37"],
    oQue: "comissão de licitação (permanente, especial, pregoeiro, leiloeiro)",
    padrao: /ComissaoDeLicitacao|pregoeiro|leiloeiro/i,
  },
  {
    clausulas: ["5.17.98", "5.17.101", "5.17.106"],
    oQue: "parcelamento por subempenho, retenção e extrato da ordem de compra",
    // ⚠️ `subempenho` FICOU DE FORA do padrão: ele existe, mas como campo do LEIAUTE do
    // TCM-BA (adapters/tribunais/tcm-ba/siga/specs/pag-emp2.ts) — o tribunal pede o número
    // do subempenho e o sistema repete o do empenho, porque subempenho não existe aqui.
    // Achado do censo, não falso positivo: a remessa declara um conceito que o modelo não tem.
    // ⚠️ ENCOLHEU NO ENT05. A ordem de compra (ordinária, global, estimativa), o
    // recebimento com saldo pendente derivado, o desconto e o consumo imediato existem.
    // NÃO existem: o parcelamento por subempenho (que depende do subempenho, ausente no
    // modelo — o achado do censo sobre o leiaute do TCM-BA continua de pé), a retenção na
    // ordem e o extrato de movimentação.
    padrao: /subempenhoDaOrdem|RetencaoDaOrdem|extratoDaOrdemDeCompra/i,
  },
  {
    clausulas: ["5.17.40", "5.17.41", "5.17.65", "5.17.66", "5.17.104"],
    oQue: "ata de registro de preços, com saldo e validade",
    padrao: /AtaDeRegistro|ataDeRegistroId|RegistroDePreco/,
  },
  {
    // ⚠️ PADRÃO APERTADO NO ENT05, POR UM FALSO POSITIVO REAL. O `fornecedorId` do padrão
    // antigo passou a casar com a cotação e a ordem de compra — que apontam para a
    // `Pessoa` do M19, o cadastro único. Reusar a Pessoa NÃO é ter o cadastro de
    // fornecedor: não há CRC, sócios, índices contábeis nem suspensão do direito de
    // licitar. Deixar como estava marcaria sete cláusulas como prontas por causa de uma
    // chave estrangeira.
    clausulas: ["5.17.86", "5.17.87", "5.17.88", "5.17.91", "5.17.92", "5.17.93", "5.17.95"],
    oQue: "cadastro de fornecedor com CRC, sócios, índices contábeis e suspensão",
    padrao: /CertificadoDeRegistroCadastral|indiceContabilDoFornecedor|SuspensaoDeFornecedor/,
  },
  {
    clausulas: ["5.17.69", "5.17.70", "5.17.71", "5.17.72", "5.17.73"],
    oQue: "plano anual de licitações, com intenções e adesão",
    padrao: /PlanoAnualDeLicitacoes|IntencaoDeLicitacao|intencaoId/,
  },
  {
    // ⚠️ ENCOLHEU NO ENT05. A pesquisa com cotações e os três números derivados (médio,
    // mínimo, máximo) existem. NÃO existe a GERAÇÃO do processo ou da ordem a partir da
    // pesquisa, que é a 5.17.47.
    clausulas: ["5.17.47"],
    oQue: "gerar processo ou ordem de compra A PARTIR da pesquisa de preços",
    padrao: /gerarOrdemDaPesquisa|gerarProcessoDaPesquisa/,
  },
  {
    // ⚠️ ENCOLHEU NO ENT05. A solicitação, a autorização como FATO e o eixo por setor
    // existem. NÃO existem: a notificação automática a cada solicitação nova (5.17.55) e
    // a RESERVA orçamentária no momento da autorização (5.17.57), que depende do bloqueio
    // de dotação do M03.
    clausulas: ["5.17.55", "5.17.57"],
    oQue: "notificação de nova solicitação e reserva orçamentária na autorização",
    padrao: /notificarSolicitacaoDeCompra|reservaDaSolicitacao/,
  },
  {
    clausulas: ["5.17.78", "5.17.79", "5.17.81", "5.17.82", "5.17.84", "5.17.38"],
    oQue: "rescisão, equilíbrio econômico-financeiro, apostila e publicação do contrato",
    padrao: /RESCISAO|EQUILIBRIO_ECONOMICO|Apostila|PublicacaoDoContrato/,
  },
  {
    // ⚠️ O ACHADO MAIS ÚTIL DO CENSO DA 5.17, e ele veio de uma ausência que NÃO se
    // confirmou: `EtapaDoProcesso` existe — no M21. O motor de workflow (roteiro copiado
    // na abertura, etapa com setor e prazo, situação DERIVADA dos movimentos, prazo
    // contado do recebimento, tramitação só para quem é lotado no setor) está construído
    // e provado. O que não existe é o VÍNCULO da licitação com ele. Por isso a 5.17.17 é
    // PARCIAL e não AUSENTE, e por isso a linha vigiada aqui é o vínculo, não o motor.
    clausulas: ["5.17.49", "5.17.50"],
    oQue: "vínculo do processo licitatório com o processo digital do protocolo (M21)",
    padrao: /ProcessoLicitatorio[\s\S]{0,400}?processoDigitalId|processoLicitatorioId/,
  },

  // ── 5.11 · CONTROLE INTERNO: o que o censo do ENT03c mediu a mais ──
  {
    clausulas: ["5.11.4"],
    oQue: "checklist como modelo reutilizável (hoje o item pertence a UMA auditoria)",
    padrao: /ModeloDeChecklist|checklistId|GrupoDeChecklist/,
  },
  {
    clausulas: ["5.11.7", "5.11.12"],
    oQue: "evento e agendamento de auditoria, com notificação e cancelamento",
    padrao: /AgendamentoDeAuditoria|EventoDeControleInterno|agendamentoId/,
  },
];

/**
 * ═══ ⚠️ A OUTRA DIREÇÃO DO INSTRUMENTO — O QUE DEIXOU DE FALTAR ═══
 *
 * Uma ausência preenchida some da lista de cima, e some para sempre: nada impediria
 * alguém de apagar o modelo amanhã e o censo voltar a mentir — agora na direção
 * OTIMISTA, que é pior, porque o catálogo diria "pronto" sobre o que não existe mais.
 *
 * Cada linha aqui afirma o CONTRÁRIO da lista de cima: o nome TEM de aparecer no código.
 * Foram promovidas no ENT05, com o lote que as construiu, e é essa a evidência que o
 * catálogo cita.
 */
interface Conquista {
  readonly clausulas: readonly string[];
  readonly oQue: string;
  readonly padrao: RegExp;
  readonly lote: string;
}

const CONQUISTAS: readonly Conquista[] = [
  {
    clausulas: ["5.18.2", "5.18.6", "5.18.8", "5.18.9"],
    oQue: "requisição de material ao almoxarifado, com atendimento parcial",
    padrao: /RequisicaoDeMaterial|ItemDeRequisicaoDeMaterial/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.18.3", "5.18.11"],
    oQue: "posição física derivada e preço médio ponderado",
    padrao: /posicaoDeEstoque|precoMedioDaPosicao|ParametroDeEstoque/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.18.13", "5.18.21"],
    oQue: "depósito como entidade, e o bloqueio por produto, depósito ou o par",
    padrao: /model Deposito\b|BloqueioDeEstoque/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.18.14", "5.18.20"],
    oQue: "lote com validade, e a consulta de vencidos e a vencer",
    padrao: /LoteDeMaterial|validadeDoEstoque/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.18.4", "5.18.10"],
    oQue: "cota mensal por setor, e o setor que consumiu em cada saída",
    padrao: /CotaDeConsumo|consumoNaCompetencia/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.18.12"],
    oQue: "inventário de estoque que bloqueia a movimentação enquanto corre",
    padrao: /InventarioDeEstoque|bloqueiosDoInventario/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.17.2", "5.17.3", "5.17.6", "5.17.8"],
    oQue: "cadastro de material com grupo, unidades N-N, classificação, CATMAT e desabilitação",
    padrao: /model Material\b|MaterialUnidade|GrupoDeMaterial/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.1", "5.19.17", "5.19.20", "5.19.21", "5.19.22"],
    oQue: "inventário de BENS, com comissão, termo e inconsistência derivada",
    padrao: /InventarioDeBens|ContagemDeBem/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.16"],
    oQue: "comissão patrimonial designada, com ato, vigência e membros",
    padrao: /ComissaoPatrimonial|comissaoVigenteEm/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.2"],
    oQue: "etiqueta com código de barras, idempotente",
    padrao: /gerarEtiquetaDeBem|codigoDeBarras/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.11", "5.19.12"],
    oQue: "estado de conservação e situação física, derivados do último movimento",
    padrao: /EstadoDeConservacao|SituacaoFisicaDoBem/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.10", "5.19.27"],
    oQue: "localização, responsável e unidade gestora do bem como movimento derivado",
    padrao: /MovimentoDeGestaoDoBem|bensSobResponsabilidade/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.19", "5.19.28"],
    oQue: "transferência de bem entre entidades, composta e estornável em par",
    padrao: /transferirBemEntreEntidades/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.36", "5.19.37"],
    oQue: "termo de responsabilidade e termo de baixa, com o movimento junto",
    padrao: /TermoPatrimonial|emitirTermoPatrimonial/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.42"],
    oQue: "fórmula de avaliação editável, INTERPRETADA e não avaliada como código",
    padrao: /avaliarFormula|FormulaDeAvaliacao/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.19.30", "5.19.3", "5.19.7"],
    oQue: "motivo de baixa e tipo de incorporação como TABELA configurável",
    padrao: /MotivoDeBaixa|TipoDeIncorporacao/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.17.5", "5.17.9"],
    oQue: "marca pré-aprovada e elemento de despesa do material, com a RECUSA da 5.17.9",
    padrao: /MarcaAprovada|MaterialElementoDespesa/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.17.51", "5.17.52", "5.17.53", "5.17.54", "5.17.56"],
    oQue: "solicitação de compra, com situação DERIVADA dos movimentos e eixo por setor",
    padrao: /SolicitacaoDeCompra|situacaoDaSolicitacao/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.17.46", "5.17.48"],
    oQue: "pesquisa de preços com cotações, e médio/mínimo/máximo derivados",
    padrao: /PesquisaDePrecos|estatisticasDaPesquisa/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.17.96", "5.17.97", "5.17.99", "5.17.100", "5.17.102", "5.17.103", "5.17.105"],
    oQue: "ordem de compra, recebimento com saldo pendente derivado, e a cascata do empenho",
    padrao: /OrdemDeCompra|saldoDaOrdemDeCompra/,
    lote: "ENT05",
  },
  {
    clausulas: ["5.18.16"],
    oQue: "ficha de controle de estoque, com o saldo ANTERIOR ao período",
    padrao: /fichaDeControleDeEstoque/,
    lote: "ENT05",
  },
];

function fontes(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "generated", ".git", ".next"].includes(e.name)) continue;
      achados.push(...fontes(p));
      continue;
    }
    if (!/\.(ts|tsx|prisma)$/.test(e.name)) continue;
    achados.push(p);
  }
  return achados;
}

/**
 * ⚠️ O ESCOPO INCLUI `prisma/schema` DE PROPÓSITO. Quase toda ausência desta lista é
 * ausência de MODELO, e o modelo nasce primeiro: o dia em que `model Inventario` aparecer
 * no schema é o dia em que a cláusula muda de situação — antes de existir caso de uso.
 */
const ARQUIVOS: readonly string[] = [
  ...raizesExistentes(RAIZ, [...RAIZES_DE_ESCRITA]).flatMap((r) => fontes(r)),
  ...fontes(join(RAIZ, "prisma", "schema")),
].filter((p) => !p.includes("censo-de-ausencias"));

/**
 * ⚠️ OS ARQUIVOS QUE APENAS **NOMEIAM** COISAS, E QUE POR ISSO NÃO PROVAM QUE ELAS EXISTEM.
 *
 * O censo de ações do M16 lista, à mão, o nome de cada serviço e de cada leitura — inclusive
 * no `FORA_DO_CENSO`. Isso é PAPELADA sobre um recurso, não o recurso.
 *
 * ⚠️ E ISSO NÃO É TEORIA: a mutação que deveria matar a conquista da 5.18.16 passou
 * verde. Renomeei `fichaDeControleDeEstoque` no serviço, e o padrão continuou casando —
 * com a chave homônima que eu mesmo havia escrito em `acoes.ts`. O guard estava
 * atestando a existência de um leitor pelo formulário que o declara.
 *
 * ⚠️ E a segunda tentativa foi PIOR: troquei o padrão para `saldoAnterior`, um campo do
 * retorno, e ele casou com o Balanço Financeiro do M12, que usa o mesmo nome há lotes.
 * Um padrão genérico não é mais seguro que um específico — é só menos honesto.
 *
 * A lista de cima (AUSENCIAS) NÃO precisa desta exclusão, e é de propósito: lá, um nome
 * que aparece na papelada é exatamente o sinal de que alguém começou a construir a coisa.
 */
const REGISTROS_QUE_SO_NOMEIAM: readonly string[] = [
  "modules/m16-travamento/acoes.ts",
];

describe("censo de ausências do ENT03c", () => {
  it.each(AUSENCIAS.map((a) => [a.oQue, a] as const))(
    "continua ausente: %s",
    (_nome, ausencia) => {
      const achados: string[] = [];
      for (const p of ARQUIVOS) {
        // ⚠️ PROSA NÃO É CÓDIGO — ver `test/prosa.ts`. Este repositório DOCUMENTA o que
        // não tem: a evidência de cada cláusula em `scripts/marcar-catalogo.ts` explica em
        // português que não existe comissão de licitação nem cadastro de produtos. Citar o
        // nome da coisa ausente, numa string ou num comentário, não pode acusar — e
        // acusava: este guard ficava verde sozinho e vermelho na suíte completa.
        for (const [i, linha] of somenteCodigo(readFileSync(p, "utf8")).split("\n").entries()) {
          if (ausencia.padrao.test(linha)) {
            achados.push(`${p.replace(`${RAIZ}/`, "")}:${i + 1}`);
          }
        }
      }

      expect(
        achados,
        `\n\n⚠️ ISTO NÃO É UM DEFEITO — É UMA MARCAÇÃO DESATUALIZADA.\n\n` +
          `O censo do ENT03c mediu e marcou como AUSENTE_CONFIRMADO no catálogo:\n` +
          `  "${ausencia.oQue}"\n` +
          `sustentando as cláusulas ${ausencia.clausulas.join(", ")}.\n\n` +
          `Agora existe código com esse nome. Reavalie as cláusulas acima em\n` +
          `scripts/marcar-catalogo.ts e remova (ou reescreva) a linha correspondente\n` +
          `deste arquivo. Um catálogo que diz "não existe" sobre o que existe faz o\n` +
          `próximo lote reconstruir o que já está pronto.\n\nOnde apareceu:\n`
      ).toEqual([]);
    }
  );

  /**
   * ⚠️ A OUTRA DIREÇÃO: o que foi construído NÃO PODE SUMIR sem que o catálogo saiba.
   */
  it.each(CONQUISTAS.map((c) => [c.oQue, c] as const))(
    "continua existindo: %s",
    (_nome, conquista) => {
      const achou = ARQUIVOS.filter((p) => !REGISTROS_QUE_SO_NOMEIAM.some((r) => p.endsWith(r))).some((p) =>
        somenteCodigo(readFileSync(p, "utf8"))
          .split("\n")
          .some((linha) => conquista.padrao.test(linha))
      );

      expect(
        achou,
        `\n\n⚠️ ISTO TAMBÉM NÃO É UM DEFEITO — É UMA MARCAÇÃO QUE FICOU MENTIROSA.\n\n` +
          `O ${conquista.lote} construiu e o catálogo registrou como presente:\n` +
          `  "${conquista.oQue}"\n` +
          `sustentando as cláusulas ${conquista.clausulas.join(", ")}.\n\n` +
          `O código com esse nome SUMIU. Ou ele foi renomeado — e então este padrão\n` +
          `precisa acompanhar —, ou foi removido, e então as cláusulas acima têm de\n` +
          `voltar a AUSENTE_CONFIRMADO em scripts/marcar-catalogo.ts. Um catálogo que\n` +
          `diz "pronto" sobre o que não existe mais é pior que um que diz "falta":\n` +
          `ninguém vai procurar.\n`
      ).toBe(true);
    }
  );

  /**
   * ⚠️ A LISTA TAMBÉM É VIGIADA CONTRA SI MESMA. Duas linhas com o mesmo padrão, ou uma
   * cláusula citada em duas linhas, seriam ruído que ninguém percebe até precisar confiar.
   *
   * ⚠️ E AS DUAS LISTAS SÃO CONFERIDAS JUNTAS: uma cláusula que estivesse ao mesmo tempo
   * em AUSENCIAS e em CONQUISTAS afirmaria que a mesma coisa existe e não existe.
   */
  it("nenhuma cláusula é sustentada por duas linhas diferentes", () => {
    const vistas = new Map<string, string>();
    const repetidas: string[] = [];
    for (const a of [...AUSENCIAS, ...CONQUISTAS]) {
      for (const c of a.clausulas) {
        const antes = vistas.get(c);
        if (antes !== undefined) repetidas.push(`${c}: "${antes}" e "${a.oQue}"`);
        else vistas.set(c, a.oQue);
      }
    }
    expect(repetidas, "\n\nCláusulas citadas mais de uma vez:\n").toEqual([]);
  });
});
