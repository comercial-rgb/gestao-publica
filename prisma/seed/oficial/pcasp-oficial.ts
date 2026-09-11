import { primeiraAba } from "../../../packages/planilha/index.js";
import { lerOficial, type ArquivoOficial } from "./procedencia.js";

/**
 * ═══ O PLANO DE CONTAS OFICIAL — LIDO DO ARQUIVO DO TCE, NÃO DIGITADO ═══
 *
 * ⚠️ A RECUSA QUE ORIGINOU ISTO. No smoke do ENT03c o caminho feliz da dívida fundada e da
 * dívida ativa não passou: faltava roteiro contábil parametrizado, e parametrizá-lo exigia
 * escolher códigos de conta PCASP. Inventar código de conta para um teste passar seria
 * fabricar norma dentro do teste — a recusa estava certa, e o que ela nomeou foi a
 * ausência DESTE arquivo.
 *
 * `ARQUIVO` é o PCASP que a própria seção 2026 do portal do TCE-PB linka. Ele traz 7.864
 * contas para 2025. A partir daqui, escolher a conta de um roteiro é SELECIONAR numa tabela
 * real — e a descrição oficial vai junto, para que a escolha possa ser conferida.
 *
 * ═══ ⚠️ AS DUAS ARMADILHAS DO ARQUIVO, MEDIDAS E TRATADAS AQUI ═══
 *
 * **1. DESCRIÇÕES QUEBRADAS EM DUAS LINHAS — 228 no arquivo, 72 delas em 2025.** Quando a
 * descrição original tinha quebra de linha, quem gerou a planilha emitiu uma SEGUNDA linha
 * contendo o resto do texto na coluna A e os dois indicadores deslocados para B e C. Lida
 * ingenuamente, a conta `352159900` fica "OUTRAS DISTRIBUIÇÕES CONSTITUCIONAL OU" e surge
 * uma conta fantasma de código "0" chamada "0". A linha de continuação é reconhecida por
 * NÃO ter ano válido na coluna A, e é costurada de volta na anterior.
 *
 * **2. CADA CONTA DE 2025 APARECE DUAS VEZES.** São 15.728 linhas para 7.864 contas. A
 * duplicata é idêntica, então a deduplicação é segura — mas um `createMany` ingênuo
 * estouraria na chave única e um laço de `create` criaria metade das contas antes de
 * morrer, deixando o banco pela metade.
 *
 * ═══ ⚠️ O QUE O ARQUIVO **NÃO** TEM, E POR ISSO NÃO SE INVENTA ═══
 *
 * **`naturezaSaldo` não está no arquivo.** Ela é DERIVADA por regra do MCASP, não chutada:
 * a classe define o saldo (1,3,5,7 devedoras; 2,4,6,8 credoras) e a conta RETIFICADORA o
 * inverte. O MCASP marca retificadora com o prefixo `(-)` na descrição, e o arquivo traz
 * 549 delas. Uma derivação por classe sem tratar o `(-)` poria "DEVEDORA" na depreciação
 * acumulada — e o balanço somaria onde deveria subtrair.
 *
 * **`indicadorSuperavit` (F/P) não está no arquivo.** Fica nulo. Uma letra chutada aqui
 * classificaria errado o superávit financeiro na abertura do exercício seguinte.
 *
 * **`exige_retencao` está zerado em TODAS as 2025.** A coluna existe e é usada em 2022,
 * 2023 e 2024 (42 contas em 2024); no bloco de 2025 ela é zero em tudo — embora o
 * `LEIA-ME.md` anuncie o arquivo como "contém 'Exige Retenção?'". Como `ContaPcasp` não
 * tem coluna para isso, nada se perde hoje; fica REGISTRADO para quando a retenção
 * automática do M07 precisar da marca, e a resposta será ler o bloco de 2024, nomeando.
 */

export const ARQUIVO = "Pcasp_2025.xlsx";

