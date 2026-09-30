// Mantém a apresentação no ar na porta 3010 por um período (padrão 12 h). Node puro, sem dependências.
//
// - A cada 20 s confere o contêiner do banco e a tela de entrada; se a tela falhar duas vezes seguidas,
//   encerra o que estiver na porta e sobe o servidor de novo (desacoplado deste processo).
// - A cada 5 min zera o contador de inatividade do Windows (SetThreadExecutionState), para a máquina
//   não suspender no meio da apresentação. Nenhuma configuração de energia é alterada.
// - Registra cada ocorrência em apresentacao-no-ar.log, na pasta indicada.
//
// Uso: node scripts/demonstracao/manter-apresentacao-no-ar.mjs [horas] [pasta-do-log]
// Para parar: encerrar este processo (o PID fica no log). O servidor continua no ar.

import { execFile, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, openSync } from "node:fs";
import { get } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const horas = Number(process.argv[2] ?? "12");
const pasta = process.argv[3] ?? join(process.env.LOCALAPPDATA ?? ".", "gestao-publica-apresentacao");
mkdirSync(pasta, { recursive: true });
const repo = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const log = join(pasta, "apresentacao-no-ar.log");
const registrar = (m) => appendFileSync(log, `${new Date().toLocaleString("sv-SE")} ${m}\n`, "utf8");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const executar = (arq, args) =>
  new Promise((r) => execFile(arq, args, { windowsHide: true, timeout: 30000 }, (e, out) => r(e ? null : String(out).trim())));

function responde() {
  return new Promise((r) => {
    const req = get("http://localhost:3010/login", { timeout: 15000 }, (res) => {
      res.resume();
      r(res.statusCode === 200);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => r(false));
  });
}

async function subirServidor() {
  const pids = await executar("powershell.exe", ["-NoProfile", "-Command",
    "(Get-NetTCPConnection -LocalPort 3010 -State Listen -ErrorAction SilentlyContinue).OwningProcess"]);
  for (const pid of (pids ?? "").split(/\s+/).filter(Boolean)) {
    registrar(`encerrando o processo ${pid} que ocupava a 3010`);
    await executar("taskkill.exe", ["/PID", pid, "/F", "/T"]);
  }
  registrar("subindo o servidor da 3010");
  const saida = openSync(join(pasta, "apresentacao-servidor.log"), "a");
  const filho = spawn("cmd.exe", ["/c", "npx tsx scripts/servir-percursos.ts"], {
    cwd: repo,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", saida, saida],
    env: { ...process.env, PERCURSO_BANCO: "gestao_publica_apresentacao", PERCURSO_COMO_RUNTIME: "1",
      PERCURSO_PORTA: "3010", AMBIENTE_DE_EXECUCAO: "demonstracao" },
  });
  filho.unref();
  for (let i = 0; i < 60; i++) {
    await esperar(3000);
    if (await responde()) return registrar("servidor respondendo");
  }
  registrar("o servidor não respondeu em 3 min");
}

const manterAcordada = () =>
  executar("powershell.exe", ["-NoProfile", "-Command",
    "Add-Type -Namespace E -Name S -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'; [void][E.S]::SetThreadExecutionState(1)"]);

registrar(`supervisor iniciado (PID ${process.pid}) por ${horas} h`);
const fim = Date.now() + horas * 3600_000;
let ultimaAcordada = 0;
while (Date.now() < fim) {
  try {
    if (Date.now() - ultimaAcordada > 300_000) {
      await manterAcordada();
      ultimaAcordada = Date.now();
    }
    const banco = await executar("docker", ["inspect", "pg-gestao-publica-win", "--format", "{{.State.Status}}"]);
    if (banco !== "running") {
      registrar(`banco fora do ar (${banco ?? "sem resposta do docker"}); iniciando o contêiner`);
      await executar("docker", ["start", "pg-gestao-publica-win"]);
      await esperar(5000);
    }
    if (!(await responde())) {
      await esperar(5000);
      if (!(await responde())) {
        registrar("a 3010 não respondeu duas vezes");
        await subirServidor();
      }
    }
  } catch (e) {
    registrar(`erro: ${e instanceof Error ? e.message : String(e)}`);
  }
  await esperar(20000);
}
registrar("período encerrado; o servidor continua no ar, sem supervisão");
