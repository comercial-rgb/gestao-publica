# A máquina, e como suíte, smokes e serviços convivem nela

> Medido em **2026-09-10**, na máquina de desenvolvimento, antes de abrir o ENT03.
> Todos os números abaixo saíram de `vm_stat`, `sysctl vm.swapusage`, `docker stats` e
> `ps`, amostrados de 5 em 5 segundos durante execuções reais. Nenhum é estimativa.

## 1. O que a máquina é

| Recurso | Valor |
|---|---|
| RAM física | **8 GB** |
| CPUs | 8 |
| Sistema | macOS (Darwin 25.6.0) |
| Swap | 8192 MB |

## 2. O estado em repouso — o teto já está lá

```
$ sysctl -n vm.swapusage
total = 8192.00M  used = 7372.50M  free = 819.50M  (encrypted)

$ vm_stat | head -2
Pages free: 4243.        (× 16384 B = ~69 MB)
```

**7,4 GB dos 8 GB de swap em uso com a máquina parada.** Isto não é um incidente que se
resolve reiniciando algo: é a condição normal de operação desta máquina. Todo o resto
deste documento parte daí.

### O Docker é o maior consumidor isolado

```
$ docker stats --no-stream
pg-gestao-publica          802.8MiB / 3.825GiB
saas-municipal-postgres     28.1MiB / 3.825GiB
saas-municipal-redis        11.2MiB / 3.825GiB
saas_municipal_postgres_test 63.7MiB / 3.825GiB
```

A VM do Docker tem **3,825 GiB reservados** — quase metade da RAM da máquina. Dentro dela,
o Postgres deste projeto ocupa 803 MB e os três containers de **outro projeto**
(`saas-municipal-*`) somam ~103 MB.

⚠️ **Nada foi parado nem reconfigurado.** Os containers do outro projeto e o limite da VM
do Docker são ambiente do usuário, e mexer neles é decisão de quem opera a máquina — não
de quem escreve código dela. Fica o número, para a decisão ser tomada com ele à vista.

## 3. O que cada trabalho pesado consome, medido

Amostragem de 5 em 5 s durante execuções completas e bem-sucedidas.

| | RAM livre (mín · média · máx) | Swap usado (pico) | RSS node/Chromium (pico) |
|---|---|---|---|
| **Suíte** (61 arquivos, 647 testes, 190s) | 29 · 70 · 232 MB | — | 538 MB |
| **Smoke ENT02** (Next + Chromium, 43 passos) | 52 · 59 · 70 MB | **7857 MB de 8192 (96%)** | 305 MB |

**Cada um passa sozinho. Os dois juntos não passam.** Durante o smoke sobram 335 MB de
swap; a suíte, sozinha, já chega a deixar 29 MB de RAM livre.

## 4. A decisão

### 4.1 Nada pesado se sobrepõe — `scripts/trinco-de-maquina.ts`

Um trinco por **máquina**, tomado por `npm run test:tudo` e pelos quatro smokes.

⚠️ **Ele não substitui a trava da suíte, e não é a mesma coisa.**
`test/trava-da-suite.ts` (ENT02) protege o **banco**: duas suítes contra o mesmo
`gestao_publica_test` apagam a semente uma da outra. É um advisory lock do Postgres, por
banco — duas suítes em bancos diferentes convivem bem.

Este protege a **máquina**. Duas suítes em bancos diferentes não se corrompem, mas nesta
máquina se matam por memória. Problemas diferentes, granularidades diferentes, dois
trincos.

**Arquivo com PID, e não advisory lock**, porque nem todo trabalho pesado fala com o banco
de teste: `next build` não fala com banco nenhum, e exigir Postgres para poder buildar
seria inventar uma dependência. O PID é conferido com `kill(pid, 0)`, então um `kill -9`
não deixa o trinco preso — o próximo comando assume o órfão **com aviso**, porque se isso
aparece toda vez há um padrão que precisa ser investigado.

### 4.2 O navegador roda sozinho

Consequência direta do trinco: nenhum smoke corre junto com a suíte, e dois smokes não
correm juntos.

### 4.3 O que foi CONSIDERADO e recusado: limitar a concorrência da suíte

Era a saída mais óbvia. O RSS somado dos processos node no pico da suíte foi **538 MB** —
ela não é a maior consumidora desta máquina; o Docker (3,8 GiB) e o editor são. Cortar
workers deixaria a suíte mais lenta **sem devolver a memória que falta**. O que devolve
memória é não sobrepor.

(A suíte continua com `fileParallelism: false` — mas por causa do banco compartilhado, que
é uma razão de correção, não de memória. As duas coisas não se confundem.)

### 4.4 As flags de memória do Chromium continuam

`--disable-dev-shm-usage`, `--disable-gpu`, `--disable-extensions` e `protocolTimeout`
explícito, nos quatro smokes. Elas não resolvem sozinhas — o smoke passou a caber quando
deixou de disputar —, mas cortam um processo inteiro que os smokes não usam.

## 5. ⚠️ Por que isto vale um documento, e não um comentário

Porque a falha **não se parece com falta de memória**. O renderer do Chromium é paginado
para o disco, o runtime dele para, e o puppeteer devolve:

```
Runtime.callFunctionOn timed out
```

Isso se lê como **"a tela não respondeu"** — e manda a pessoa procurar o defeito no React,
na Server Action, na porta, no `revalidatePath`. É a falha mais cara de diagnosticar
porque parece código, e não é.

Aconteceu no ENT02 e custou uma investigação inteira. A mensagem do trinco carrega esse
histórico junto, para que a próxima pessoa que esbarrar nele leia a explicação antes de
começar a procurar no lugar errado.

## 6. Como rodar, agora

| Comando | O que faz |
|---|---|
| `npm run test:tudo` | suíte completa, com trinco de máquina **e** trava de banco |
| `npm test` | `vitest run` cru — para um arquivo solto, sem trinco de máquina |
| `npm run smoke:ent02` · `smoke:cadeia` · `smoke:pessoas` · `smoke:visual` | cada um com trinco |
| `npm run pesado "<tarefa>" -- <comando>` | embrulha qualquer outro trabalho pesado |

⚠️ `npm test` **continua sem o trinco de máquina**, de propósito: rodar um arquivo de teste
enquanto se escreve código é o laço mais frequente do dia, custa pouco, e obrigá-lo a
esperar uma suíte completa tornaria o trinco um estorvo — e trinco que estorva é trinco que
alguém contorna. A trava de **banco** continua valendo para ele, porque essa é sobre
corrupção de dados, não sobre memória.