/** O ano do bloco a importar. O arquivo traz 2020 a 2025 na mesma aba. */
export const EXERCICIO_VIGENTE = "2025";

const ANOS_CONHECIDOS = new Set(["2020", "2021", "2022", "2023", "2024", "2025"]);

export type NaturezaSaldo = "DEVEDORA" | "CREDORA";

export interface ContaOficial {
  /** No formato do sistema: `1.1.1.1.2.00.00`. */
  readonly codigo: string;
  /** Como veio no arquivo: `111112000`. Guardado para poder reconferir a origem. */
  readonly codigoOficial: string;
  readonly nome: string;
  readonly naturezaSaldo: NaturezaSaldo;
  readonly nivel: number;
  readonly analitica: boolean;
  readonly retificadora: boolean;
  /** O código (formato do sistema) da conta pai, ou `null` na raiz. */
  readonly codigoPai: string | null;
}

/**
 * `111112000` -> `1.1.1.1.2.00.00`. Os cinco primeiros dígitos são níveis de um dígito; os
 * quatro últimos, dois grupos de dois.
 */
export function formatarCodigo(bruto: string): string {
  if (!/^\d{9}$/.test(bruto)) {
    throw new Error(`Código de conta fora do formato de 9 dígitos: "${bruto}".`);
  }
  const d = [...bruto];
  return `${d[0]}.${d[1]}.${d[2]}.${d[3]}.${d[4]}.${d[5]}${d[6]}.${d[7]}${d[8]}`;
}

/** Os sete segmentos, como números — para achar onde a conta termina. */
function segmentos(bruto: string): readonly number[] {
  return [
    Number(bruto[0]),
    Number(bruto[1]),
    Number(bruto[2]),
    Number(bruto[3]),
    Number(bruto[4]),
    Number(bruto.slice(5, 7)),
    Number(bruto.slice(7, 9)),
  ];
}

/** O nível é a posição do ÚLTIMO segmento significativo. `1.1.0.0.0.00.00` é nível 2. */
export function nivelDe(bruto: string): number {
  const s = segmentos(bruto);
  for (let i = s.length - 1; i >= 0; i--) if (s[i] !== 0) return i + 1;
  return 1;
}

/** O código do ancestral imediato, ou `null` se a conta já é de classe. */
export function codigoOficialDoPai(bruto: string): string | null {
  const nivel = nivelDe(bruto);
  if (nivel <= 1) return null;
  const s = [...segmentos(bruto)];
  s[nivel - 1] = 0;
  return (
    `${s[0]}${s[1]}${s[2]}${s[3]}${s[4]}` +
    `${String(s[5]).padStart(2, "0")}${String(s[6]).padStart(2, "0")}`
  );
}

/**
 * A NATUREZA DO SALDO, por regra do MCASP — não está no arquivo.
 *
 * ⚠️ O `(-)` NÃO É ENFEITE DE TEXTO: é como o MCASP marca conta retificadora, e ela tem
 * saldo INVERTIDO ao da sua classe. "(-) DEPRECIAÇÃO ACUMULADA" é conta do ATIVO com saldo
 * CREDOR; tratá-la como devedora faria o imobilizado somar a depreciação em vez de abatê-la.
 */
export function naturezaDe(codigoOficial: string, nome: string): NaturezaSaldo {
  const classe = Number(codigoOficial[0]);
  const devedoraPorClasse = classe === 1 || classe === 3 || classe === 5 || classe === 7;
  const retificadora = ehRetificadora(nome);
  const devedora = retificadora ? !devedoraPorClasse : devedoraPorClasse;
  return devedora ? "DEVEDORA" : "CREDORA";
}

export function ehRetificadora(nome: string): boolean {
  return nome.trimStart().startsWith("(-)");
}

/**
 * As linhas cruas do bloco do exercício, já com as descrições quebradas costuradas e as
 * duplicatas removidas. Exportada para que o teste possa medir as duas armadilhas.
 */
