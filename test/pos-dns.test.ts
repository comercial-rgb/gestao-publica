import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ═══ O INSTRUMENTO DE ACEITE DA PUBLICAÇÃO, PROVADO (V10 T5) ═══
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE. `scripts/pos-dns.sh` é um GUARD: ele diz se o que está no ar é
 * o que foi validado. A regra desta casa é que **instrumento nasce com a prova de que acusa** —
 * e já houve quatro defeitos dentro de instrumentos de medição neste repositório. A versão
 * anterior deste script aceitava não encontrar o identificador do build e mesmo assim terminava
 * dizendo que cobria o aceite PUBLICADA: um guard que aprova o que não conferiu.
 *
 * ⚠️ NAS DUAS DIREÇÕES. Cada caso abaixo tem o par: o estado que deve REPROVAR, e o estado
 * correto que deve APROVAR. Um teste que só vê vermelho não prova que o verde é alcançável.
 *
 * ⚠️ E SEM TOCAR NO MUNDO. O resolvedor é um script de mentira; o servidor é local; nenhum
 * certificado público é emitido e nenhum ambiente de terceiro é consultado. As costuras
 * (`POS_DNS_*`) só existem com `POS_DNS_MODO_TESTE=1`, e o teste C0 prova que sem ela o script
 * não as honra.
 */

const executar = promisify(execFile);
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(RAIZ, "scripts", "pos-dns.sh");

const NOME = "gestao.exemplo.invalido";
const IP = "203.0.113.10";
const CANDIDATO = "abc1234+deadbeefcafe";

/**
 * ⚠️ DOIS SERVIDORES, e não um. O script confere coisas DIFERENTES em claro e em seguro: no
 * claro, que a área autenticada NÃO seja servida; no seguro, que as rotas públicas abram e as
 * autenticadas fechem. Um servidor só para os dois faria `/login` responder 200 em claro em
 * todos os casos — e a primeira versão deste teste caiu exatamente nisso: o caso da identidade
 * ausente reprovava por exposição indevida, que não era o que ele afirmava.
 */
let seguro: Server;
let claro: Server;
let portaSegura = 0;
let portaClara = 0;
let dir = "";

/** O que o servidor de mentira responde — trocado por cada caso. */
const estado = {
  candidato: CANDIDATO as string | null,
  statusDasPublicas: 200,
  /** As rotas autenticadas respondem o quê? Por padrão, o redirecionamento para o login. */
  autenticadas: "redireciona" as "redireciona" | "abre",
  /** `/login` em claro — o caso da exposição indevida. */
  loginEmClaroAbre: false,
};

function resolvedorDeMentira(saida: string, codigo = 0): string {
  const caminho = join(dir, `resolvedor-${Math.random().toString(36).slice(2)}.sh`);
  // ⚠️ `cat <<'FIM'`, e NÃO `printf '%s'`. `%s` não interpreta `\n`: a primeira versão deste
  // helper escrevia a barra e o "n" literais, o endereço não casava com o padrão de IP, e TODOS
  // os casos caíam em DNS_PENDENTE — inclusive o positivo. O teste acusou, e o defeito era do
  // próprio instrumento de teste.
  writeFileSync(caminho, `#!/usr/bin/env bash\ncat <<'FIM'\n${saida}FIM\nexit ${codigo}\n`);
  chmodSync(caminho, 0o755);
  return caminho;
}

interface Resultado {
  readonly codigo: number;
  readonly saida: string;
}

