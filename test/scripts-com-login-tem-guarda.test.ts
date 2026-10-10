import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * V39-R2 (R2-003) — TODO SCRIPT QUE DIGITA UMA SENHA PASSA PELA GUARDA DE DESTINO ANTES.
 *
 * A guarda (`scripts/destino-do-percurso.ts`) recusa destino remoto não declarado e base que o banco não declara de
 * demonstração ou ensaio, antes de qualquer credencial. Na V39 ela estava só no `entrar` comum; a auditoria achou 46
 * scripts com login próprio sem ela. Propriedade, não lista: o teste varre `scripts/` e cobra, de cada arquivo que
 * digita `input[name="senha"]`, a guarda chamada no topo (\`await exigirDestinoDoPercurso(BASE)\`) ou o `entrar` comum.
 */
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.m?ts$/.test(n) ? [p] : [];
  });
}

const comLogin = arquivos("scripts").filter((f) => /name=\\?"senha\\?"/.test(readFileSync(f, "utf8")) && !/destino-do-percurso\.ts$|percursos-navegador\.ts$/.test(f));

describe("V39-R2 — os scripts com login passam pela guarda de destino", () => {
  it("a varredura acha os scripts com login (senão o teste passaria por vacuidade)", () => {
    expect(comLogin.length).toBeGreaterThanOrEqual(40);
  });

  it("cada um chama a guarda no topo, depois de definir o destino, ou usa o entrar comum", () => {
    const semGuarda = comLogin.filter((f) => {
      const s = readFileSync(f, "utf8");
      const usaEntrarComum = /import \{[^}]*\bentrar\b[^}]*\} from "[./]+percursos-navegador/.test(s);
      const guardaNoTopo = /^await exigirDestinoDoPercurso\(BASE\);$/m.test(s);
      return !usaEntrarComum && !guardaNoTopo;
    });
    expect(semGuarda).toEqual([]);
  });
});
