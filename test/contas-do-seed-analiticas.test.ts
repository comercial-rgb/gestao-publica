import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { carregarPlanoOficial } from "../prisma/seed/oficial/pcasp-oficial.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_RESERVADO,
  CONTA_DOTACAO_ADICIONAL,
  CONTA_DOTACAO_INICIAL,
} from "../modules/m01-core-contabil/roteiros.js";
import { TIPOS_CONSIGNACAO } from "../prisma/seed/dados/tipos-consignacao.js";

/**
 * ═══ NENHUMA CONTA QUE A INSTALAÇÃO EXIGE ANALÍTICA É SINTÉTICA NO PLANO OFICIAL ═══
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE, E É UMA HISTÓRIA DE UMA CONTA POR CRASH. A pendência
 * `PREPARADOR-INSTALACAO-LIMPA` foi aberta como "o preparador para no roteiro da sintética
 * 5.2.2.1.1.00.00". Ao consertar aquela, a instalação andou e morreu na seguinte —
 * `2.1.8.8.1.01.00`, do seed das consignações. **Não era uma conta: era uma classe**, e
 * descobri-la uma por vez custa uma instalação inteira por descoberta.
 *
 * ⚠️ E ELA SÓ ERA INVISÍVEL PORQUE OS BANCOS NASCIAM CLONADOS. O `seed:pcasp` mínimo marca
 * como ANALÍTICAS contas que o PCASP tem como sintéticas, e `seed:pcasp-oficial` preserva de
 * propósito a `analitica` de conta que JÁ EXISTE (o cabeçalho dele explica por quê). Enquanto
 * todo banco descendia de um que tinha passado pelo mínimo, a divergência ficava escondida.
 * No primeiro banco realmente limpo, ela apareceu inteira.
 *
 * ⚠️ O QUE SE AFIRMA AQUI É A PROPRIEDADE, e ela não precisa de banco: o plano oficial é lido
 * do arquivo do TCE, o mesmo que `seed:pcasp-oficial` carrega. Uma constante nova apontando para
 * sintética reprova AQUI, na suíte dirigida, em vez de reprovar na instalação de alguém.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/**
 * As contas que a instalação exige analíticas — COLHIDAS DE TODO `prisma/seed/`, não de uma lista
 * de fontes.
 *
 * ⚠️ E A LISTA DE FONTES JÁ FALHOU DUAS VEZES, NO MESMO DIA, NESTE MESMO ARQUIVO. A primeira versão
 * enumerava três fontes (roteiro orçamentário, consignações, roteiros patrimoniais) e declarava a
 * classe "medida" — e a instalação seguinte morreu em `prisma/seed/sagres-poc.ts`. Acrescentada a
 * POC, a instalação morreu em `prisma/seed/roteiros-demo.ts`. Duas descobertas por crash, depois de
 * duas declarações de completude.
 *
 * É a regra do repositório mordendo o instrumento escrito para aplicá-la: *guarda que enumera formas
 * acha só aquelas formas*. Agora a varredura é sobre o DIRETÓRIO: qualquer arquivo de seed que cite
 * um código no formato do PCASP entra, inclusive um criado amanhã por alguém que não leu isto.
 */
const FORMATO_PCASP = /(\d\.\d\.\d\.\d\.\d\.\d\d\.\d\d)/g;

/**
 * ⚠️ TODO ARQUIVO DE `prisma/seed/` ESTÁ CLASSIFICADO AQUI, E É ISSO QUE FECHA A PROPRIEDADE.
 *
 * A pergunta "enumerei todas as fontes?" não tem resposta confiável — ela errou duas vezes neste
 * mesmo arquivo, no mesmo dia, e as duas foram descobertas por uma instalação morrendo. A pergunta
 * foi TROCADA: em vez de listar os arquivos que postam partida, classifica-se **todos**, e um
 * arquivo de seed novo reprova o teste até alguém dizer a que grupo ele pertence.
 *
 * Uma varredura cega de `prisma/seed/` também não serve, e isso foi medido: ela acusa 53 sítios,
 * quase todos legítimos — os seeds que DECLARAM o plano citam as sintéticas porque elas existem no
 * plano, e os de-paras de relatório casam por PREFIXO, que é sintético por definição. Guard que
 * grita onde não há defeito ensina a ignorar o guard.
 */