async function rodar(overrides: Readonly<Record<string, string>>, args: readonly string[] = []): Promise<Resultado> {
  const base = `http://127.0.0.1:${portaSegura}`;
  const baseClaro = `http://127.0.0.1:${portaClara}`;
  try {
    const { stdout, stderr } = await executar(
      "bash",
      [SCRIPT, "--nome", NOME, "--ip", IP, "--candidato", CANDIDATO, ...args],
      {
        env: {
          ...process.env,
          POS_DNS_MODO_TESTE: "1",
          POS_DNS_BASE: base,
          POS_DNS_BASE_HTTP: baseClaro,
          POS_DNS_RESOLVEDOR: resolvedorDeMentira(`${IP}\n`),
          ...overrides,
        },
      }
    );
    return { codigo: 0, saida: `${stdout}${stderr}` };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { codigo: err.code ?? -1, saida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

async function subir(servidor: Server): Promise<number> {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", () => pronto()));
  return (servidor.address() as { port: number }).port;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pos-dns-"));

  // O servidor "seguro" — o que responderia em HTTPS numa instalação real.
  seguro = createServer((req, res) => {
    const caminho = (req.url ?? "/").split("?")[0] ?? "/";
    if (caminho === "/release") {
      const corpo = JSON.stringify({ candidato: estado.candidato, commit: "abc1234", ambiente: "homologacao" });
      res.writeHead(estado.candidato === null ? 503 : 200, { "content-type": "application/json" });
      res.end(corpo);
      return;
    }
    if (["/licenciamento", "/receita/lancamentos", "/administracao/usuarios"].includes(caminho)) {
      if (estado.autenticadas === "abre") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body>area autenticada aberta</body></html>");
        return;
      }
      res.writeHead(307, { location: `/login?retorno=${caminho}` });
      res.end();
      return;
    }
    res.writeHead(estado.statusDasPublicas, { "content-type": "text/html" });
    res.end("<html><body>pagina publica</body></html>");
  });

  // O servidor "em claro" — o que responde na porta 80 antes do redirecionamento.
  claro = createServer((req, res) => {
    const caminho = (req.url ?? "/").split("?")[0] ?? "/";
    if (caminho === "/login" && estado.loginEmClaroAbre) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body><form>login</form></body></html>");
      return;
    }
    if (caminho === "/login") {
      res.writeHead(308, { location: `https://${NOME}/login` });
      res.end();
      return;
    }
    res.writeHead(estado.statusDasPublicas, { "content-type": "text/html" });
    res.end("<html><body>pagina publica em claro</body></html>");
  });

  portaSegura = await subir(seguro);
  portaClara = await subir(claro);
});

afterAll(async () => {
  await new Promise<void>((pronto) => seguro.close(() => pronto()));
  await new Promise<void>((pronto) => claro.close(() => pronto()));
});

function repor(): void {
  estado.candidato = CANDIDATO;
  estado.statusDasPublicas = 200;
  estado.autenticadas = "redireciona";
  estado.loginEmClaroAbre = false;
}

