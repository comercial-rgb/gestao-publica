import { describe, expect, it } from "vitest";
import { TODAS_AS_ACOES } from "./acoes.js";
import { derivaDePerfil, explicarDeriva } from "./deriva-de-perfil.js";

/**
 * ⚠️ O INSTRUMENTO NASCE COM A PROVA DE QUE ACUSA, NAS DUAS DIREÇÕES.
 *
 * Um detector de deriva que nunca acusa passa despercebido para sempre — é decoração com
 * aparência de rede. Um que acusa sempre é desligado na primeira semana. Metade destes
 * testes prova a acusação, metade prova o silêncio legítimo.
 *
 * ⚠️ E O CASO REAL ESTÁ AQUI DENTRO. O último teste reproduz exatamente a medição do ENT06:
 * um perfil com as ações de antes do ENT05 e sem as 38 que ele acrescentou.
 */
describe("a deriva entre o censo e o que os perfis concedem", () => {
  it("acusa: ação do censo que nenhum perfil concede", () => {
    const semUma = TODAS_AS_ACOES.filter((a) => a !== "REGISTRAR_SAIDA_FISICA");
    const d = derivaDePerfil(semUma);

    expect(d.semPerfil).toEqual(["REGISTRAR_SAIDA_FISICA"]);
    expect(d.foraDoCenso).toEqual([]);
    expect(explicarDeriva(d)).toContain("REGISTRAR_SAIDA_FISICA");
    expect(explicarDeriva(d)).toContain("ninguém");
  });

  it("acusa: permissão concedida que NÃO está mais no censo", () => {
    // O resíduo de uma ação renomeada. Ele não aparece em tela nenhuma, não tem serviço, e
    // continua no banco parecendo poder.
    const d = derivaDePerfil([...TODAS_AS_ACOES, "REGISTRAR_SAIDA_ANTIGA"]);

    expect(d.semPerfil).toEqual([]);
    expect(d.foraDoCenso).toEqual(["REGISTRAR_SAIDA_ANTIGA"]);
    expect(explicarDeriva(d)).toContain("FORA DO CENSO");
  });

  it("acusa os DOIS lados ao mesmo tempo — é o caso de uma ação renomeada", () => {
    const renomeada = TODAS_AS_ACOES.filter((a) => a !== "BLOQUEAR_ESTOQUE");
    const d = derivaDePerfil([...renomeada, "BLOQUEAR_ALMOXARIFADO"]);

    expect(d.semPerfil).toEqual(["BLOQUEAR_ESTOQUE"]);
    expect(d.foraDoCenso).toEqual(["BLOQUEAR_ALMOXARIFADO"]);
  });

  it("NÃO acusa quando o censo e as concessões batem — inclusive com duplicatas", () => {
    // Duplicata é o caso normal: a mesma ação concedida a dois perfis, ou a um perfil com
    // recorte por unidade gestora. Contar linhas em vez de ações acusaria isso como deriva.
    const d = derivaDePerfil([...TODAS_AS_ACOES, ...TODAS_AS_ACOES]);

    expect(d.semPerfil).toEqual([]);
    expect(d.foraDoCenso).toEqual([]);
    expect(d.totalConcedido).toBe(TODAS_AS_ACOES.length);
    expect(explicarDeriva(d)).toContain("batem");
  });

  it("NÃO acusa por ORDEM: a concessão desordenada é a mesma concessão", () => {
    const embaralhada = [...TODAS_AS_ACOES].reverse();
    expect(derivaDePerfil(embaralhada).semPerfil).toEqual([]);
  });

  it("acusa com lista VAZIA — um banco sem permissão nenhuma é a pior deriva, não a menor", () => {
    const d = derivaDePerfil([]);
    expect(d.semPerfil).toHaveLength(TODAS_AS_ACOES.length);
    expect(d.totalConcedido).toBe(0);
  });

  /**
   * ⚠️ O CASO MEDIDO NO ENT06, e a razão de este arquivo existir.
   *
   * O banco de desenvolvimento tinha 185 permissões contra 223 ações do censo. As 38 de
   * diferença eram TODAS as do ENT05 — e o efeito não era um erro de tela: era a tela não
   * existir para quem usa, sem mensagem, sem log, sem nada que denunciasse.
   */
  it("reproduz a medição do ENT06: o perfil de antes do lote não alcança o lote", () => {
    const doEnt05: readonly string[] = [
      "CADASTRAR_DEPOSITO",
      "CADASTRAR_MATERIAL",
      "REGISTRAR_SAIDA_FISICA",
      "ABRIR_INVENTARIO_DE_ESTOQUE",
      "EMITIR_TERMO_PATRIMONIAL",
      "EMITIR_ORDEM_DE_COMPRA",
      "REPONTAR_CONTA",
    ];
    const perfilAntigo = TODAS_AS_ACOES.filter((a) => !doEnt05.includes(a));
    const d = derivaDePerfil(perfilAntigo);

    // ⚠️ A COMPARAÇÃO É POR CONJUNTO, e a ordem do resultado segue o CENSO, não a lista
    // que o teste escreveu. É de propósito: o censo é agrupado por módulo, e um relatório
    // de deriva na ordem do censo se lê por domínio ("o M10 inteiro está fora") em vez de
    // na ordem acidental em que alguém digitou a consulta.
    expect([...d.semPerfil].sort()).toEqual([...doEnt05].sort());
    expect(explicarDeriva(d)).toContain("a tela existe e ninguém a alcança");
  });
});