export function linhasDoExercicio(
  grade: readonly (readonly string[])[],
  exercicio: string = EXERCICIO_VIGENTE
): readonly { readonly codigo: string; readonly nome: string }[] {
  const costuradas: { ano: string; codigo: string; nome: string }[] = [];

  for (const linha of grade) {
    const a = (linha[0] ?? "").trim();
    if (ANOS_CONHECIDOS.has(a)) {
      costuradas.push({
        ano: a,
        codigo: (linha[1] ?? "").trim(),
        nome: (linha[2] ?? "").trim(),
      });
      continue;
    }
    // ⚠️ A LINHA DE CONTINUAÇÃO. Sem ano na coluna A e com a anterior já lida, o que está
    // em A é o RESTO DA DESCRIÇÃO da conta de cima — não uma conta nova.
    const anterior = costuradas[costuradas.length - 1];
    if (anterior !== undefined && a !== "" && a !== "ano_conta") {
      anterior.nome = `${anterior.nome} ${a}`.replace(/\s+/g, " ").trim();
    }
  }

  const vistos = new Map<string, string>();
  for (const l of costuradas) {
    if (l.ano !== exercicio) continue;
    if (!/^\d{9}$/.test(l.codigo)) continue;
    const jaVisto = vistos.get(l.codigo);
    if (jaVisto !== undefined && jaVisto !== l.nome) {
      throw new Error(
        `A conta ${l.codigo} aparece duas vezes em ${exercicio} com descrições ` +
          `DIFERENTES:\n  "${jaVisto}"\n  "${l.nome}"\n` +
          `A deduplicação só é segura enquanto as repetições são idênticas.`
      );
    }
    vistos.set(l.codigo, l.nome);
  }
  return [...vistos].map(([codigo, nome]) => ({ codigo, nome }));
}

/** O plano inteiro, derivado e pronto para semear — em ordem de código. */
export function planoOficial(
  grade: readonly (readonly string[])[],
  exercicio: string = EXERCICIO_VIGENTE
): readonly ContaOficial[] {
  const linhas = linhasDoExercicio(grade, exercicio);
  const existentes = new Set(linhas.map((l) => l.codigo));

  // ⚠️ ANALÍTICA = FOLHA, e folha se define pelo CONJUNTO, não pelo código isolado: uma
  // conta é sintética quando alguma outra a tem como pai. O adapter recusa partida em
  // sintética (INVARIANTE 5), então errar isto aqui trava lançamento legítimo.
  const temFilha = new Set<string>();
  for (const l of linhas) {
    const pai = codigoOficialDoPai(l.codigo);
    if (pai !== null && existentes.has(pai)) temFilha.add(pai);
  }

  return linhas
    .map((l) => {
      // O pai declarado só vale se ele EXISTE no plano; senão a conta é tratada como raiz
      // da sua sub-árvore, e a hierarquia não fica apontando para o vazio.
      let pai = codigoOficialDoPai(l.codigo);
      while (pai !== null && !existentes.has(pai)) pai = codigoOficialDoPai(pai);
      return {
        codigo: formatarCodigo(l.codigo),
        codigoOficial: l.codigo,
        nome: l.nome,
        naturezaSaldo: naturezaDe(l.codigo, l.nome),
        nivel: nivelDe(l.codigo),
        analitica: !temFilha.has(l.codigo),
        retificadora: ehRetificadora(l.nome),
        codigoPai: pai === null ? null : formatarCodigo(pai),
      };
    })
    .sort((a, b) => a.codigoOficial.localeCompare(b.codigoOficial));
}

/** Lê o arquivo oficial (conferindo o sha256) e devolve o plano derivado. */
export function carregarPlanoOficial(exercicio: string = EXERCICIO_VIGENTE): {
  readonly contas: readonly ContaOficial[];
  readonly procedencia: ArquivoOficial;
} {
  const { conteudo, procedencia } = lerOficial(ARQUIVO);
  return { contas: planoOficial(primeiraAba(conteudo), exercicio), procedencia };
}
