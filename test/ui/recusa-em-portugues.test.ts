import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { mensagemDoErro, paraLeituraHumana } from "../../lib/portas/mensagem-do-erro.js";

/**
 * A RECUSA QUE O OPERADOR LÊ — sem o vocabulário de dentro da casa.
 *
 * ═══ O QUE ISTO EXISTE PARA IMPEDIR ═══
 * As recusas do domínio nascem NOMEADAS, e o nome é útil: é o que se procura no log e o que o teste
 * de negação afirma. Só que a frase inteira chegava crua ao `<p role="alert">` do formulário —
 * levantamento antes da apresentação encontrou a cadeia completa:
 *
 *   `modules/m11-licitacoes/acesso-da-fiscalizacao.ts` lança
 *   "DEFINICAO-JA-REVOGADA: outra revogação foi gravada no mesmo instante. Nada foi gravado."
 *   → `lib/portas/contrato-acompanhado.ts` repassa
 *   → `app/(areas)/licitacoes/fiscalizacao/actions.ts` devolve em `estado.erro`
 *   → o formulário imprime a string inteira.
 *
 * O servidor municipal lia `DEFINICAO-JA-REVOGADA` antes da explicação em português que vinha logo
 * depois dos dois pontos. E há centenas dessas em todo módulo de escrita.
 *
 * ⚠️ A CORREÇÃO É NA FRONTEIRA, NÃO NOS SERVIÇOS, e a escolha é deliberada: reescrever cada `throw`
 * perderia o rótulo que log e teste usam, e a próxima recusa escrita nasceria com o rótulo de novo.
 * A fronteira é UMA.
 */

describe("a recusa em português — o rótulo interno não vai à tela", () => {
  it("⚠️ o rótulo em caixa alta com hífens sai, e a frase em português fica", () => {
    expect(
      paraLeituraHumana(
        "DEFINICAO-JA-REVOGADA: outra revogação foi gravada no mesmo instante. Nada foi gravado."
      )
    ).toBe("outra revogação foi gravada no mesmo instante. Nada foi gravado.");
  });

  it("o rótulo com ESPAÇOS e acento também sai", () => {
    expect(paraLeituraHumana("ANO FORA DO QUADRIÊNIO: 2030 não está entre 2026 e 2029.")).toBe(
      "2030 não está entre 2026 e 2029."
    );
  });

  it("o nome de constraint do banco entre parênteses sai de dentro da frase", () => {
    const vinda = paraLeituraHumana(
      "ALTERAÇÃO RECUSADA na previsão de receita: Previsão de receita ficaria -500.000,00, e " +
        "valor negativo é recusado na linha aprovada (ck_previsao_receita_ppa_nao_negativa). O " +
        "ajuste não foi gravado."
    );
    expect(vinda).not.toMatch(/ck_/);
    // ⚠️ E O QUE IMPORTA CONTINUA LÁ: o valor, o motivo e a garantia de que nada foi gravado.
    expect(vinda).toMatch(/-500\.000,00/);
    expect(vinda).toMatch(/valor negativo é recusado/);
    expect(vinda).toMatch(/não foi gravado/);
  });

  /**
   * ⚠️ O CASO QUE UM "STRIP" INGÊNUO ESTRAGA. Frase normal em português tem dois pontos no meio
   * (uma lista, uma explicação) e NÃO é rótulo. Se ela fosse cortada, a tela perderia a metade
   * informativa e ninguém saberia por quê.
   */
  it("frase comum com dois pontos NÃO é cortada", () => {
    const frase = "Plano plurianual abc123 não existe.";
    expect(paraLeituraHumana(frase)).toBe(frase);

    const comLista = "Informe os campos: número do ato, data e fundamento.";
    expect(paraLeituraHumana(comLista)).toBe(comLista);

    const comDoisPontosNoMeio =
      "A fonte 500 não está no rol da conta 001: acrescente a fonte antes de movimentar.";
    expect(paraLeituraHumana(comDoisPontosNoMeio)).toBe(comDoisPontosNoMeio);
  });

  it("⚠️ recusa que é SÓ o rótulo devolve o rótulo — nunca o vazio", () => {
    expect(paraLeituraHumana("EMPENHO-JA-ANULADO:")).toBe("EMPENHO-JA-ANULADO:");
    expect(paraLeituraHumana("")).toBe("");
  });

  it("o alerta e o espaço antes do rótulo não sobram na tela", () => {
    expect(paraLeituraHumana("⚠️ SALDO-INSUFICIENTE: a dotação não cobre o valor.")).toBe(
      "a dotação não cobre o valor."
    );
  });

  it("mensagemDoErro limpa o Error do domínio e mantém a forma do Zod", () => {
    expect(mensagemDoErro(new Error("FOLHA-JA-FECHADA: a competência já foi encerrada."), "x")).toBe(
      "a competência já foi encerrada."
    );

    // ⚠️ O Zod continua uma linha por campo, COM o nome do campo na frente — é ele que diz ao
    // operador ONDE corrigir. O que muda é que a mensagem de cada campo também é limpa.
    const r = z
      .object({ ano: z.number().int().min(1900, "ANO INVÁLIDO: informe um ano de quatro dígitos.") })
      .safeParse({ ano: 12 });
    expect(r.success).toBe(false);
    const texto = mensagemDoErro(r.error as ZodError, "x");
    expect(texto).toBe("ano: informe um ano de quatro dígitos.");
  });

  it("valor que não é Error devolve o padrão de quem chamou", () => {
    expect(mensagemDoErro("um texto solto", "Não foi possível gravar.")).toBe(
      "Não foi possível gravar."
    );
  });
});