const POSTA_PARTIDA: readonly string[] = [
  "roteiro-orcamentario.ts",
  "m07-tipos-consignacao.ts",
  "roteiros-patrimoniais.ts",
  "roteiros-demo.ts",
  "sagres-poc.ts",
  "cenario-aceite.ts",
  "backfill-dotacao-inicial.ts",
];

/** Não posta partida — e cada linha diz por quê, porque é a justificativa que envelhece. */
const NAO_POSTA_PARTIDA: Readonly<Record<string, string>> = {
  "pcasp.ts": "DECLARA o plano mínimo: cita sintéticas porque elas são parte da hierarquia.",
  "pcasp-oficial.ts": "carrega o plano oficial inteiro; é a fonte contra a qual os outros são conferidos.",
  "oficial/pcasp-oficial.ts": "leitor do arquivo do TCE — nenhum código escrito à mão.",
  "oficial/procedencia.ts": "só procedência do arquivo (sha256, URL, data).",
  "bootstrap-usuario.ts": "usuário e perfil; nenhuma conta contábil.",
  "cenario-ent02.ts": "setores, assuntos e comunicados do protocolo.",
  "m08-exercicio.ts": "exercício; nenhuma conta.",
  "m02-seed-oficial.ts": "classificações funcionais e de despesa, não contas do PCASP.",
  "m02-auditar-modalidades.ts": "auditoria de leitura.",
  "m02-auditar-subfuncoes.ts": "auditoria de leitura.",
  "m12-depara-rcl.ts": "de-para de RELATÓRIO: casa por PREFIXO, e prefixo é sintético por definição.",
  "m12-depara-orgao-poder.ts": "de-para de relatório, por prefixo.",
  "m12-asps-deparas.ts": "de-para de relatório, por prefixo.",
  "m12-mde-deparas.ts": "de-para de relatório, por prefixo.",
  "m12-diagnostico-deparas.ts": "diagnóstico de leitura dos de-paras.",
  "poc-fila.ts": "POC de fila de pagamento; usa fichas já semeadas.",
  "poc-programacao.ts": "POC de programação; nenhuma conta.",
  "dados/tipos-consignacao.ts": "dado dos tipos — as contas dele entram pela colheita das consignações.",
  "dados/asps-deparas.ts": "de-para de relatório, por prefixo.",
  "dados/depara-orgao-poder.ts": "de-para de relatório, por prefixo.",
  "dados/depara-rcl-anexo3.ts": "de-para de relatório, por prefixo.",
  "dados/mde-deparas.ts": "de-para de relatório, por prefixo.",
  "dados/elementos.ts": "elementos de despesa, não contas.",
  "dados/funcoes.ts": "funções de governo, não contas.",
  "dados/subfuncoes.ts": "subfunções, não contas.",
  "dados/naturezas-despesa.ts": "naturezas de despesa, não contas.",
  "dados/natureza-componentes.ts": "componentes da natureza, não contas.",
  "dados/limites-contratacao.ts": "limites da Lei 14.133, não contas.",
};

function arquivosDeSeed(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) achados.push(...arquivosDeSeed(caminho));
    else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) achados.push(caminho);
  }
  return achados;
}

const RAIZ_SEED = join(RAIZ, "prisma", "seed");
const relativo = (caminho: string): string => caminho.slice(RAIZ_SEED.length + 1);

function exigidasAnaliticas(): ReadonlyMap<string, string> {
  const m = new Map<string, string>();

  // As constantes canônicas moram em `modules/` e entram IMPORTADAS, nunca por texto.
  m.set(CONTA_DOTACAO_INICIAL, "roteiro orçamentário: dotação inicial");
  m.set(CONTA_DOTACAO_ADICIONAL, "roteiro orçamentário: dotação adicional");
  m.set(CONTA_CREDITO_DISPONIVEL, "roteiro orçamentário: crédito disponível");
  m.set(CONTA_CREDITO_RESERVADO, "roteiro orçamentário: crédito reservado");
  for (const t of TIPOS_CONSIGNACAO) m.set(t.contaPassivo, `consignação ${t.codigo}`);

  for (const caminho of arquivosDeSeed(RAIZ_SEED)) {
    const rel = relativo(caminho);
    if (!POSTA_PARTIDA.includes(rel)) continue;
    for (const achado of readFileSync(caminho, "utf8").matchAll(FORMATO_PCASP)) {
      if (!m.has(achado[1]!)) m.set(achado[1]!, rel);
    }
  }
  return m;
}