describe("o aceite de publicação acusa, e aprova quando deve", () => {
  it("C0: sem POS_DNS_MODO_TESTE, as costuras de teste NÃO são honradas", async () => {
    // ⚠️ Uma costura de teste que valesse em produção seria o caminho para apontar o aceite
    // para um servidor amigo e aprovar qualquer coisa.
    repor();
    const r = await rodar({ POS_DNS_MODO_TESTE: "0" });
    // Sem a costura, o resolvedor real é consultado para um nome inexistente: DNS_PENDENTE.
    expect(r.codigo, "as costuras foram honradas fora do modo de teste").toBe(10);
  });

  it("C1: argumento obrigatório ausente REPROVA, nomeando o que falta", async () => {
    const semCandidato = await executar("bash", [SCRIPT, "--nome", NOME, "--ip", IP]).catch((e: { code?: number; stdout?: string }) => ({
      code: e.code,
      stdout: e.stdout ?? "",
    }));
    expect((semCandidato as { code?: number }).code).toBe(20);
    expect((semCandidato as { stdout?: string }).stdout).toMatch(/--candidato e obrigatorio/);

    const semIp = await executar("bash", [SCRIPT, "--nome", NOME, "--candidato", CANDIDATO]).catch((e: { code?: number; stdout?: string }) => ({
      code: e.code,
      stdout: e.stdout ?? "",
    }));
    expect((semIp as { code?: number }).code).toBe(20);
    expect((semIp as { stdout?: string }).stdout).toMatch(/--ip e obrigatorio/);
  });

  it("C2: o nome que NÃO resolve reprova com DNS_PENDENTE", async () => {
    repor();
    const r = await rodar({ POS_DNS_RESOLVEDOR: resolvedorDeMentira("") });
    expect(r.codigo).toBe(10);
    expect(r.saida).toMatch(/DNS_PENDENTE/);
  });

  it("⚠️ C3: o nome que resolve para OUTRO destino reprova — e diz que é pior que não resolver", async () => {
    repor();
    const r = await rodar({ POS_DNS_RESOLVEDOR: resolvedorDeMentira("198.51.100.77\n") });
    expect(r.codigo).toBe(11);
    expect(r.saida).toMatch(/DNS_INESPERADO/);
    expect(r.saida, "seguir daqui significaria conferir o sistema de outra pessoa").toMatch(/maquina alheia/);
  });

  it("C4: resolução para VÁRIOS endereços reprova — não se escolhe um em silêncio", async () => {
    repor();
    const r = await rodar({ POS_DNS_RESOLVEDOR: resolvedorDeMentira(`${IP}\n198.51.100.77\n`) });
    expect(r.codigo).toBe(11);
    expect(r.saida).toMatch(/multiplos enderecos/);
  });

  it("⚠️ C5: a aplicação que responde 404 reprova — 'respondeu alguma coisa' não é 'está no ar'", async () => {
    repor();
    estado.statusDasPublicas = 404;
    const r = await rodar({});
    expect(r.codigo).toBe(12);
    expect(r.saida).toMatch(/APLICACAO_MUDA/);
  });

  it("C5b: a aplicação que responde 500 também reprova", async () => {
    repor();
    estado.statusDasPublicas = 500;
    const r = await rodar({});
    expect(r.codigo).toBe(12);
  });

  it("⚠️ C6: rota autenticada que ABRE sem sessão reprova — o aceite confere o que FECHA", async () => {
    repor();
    estado.autenticadas = "abre";
    const r = await rodar({});
    expect(r.codigo).toBe(14);
    expect(r.saida).toMatch(/rota autenticada respondendo sem sessao/);
  });

  it("⚠️ C7: /login servido em HTTP claro reprova — senha trafegaria aberta", async () => {
    repor();
    estado.loginEmClaroAbre = true;
    const r = await rodar({});
    expect(r.codigo).toBe(17);
    expect(r.saida).toMatch(/EXPOSICAO_INDEVIDA/);
  });

  it("⚠️ C8: identidade AUSENTE reprova — era aqui que o aceite antigo aprovava", async () => {
    repor();
    estado.candidato = null;
    const r = await rodar({});
    expect(r.codigo).toBe(15);
    expect(r.saida).toMatch(/IDENTIDADE_AUSENTE/);
    expect(r.saida).toMatch(/IDENTIDADE_DO_CANDIDATO/);
  });

  it("⚠️ C9: identidade DIFERENTE reprova — está no ar outro artefato", async () => {
    repor();
    estado.candidato = "outro9999+000000000000";
    const r = await rodar({});
    expect(r.codigo).toBe(16);
    expect(r.saida).toMatch(/IDENTIDADE_DIFERENTE/);
  });

  it("C10: com tudo em ordem, APROVA — e o verde é alcançável", async () => {
    repor();
    const r = await rodar({});
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toMatch(/ESTADO: PUBLICADA_VALIDADA/);
    // ⚠️ E ELE DIZ O QUE NÃO COBRE. Um aceite que termina só com "OK" é lido como "tudo pronto".
    expect(r.saida).toMatch(/O QUE ISTO NAO COBRE/);
    expect(r.saida).toMatch(/percursos de navegador/);
  });

  it("C11: sem --emitir, o certificado ausente NÃO dispara emissão nenhuma", async () => {
    // ⚠️ O servidor de mentira fala HTTP; o passo do TLS usa a MESMA base no modo de teste, então
    // ele "passa". O que este caso afirma é o texto do contrato: conferir e emitir são separados,
    // e a emissão exige a máquina certa e uma conta ACME declarada.
    const fonte = await executar("cat", [SCRIPT]);
    expect(fonte.stdout).toMatch(/NAO emite sem --emitir/);
    expect(fonte.stdout).toMatch(/ACME_EMAIL nao definido/);
    expect(fonte.stdout).toMatch(/A EMISSAO ACONTECE NA MAQUINA QUE SERVE O NOME/);
  });
});
