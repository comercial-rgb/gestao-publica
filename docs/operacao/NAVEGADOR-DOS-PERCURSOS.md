# Navegador dos percursos e do gerador de PDF

**Por que existe:** na sessão V6.2 o Chrome do Puppeteer (`~/.cache/puppeteer`, cache do usuário,
compartilhado com outros projetos) sumiu entre duas execuções — causa desconhecida, não investigada
além disso. Dois percursos ficaram sem rodar no candidato final.

**Como está agora (V7 M1 U0):**

| Item | Valor |
|---|---|
| Pacote | `puppeteer` / `puppeteer-core` **25.3.0** (package-lock) |
| Revisão exigida | Chrome for Testing **150.0.7871.24** (`puppeteer-core/lib/puppeteer/revisions.js`) |
| Máquina conferida | Darwin arm64 |
| Configuração | `.puppeteerrc.cjs` na raiz → `cacheDirectory: <projeto>/.cache-puppeteer` |
| Git | `.cache-puppeteer/` ignorado (`.gitignore`: `.cache-*`) |
| Quem lê | os percursos (`npx tsx scripts/smoke-*.ts`, cwd = projeto) e o `next start` (`lib/pdf/gerar.ts`, cwd = projeto) |
| Variáveis | nenhuma `PUPPETEER_*` é exigida; se alguma for definida, ela vence o arquivo — não defina |

**Preflight único:** `npm run navegador:preflight` — resolve o executável pela configuração, confere
que existe, inicia, carrega página local sem rede, gera PDF mínimo (`%PDF`) e encerra. Os percursos
novos usam `lancarNavegadorDoPercurso()` (`scripts/percursos-navegador.ts`), que roda o preflight e
sai com código **3 — bloqueado por ambiente** antes do primeiro clique.

**Reposição (manual, nunca automática):**

```
cd <projeto>
npx puppeteer browsers install chrome
npm run navegador:preflight
```

O comando usa o CLI do `puppeteer` instalado localmente e baixa só a revisão que ele exige. Não se
atualiza o pacote, não se escolhe "stable/latest", não se limpa `~/.cache` e nada é baixado durante
uma requisição HTTP.
