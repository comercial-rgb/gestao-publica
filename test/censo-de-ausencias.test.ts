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
    clausulas: ["5.18.2", "5.18.6", "5.18.8", "5.18.9", "5.18.24"],
    oQue: "requisição de material ao almoxarifado (e o atendimento parcial dela)",
    padrao: /RequisicaoDeMaterial|RequisicaoAlmoxarifado|requisicaoDeMaterialId/,
  },
  {
    clausulas: ["5.18.3", "5.18.11"],
    oQue: "saldo FÍSICO de estoque e preço médio — o movimento só tem valor",
    padrao: /quantidadeEmEstoque|saldoFisico|estoqueMinimo|precoMedio/,
  },
  {
    clausulas: ["5.18.13", "5.18.21"],
    oQue: "depósito/almoxarifado como entidade, e o bloqueio por depósito",
    padrao: /model Deposito\b|depositoId|bloqueioDeDeposito/,
  },
  {
    clausulas: ["5.18.14", "5.18.20"],
    oQue: "lote e data de validade do material",
    padrao: /dataDeValidade|LoteDeMaterial|validadeDoLote/,
  },
  {
    clausulas: ["5.18.4", "5.18.10"],
    oQue: "cota de consumo por departamento e centro de custo na distribuição",
    padrao: /cotaDeConsumo|CotaDeMaterial|centroDeCustoId/,
  },
  {
    clausulas: ["5.18.23", "5.18.25"],
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
    clausulas: ["5.19.1", "5.19.17", "5.19.18", "5.19.20", "5.19.21", "5.19.22"],
    oQue: "inventário de bens, com termo de abertura e fechamento",
    padrao: /model Inventario\b|inventarioId|termoDeAbertura/,
  },
  {
    clausulas: ["5.19.16"],
    oQue: "comissão designada (reavaliação, depreciação, inventário)",
    padrao: /model Comissao\b|comissaoId|membroDaComissao/,
  },
  {
    clausulas: ["5.19.2"],
    oQue: "etiqueta com código de barras",
    padrao: /codigoDeBarras|codigo_de_barras|gerarEtiquetaDeBem/,
  },
  {
    clausulas: ["5.19.11", "5.19.12"],
    oQue: "estado de conservação e situação física do bem",
    padrao: /estadoDeConservacao|situacaoDoBem|EstadoDeConservacao/,
  },
  {
    clausulas: ["5.19.10", "5.19.14", "5.19.27", "5.19.34"],
    oQue: "localização, responsável e unidade gestora do bem",
    padrao: /localizacaoDoBem|responsavelPeloBem|localizacaoId/,
  },
  {
    clausulas: ["5.19.36", "5.19.37"],
    oQue: "termo de responsabilidade e termo de baixa",
    padrao: /termoDeResponsabilidade|termoDeBaixa/,
  },
  {
    clausulas: ["5.19.19", "5.19.28", "5.19.33"],
    oQue: "transferência de bem entre departamentos e entre entidades",
    padrao: /TRANSFERENCIA_PATRIMONIAL|transferirBem|solicitacaoDeTransferencia/,
  },
  {
    clausulas: ["5.19.38", "5.19.39"],
    oQue: "virada mensal da depreciação em lote (a competência hoje é bem a bem)",
    padrao: /viradaMensalDaDepreciacao|processarViradaPatrimonial/,
  },
  {
    clausulas: ["5.19.42"],
    oQue: "fórmula de avaliação patrimonial editável pelo usuário",
    padrao: /formulaDeAvaliacao|FormulaPatrimonial/,
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
    clausulas: ["5.17.2", "5.17.3", "5.17.5", "5.17.6", "5.17.7", "5.17.8", "5.17.9", "5.17.10", "5.17.11", "5.17.74"],
    oQue: "cadastro de produtos/materiais (e o rol de itens que o reutiliza)",
    padrao: /model Produto\b|model MaterialDeCompra\b|produtoId|catmat|RolDeItens/i,
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
    clausulas: ["5.17.96", "5.17.97", "5.17.98", "5.17.99", "5.17.100", "5.17.101", "5.17.102", "5.17.103", "5.17.105", "5.17.106"],
    oQue: "ordem de compra (ordinária, global, estimativa) e o recebimento dela",
    // ⚠️ `subempenho` FICOU DE FORA do padrão: ele existe, mas como campo do LEIAUTE do
    // TCM-BA (adapters/tribunais/tcm-ba/siga/specs/pag-emp2.ts) — o tribunal pede o número
    // do subempenho e o sistema repete o do empenho, porque subempenho não existe aqui.
    // Achado do censo, não falso positivo: a remessa declara um conceito que o modelo não tem.
    padrao: /OrdemDeCompra|ordemDeCompraId/i,
  },
  {
    clausulas: ["5.17.40", "5.17.41", "5.17.65", "5.17.66", "5.17.104"],
    oQue: "ata de registro de preços, com saldo e validade",
    padrao: /AtaDeRegistro|ataDeRegistroId|RegistroDePreco/,
  },
  {
    clausulas: ["5.17.86", "5.17.87", "5.17.88", "5.17.91", "5.17.92", "5.17.93", "5.17.95"],
    oQue: "cadastro de fornecedor com CRC, sócios, índices contábeis e suspensão",
    padrao: /model Fornecedor\b|fornecedorId|CertificadoDeRegistroCadastral|indiceContabil/,
  },
  {
    clausulas: ["5.17.69", "5.17.70", "5.17.71", "5.17.72", "5.17.73"],
    oQue: "plano anual de licitações, com intenções e adesão",
    padrao: /PlanoAnualDeLicitacoes|IntencaoDeLicitacao|intencaoId/,
  },
  {
    clausulas: ["5.17.46", "5.17.47", "5.17.48"],
    oQue: "pesquisa/planilha de preços e cotação online",
    padrao: /PesquisaDePreco|PlanilhaDePreco|CotacaoDePreco/,
  },
  {
    clausulas: ["5.17.51", "5.17.52", "5.17.53", "5.17.54", "5.17.55", "5.17.56", "5.17.57"],
    oQue: "solicitação e requisição ao Compras, com autorização por centro de custo",
    padrao: /SolicitacaoDeCompra|RequisicaoAoCompras|solicitacaoDeCompraId/,
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
   * ⚠️ A LISTA TAMBÉM É VIGIADA CONTRA SI MESMA. Duas linhas com o mesmo padrão, ou uma
   * cláusula citada em duas linhas, seriam ruído que ninguém percebe até precisar confiar.
   */
  it("nenhuma cláusula é sustentada por duas linhas diferentes", () => {
    const vistas = new Map<string, string>();
    const repetidas: string[] = [];
    for (const a of AUSENCIAS) {
      for (const c of a.clausulas) {
        const antes = vistas.get(c);
        if (antes !== undefined) repetidas.push(`${c}: "${antes}" e "${a.oQue}"`);
        else vistas.set(c, a.oQue);
      }
    }
    expect(repetidas, "\n\nCláusulas citadas mais de uma vez:\n").toEqual([]);
  });
});