/**
 * ⚠️ AS TRÊS QUE JÁ SÃO PENDÊNCIA NOMEADA, e a exceção é por CONTA, com o motivo. Nenhuma delas
 * se resolve escolhendo uma filha: a escolha é classificação contábil do ente, e inventá-la aqui
 * seria exatamente o que o repositório proíbe. Os seeds já recusam CADA UMA por si, sem derrubar
 * a instalação — é por isso que elas podem estar aqui sem esconder defeito.
 */
const PENDENCIAS_DECLARADAS: Readonly<Record<string, string>> = {
  [CONTA_DOTACAO_ADICIONAL]:
    "ROTEIRO-CREDITO-ADICIONAL-POR-TIPO — o PCASP particiona por tipo de crédito (suplementar, " +
    "especial, extraordinário) e `RoteiroOrcamentario` é @unique por TipoMovimentoDotacao: há " +
    "lugar para um roteiro só. Apontar para a suplementar lançaria especiais e extraordinários " +
    "como suplementares.",
  [CONTA_CREDITO_RESERVADO]:
    "ROTEIRO-RESERVA-SEM-CONTA — o sistema chama esta conta de 'crédito reservado'; no PCASP ela " +
    "é CREDITO INDISPONÍVEL, com BLOQUEIO, PRE-EMPENHADO e OUTRAS. Qual corresponde à reserva de " +
    "dotação é decisão do ente, com fundamento.",
  "2.1.8.8.1.01.00":
    "CONSIGNACAO-CONTA-SINTETICA — os SETE tipos de consignação apontam para a MESMA conta, " +
    "CONSIGNAÇÕES, que tem trinta analíticas sob ela. Em instalação limpa nenhum tipo é semeado, e " +
    "nenhuma retenção aparece na tela. Escolher uma analítica é classificar a retenção, e isso é " +
    "do ente — o PCASP separa RGPS, IRRF, ISS, pensão e as demais em contas próprias.",
};

/**
 * ⚠️ AS SEIS CONTAS DA POC DO SAGRES — uma pendência só, `SAGRES-POC-CONTA-SINTETICA`.
 *
 * A POC foi escrita contra o plano MÍNIMO, que marcava estas contas como analíticas; no PCASP
 * oficial todas são sintéticas. Nenhuma existe no código de produção — o M05 e o M10 recebem as
 * contas por PARÂMETRO, de quem chama —, então isto é gap de DEMONSTRAÇÃO: o preparador tolera a
 * recusa nomeada e a instalação do ente termina sem a POC.
 *
 * Quitá-la é escolher, para cada uma, a analítica do último nível — classificação contábil que não
 * se faz para destravar um cenário de demonstração.
 */
const CONTAS_DA_POC_SAGRES: readonly string[] = [
  "2.1.3.1.1.00.00", // FORNECEDORES E CONTAS A PAGAR NACIONAIS - CONSOLIDAÇÃO
  "1.2.3.1.1.01.00", // bens móveis
  "1.2.3.2.1.01.00", // bens imóveis
  "1.2.3.8.1.01.00", // depreciação acumulada
  "4.5.9.1.1.00.00", // VPA de incorporação
  "3.3.3.1.1.00.00", // VPD de depreciação
];

