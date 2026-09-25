import type { ModoDeSelecao } from "./abrangencia.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * A DECLARAÇÃO DA SELEÇÃO, COMO ELA CHEGA DA TELA — TR 5.12.50 (V12)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * `abrangencia.ts` define o que a seleção É (modo + ids de vínculo). Este arquivo trata do que a
 * TELA entrega: texto digitado por uma pessoa, e um modo que ela escolheu num campo.
 *
 * ═══ ⚠️ POR QUE MATRÍCULA, E NÃO CAIXAS DE SELEÇÃO NA LISTA ═══
 *
 * A ordem do usuário proíbe, em letra, que "a paginação da tela defina silenciosamente quem será
 * calculado". Uma lista paginada com caixas de seleção trai isso pelo caminho mais natural que
 * existe: o formulário envia o que está VISÍVEL, e quem revisa o código lê "os selecionados" sem
 * perceber que são "os selecionados da página 1". O domínio já se defende — o modo é DECLARADO e
 * nunca inferido do tamanho da lista (`abrangencia.ts`) —, mas uma defesa do domínio não conserta
 * uma superfície que mente sobre o que mandou.
 *
 * A declaração por MATRÍCULA é imune por construção: ela é texto que o operador escreveu, existe
 * inteira num campo só, e nenhuma navegação a altera. Trocar de página não muda uma linha dela.
 * A lista paginada continua na tela ao lado, para CONSULTAR — que é o papel dela.
 *
 * ⚠️ E A MATRÍCULA É O IDENTIFICADOR QUE O OPERADOR CONHECE. Pedir `cuid` de vínculo seria pedir
 * que ele copiasse um identificador de banco de dados; a matrícula é o que está no contracheque,
 * no crachá e na conversa do RH.
 */

/** O que a tela declarou, antes de virar `SelecaoDoCalculo`. */
export interface DeclaracaoDaSelecao {
  readonly modo: ModoDeSelecao;
  /** As matrículas digitadas, na ordem em que apareceram, sem repetição e sem vazias. */
  readonly matriculas: readonly string[];
}

export class DeclaracaoDeSelecaoInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "DeclaracaoDeSelecaoInvalidaError";
  }
}

/**
 * Quebra o texto digitado em matrículas. Aceita vírgula, ponto e vírgula e quebra de linha —
 * porque um operador que cola de uma planilha recebe qualquer um dos três, e recusar por causa do
 * separador seria transformar um detalhe de área de transferência em erro de sistema.
 *
 * ⚠️ REPETIDA NÃO É ERRO, É DESCUIDO DE DIGITAÇÃO: colar a mesma matrícula duas vezes não muda o
 * que a pessoa quis dizer. A ordem da primeira ocorrência é preservada para a mensagem de recusa
 * sair na ordem em que ela digitou, e não numa ordem que ela não reconhece.
 */
export function matriculasDeclaradas(texto: string): readonly string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const bruto of texto.split(/[,;\n\r]+/)) {
    const m = bruto.trim();
    if (m === "" || vistas.has(m)) continue;
    vistas.add(m);
    saida.push(m);
  }
  return saida;
}

/**
 * O MODO E AS MATRÍCULAS, CONFERIDOS UM CONTRA O OUTRO.
 *
 * ⚠️ AS DUAS CONTRADIÇÕES SÃO RECUSADAS, E NENHUMA DELAS É "CORRIGIDA EM SILÊNCIO":
 *
 *   · `EXPLICITA` sem matrícula nenhuma — o operador pediu recorte e não disse de quem. Assumir
 *     "então são todos" seria a tela decidindo por ele exatamente a coisa que a ação
 *     `SELECIONAR_VINCULOS_DA_FOLHA` existe para não deixar ninguém decidir sozinho.
 *   · `TODOS_OS_ELEGIVEIS` com matrículas digitadas — a pessoa escreveu nomes e escolheu "todos".
 *     Ignorar o texto calcularia a folha inteira para quem acreditava ter recortado; obedecer o
 *     texto calcularia um recorte para quem declarou "todos". As duas leituras são defensáveis, e
 *     é exatamente por isso que nenhuma pode ser adivinhada.
 */
