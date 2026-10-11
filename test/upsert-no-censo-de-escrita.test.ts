import { describe, expect, it } from "vitest";
import { ESCRITA_MUTAVEL_DO_RUNTIME } from "../prisma/papel-runtime.js";
import { escritasMutaveis } from "./varredura-de-escrita.js";

/**
 * V39 — TODO `upsert` QUE ATUALIZA COLUNA TEM A COLUNA NO CENSO DE ESCRITA DO PAPEL DE RUNTIME.
 *
 * ⚠️ O DEFEITO QUE ISTO VIGIA FOI MEDIDO EM PRODUÇÃO (10/10/2026): "permission denied for table
 * JustificativaDePendencia". O `upsert` do Prisma vira `INSERT ... ON CONFLICT DO UPDATE`, e o Postgres exige o
 * privilégio de UPDATE nas colunas do SET JÁ NO PRIMEIRO uso, mesmo sem conflito. O servidor de desenvolvimento conecta
 * como dono e nunca acusou; a suíte semeia como dono e chama o domínio como dono. Em produção, justificar pendência da
 * conciliação nunca funcionou.
 *
 * Propriedade, não lista: o teste VARRE o código de produção (modules, lib, app, adapters), acha cada `.upsert(`, lê as
 * chaves do `update: { ... }` e exige que cada uma esteja em `ESCRITA_MUTAVEL_DO_RUNTIME[Modelo].update`. `update: {}`
 * (só "criar se não existe") não pede UPDATE de coluna nenhuma e passa.
 */

/** V39-R3 — a varredura é a de `varredura-de-escrita.ts` (o mesmo leitor da guarda do `update`). */
export function upsertsQueAtualizam(): { readonly onde: string; readonly modelo: string; readonly colunas: readonly string[] }[] {
  return escritasMutaveis().filter((x) => x.op === "upsert");
}

describe("V39 — upsert e o censo de escrita do papel de runtime", () => {
  it("a varredura acha os upserts que atualizam (senão o teste passaria por vacuidade)", () => {
    const modelos = upsertsQueAtualizam().map((a) => a.modelo);
    expect(modelos).toContain("JustificativaDePendencia");
    expect(modelos.length).toBeGreaterThanOrEqual(3);
  });

  it("toda coluna atualizada por upsert está no censo de escrita do runtime", () => {
    const faltas = upsertsQueAtualizam().flatMap((a) =>
      a.colunas
        .filter((c) => !(ESCRITA_MUTAVEL_DO_RUNTIME[a.modelo]?.update ?? []).includes(c))
        .map((c) => `${a.onde} ${a.modelo}.${c}`)
    );
    expect(faltas).toEqual([]);
  });
});