describe("as contas que a instalação exige analíticas", () => {
  const { contas } = carregarPlanoOficial();
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));

  it("a colheita não é vazia — senão a regra está desligada e o teste passa por vacuidade", () => {
    // ⚠️ A ÂNCORA. Uma constante renomeada, um regex que deixa de casar, e a varredura seguinte
    // teria zero contas a conferir: verde, e cega.
    const e = exigidasAnaliticas();
    expect(e.size).toBeGreaterThanOrEqual(15);
    expect([...e.keys()]).toContain(CONTA_DOTACAO_INICIAL);
    expect([...e.values()].some((v) => v.includes("roteiros-patrimoniais"))).toBe(true);
    expect([...e.values()].some((v) => v.startsWith("consignação"))).toBe(true);
    expect([...e.values()].some((v) => v.includes("sagres-poc"))).toBe(true);
    expect([...e.values()].some((v) => v.includes("roteiros-demo"))).toBe(true);
  });

  it("todo arquivo de seed está classificado — um novo reprova até alguém dizer a que grupo pertence", () => {
    // ⚠️ ESTA É A ASSERÇÃO QUE FECHA A PROPRIEDADE. Sem ela, um seed novo que poste partida numa
    // sintética simplesmente não seria varrido, e o teste continuaria verde — que é exatamente
    // como `sagres-poc.ts` e `roteiros-demo.ts` escaparam das duas primeiras versões deste arquivo.
    const semClassificacao = arquivosDeSeed(RAIZ_SEED)
      .map(relativo)
      .filter((rel) => !POSTA_PARTIDA.includes(rel) && !(rel in NAO_POSTA_PARTIDA));
    expect(
      semClassificacao,
      "\n\n⚠️ ARQUIVO DE SEED NÃO CLASSIFICADO.\n\n" +
        "Ele posta partida no razão (entra em POSTA_PARTIDA e tem as contas conferidas) ou não " +
        "posta (entra em NAO_POSTA_PARTIDA, com o motivo)? A pergunta não pode ficar sem resposta: " +
        "foi assim que duas instalações morreram descobrindo a fonte que ninguém tinha enumerado." +
        "\n\nSítios:\n"
    ).toEqual([]);
  });

  it("todas existem no plano oficial", () => {
    const ausentes = [...exigidasAnaliticas()]
      .filter(([codigo]) => !porCodigo.has(codigo))
      .map(([codigo, origem]) => `${codigo} (${origem})`);
    expect(
      ausentes,
      "\n\n⚠️ CONTA EXIGIDA PELA INSTALAÇÃO QUE NÃO EXISTE NO PCASP OFICIAL.\n" +
        "Inventar o código não é alternativa: escolha na tabela real.\n\nSítios:\n"
    ).toEqual([]);
  });

  it("nenhuma é SINTÉTICA, salvo as pendências declaradas com motivo", () => {
    const achados: string[] = [];
    for (const [codigo, origem] of exigidasAnaliticas()) {
      const c = porCodigo.get(codigo);
      if (c === undefined || c.analitica) continue;
      if (codigo in PENDENCIAS_DECLARADAS || CONTAS_DA_POC_SAGRES.includes(codigo)) continue;
      const filhas = contas
        .filter((x) => x.codigo.startsWith(codigo.slice(0, 9)) && x.analitica)
        .map((f) => `${f.codigo} ${f.nome}`);
      achados.push(`${codigo} "${c.nome}" (${origem}) — analíticas: ${filhas.join("; ") || "NENHUMA"}`);
    }
    expect(
      achados,
      "\n\n⚠️ CONTA SINTÉTICA ONDE A INSTALAÇÃO EXIGE ANALÍTICA.\n\n" +
        "Conta sintética não recebe partida: o seed recusa aquele roteiro/tipo e o que depende " +
        "dele fica indisponível. Escolha a analítica NA FONTE — ou, se a escolha for do ente, " +
        "declare a pendência com o motivo em PENDENCIAS_DECLARADAS.\n\nSítios:\n"
    ).toEqual([]);
  });

  it("as pendências declaradas continuam sendo REAIS — exceção que virou obsoleta é exceção que esconde", () => {
    // ⚠️ SEM ISTO, o dia em que o TCE publicar um plano em que a conta virou analítica, a exceção
    // continuaria pulando a conferência para sempre, calada.
    for (const codigo of [...Object.keys(PENDENCIAS_DECLARADAS), ...CONTAS_DA_POC_SAGRES]) {
      const c = porCodigo.get(codigo);
      expect(c, `${codigo} saiu do plano oficial — reveja a pendência`).toBeDefined();
      expect(c!.analitica, `${codigo} virou ANALÍTICA no plano: a pendência pode ser quitada`).toBe(false);
    }
  });
});