export function conferirDeclaracao(modoBruto: string, textoDasMatriculas: string): DeclaracaoDaSelecao {
  const matriculas = matriculasDeclaradas(textoDasMatriculas);
  const modo = modoBruto.trim() === "" ? "TODOS_OS_ELEGIVEIS" : modoBruto.trim();
  if (modo !== "TODOS_OS_ELEGIVEIS" && modo !== "EXPLICITA") {
    throw new DeclaracaoDeSelecaoInvalidaError(
      `MODO-DE-SELECAO-DESCONHECIDO: "${modoBruto}" não é um modo de seleção. Os modos são ` +
        `TODOS_OS_ELEGIVEIS (a folha inteira) e EXPLICITA (só as matrículas declaradas). Nada foi calculado.`
    );
  }
  if (modo === "EXPLICITA" && matriculas.length === 0) {
    throw new DeclaracaoDeSelecaoInvalidaError(
      `SELECAO-EXPLICITA-SEM-MATRICULA: você pediu para recortar quem entra no cálculo e não ` +
        `declarou nenhuma matrícula. "Recorte de ninguém" e "folha inteira" são coisas diferentes, e ` +
        `o sistema não escolhe entre elas por você: declare as matrículas, ou mude o modo para ` +
        `TODOS_OS_ELEGIVEIS. Nada foi calculado.`
    );
  }
  if (modo === "TODOS_OS_ELEGIVEIS" && matriculas.length > 0) {
    throw new DeclaracaoDeSelecaoInvalidaError(
      `SELECAO-CONTRADITORIA: o modo declarado é TODOS_OS_ELEGIVEIS (a folha inteira), mas ` +
        `${matriculas.length} matrícula(s) foram digitadas (${matriculas.slice(0, 5).join(", ")}` +
        `${matriculas.length > 5 ? ", …" : ""}). Calcular a folha inteira ignorando o que você ` +
        `escreveu, ou calcular só essas ignorando o modo que você escolheu, são resultados opostos — ` +
        `e adivinhar qual deles você quis é o defeito, não a gentileza. Nada foi calculado.`
    );
  }
  return { modo, matriculas };
}

/**
 * MATRÍCULA → VÍNCULO, COM A RECUSA NOMEANDO QUEM NÃO EXISTE.
 *
 * ⚠️ ELA RECUSA EM VEZ DE CALCULAR OS QUE ACHOU. Uma matrícula digitada errado que fosse apenas
 * descartada produziria uma folha a menos uma pessoa, com total coerente e ninguém acusando — a
 * subtração silenciosa que `abrangencia.ts` descreve, entrando agora pela porta da digitação.
 *
 * ⚠️ E A MATRÍCULA AMBÍGUA TAMBÉM RECUSA. Duas matrículas iguais em vínculos diferentes não podem
 * existir no cadastro, mas se existirem, escolher uma delas seria o sistema decidindo qual pessoa
 * o ente paga.
 */
export function resolverMatriculas(
  matriculas: readonly string[],
  achados: readonly { readonly id: string; readonly matricula: string }[]
): readonly string[] {
  const porMatricula = new Map<string, string[]>();
  for (const v of achados) porMatricula.set(v.matricula, [...(porMatricula.get(v.matricula) ?? []), v.id]);

  const ausentes = matriculas.filter((m) => !porMatricula.has(m));
  if (ausentes.length > 0) {
    throw new DeclaracaoDeSelecaoInvalidaError(
      `MATRICULA-NAO-ENCONTRADA: ${ausentes.length} matrícula(s) declarada(s) não existem no ` +
        `cadastro de pessoal deste ente: ${ausentes.join(", ")}. Calcular sem elas deixaria quem você ` +
        `pediu de fora da folha, com o total fechando e ninguém acusando. Confira a digitação — ` +
        `maiúsculas, hífens e zeros à esquerda contam. Nada foi calculado.`
    );
  }
  const ambiguas = matriculas.filter((m) => (porMatricula.get(m) ?? []).length > 1);
  if (ambiguas.length > 0) {
    throw new DeclaracaoDeSelecaoInvalidaError(
      `MATRICULA-AMBIGUA: ${ambiguas.join(", ")} identifica(m) mais de um vínculo. Escolher um ` +
        `deles seria o sistema decidindo qual pessoa o ente paga. Nada foi calculado.`
    );
  }
  return matriculas.map((m) => (porMatricula.get(m) as string[])[0] as string);
}
