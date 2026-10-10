import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ESCRITA_MUTAVEL_DO_RUNTIME } from "../prisma/papel-runtime.js";

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

const RAIZES = ["modules", "lib", "app", "adapters"];

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === "node_modules" || nome === "generated") continue;
      saida.push(...arquivos(p));
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

/** O texto entre a chave que abre em `inicio` e a que a fecha. */
function bloco(texto: string, inicio: number): string {
  let nivel = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    if (texto[i] === "{") nivel += 1;
    else if (texto[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return texto.slice(inicio + 1, i);
    }
  }
  return "";
}

/** As chaves de primeiro nível de um objeto literal (o conteúdo entre as chaves). */
function chavesDoTopo(conteudo: string): string[] {
  const chaves: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const c of conteudo) {
    if ("{([".includes(c)) nivel += 1;
    else if ("})]".includes(c)) nivel -= 1;
    if (nivel === 0 && c === ",") {
      chaves.push(atual);
      atual = "";
    } else atual += c;
  }
  chaves.push(atual);
  return chaves.map((t) => /^\s*(?:\.\.\.)?([A-Za-z_]\w*)/.exec(t)?.[1] ?? "").filter((k) => k !== "");
}

export function upsertsQueAtualizam(): { readonly onde: string; readonly modelo: string; readonly colunas: readonly string[] }[] {
  const achados: { onde: string; modelo: string; colunas: string[] }[] = [];
  for (const raiz of RAIZES) {
    for (const arq of arquivos(raiz)) {
      const t = readFileSync(arq, "utf8");
      for (const m of t.matchAll(/\.(\w+)\.upsert\(\s*\{/g)) {
        const corpo = bloco(t, (m.index ?? 0) + m[0].length - 1);
        const u = /(^|[\s,{])update:\s*\{/m.exec(corpo);
        if (u === null) continue;
        const colunas = chavesDoTopo(bloco(corpo, u.index + u[0].length - 1));
        if (colunas.length === 0) continue;
        const modelo = (m[1] ?? "").charAt(0).toUpperCase() + (m[1] ?? "").slice(1);
        achados.push({ onde: `${arq}:${String(t.slice(0, m.index).split("\n").length)}`, modelo, colunas });
      }
    }
  }
  return achados;
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
