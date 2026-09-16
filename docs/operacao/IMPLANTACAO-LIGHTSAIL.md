# Implantação da avaliação em Lightsail — o roteiro, e o que dele já foi executado

> **Escopo:** ambiente de **avaliação** da Gestão Pública em `gestao.enginesistemas.com.br`.
> Não é produção municipal. Não há dado produtivo, mensagem real, pagamento nem transmissão fiscal.
>
> ⚠️ **O QUE FOI EXECUTADO DESTE ROTEIRO: apenas os passos de LEITURA do passo 0 (V9 N7), e o
> ENSAIO EM LINUX das pré-condições do passo 3 (V10 T5 — ver "O que foi ensaiado", no fim).**
> Nenhum recurso de nuvem foi criado, alterado ou removido; não há custo novo nesta conta por
> causa destas rodadas. O bloqueio, com o conserto exato, está em
> [`AWS-PREFLIGHT-V9-N7.md`](AWS-PREFLIGHT-V9-N7.md). Os comandos de mutação abaixo estão
> escritos e revisados, **não executados** — e este documento diz isso em vez de deixar parecer
> que estão.
>
> ⚠️ **NÃO ESCREVA "PONTA A PONTA" SOBRE ESTE ROTEIRO.** Ele tem `<IP>` e `<bundleId>` por
> preencher, e a parte de nuvem nunca rodou. O que existe de executável e revisável são os dois
> scripts do passo 3 em diante.

## Passo 0 — a identidade certa (executado, somente leitura)

```sh
export AWS_PROFILE=gestao-publica       # perfil NOMEADO; o `default` desta máquina é de outro produto
aws sts get-caller-identity             # tem de devolver .../user/gestao-publica
aws lightsail get-regions --query 'regions[?name==`sa-east-1`].displayName' --output text
```

⚠️ **Se `get-caller-identity` devolver outra identidade, PARE.** Provisionar como o usuário de
outro produto deixa o rastro de auditoria errado desde o primeiro dia, e a conta passa a ter
infraestrutura de dois sistemas sob a mesma credencial.

## Passo 1 — a instância e o IP

```sh
# Confirmar a oferta e o preço ANTES de criar — a estimativa de US$ 44/mês é referência, não promessa.
aws lightsail get-bundles --region sa-east-1 \
  --query 'bundles[?ramSizeInGb==`8`].[bundleId,price,cpuCount,diskSizeInGb]' --output table

aws lightsail create-key-pair --region sa-east-1 --key-pair-name gestao-publica \
  --query 'privateKeyBase64' --output text > ~/.ssh/lightsail-gestao-publica.pem
chmod 400 ~/.ssh/lightsail-gestao-publica.pem     # o Lightsail mostra a chave UMA vez

aws lightsail create-instances --region sa-east-1 \
  --instance-names gestao-publica-avaliacao \
  --availability-zone sa-east-1a \
  --blueprint-id ubuntu_24_04 \
  --bundle-id <o bundleId de 8 GB confirmado acima> \
  --key-pair-name gestao-publica \
  --tags key=projeto,value=gestao-publica key=ambiente,value=avaliacao

aws lightsail allocate-static-ip --region sa-east-1 --static-ip-name ip-gestao-publica
aws lightsail attach-static-ip  --region sa-east-1 --static-ip-name ip-gestao-publica \
  --instance-name gestao-publica-avaliacao
aws lightsail get-static-ip --region sa-east-1 --static-ip-name ip-gestao-publica \
  --query 'staticIp.ipAddress' --output text     # ← É ESTE O VALOR DO REGISTRO `A`
```

⚠️ **Não tocar em `receptor-rastreadores` nem no `ip-receptor`.** São de outro sistema, estão
`running`, e foram inventariados só para não serem confundidos com recurso reaproveitável.

## Passo 2 — a rede mínima

```sh
aws lightsail put-instance-public-ports --region sa-east-1 \
  --instance-name gestao-publica-avaliacao \
  --port-infos fromPort=80,toPort=80,protocol=TCP \
               fromPort=443,toPort=443,protocol=TCP \
               fromPort=22,toPort=22,protocol=TCP,cidrs=<IP-DE-OPERACAO>/32
```

⚠️ **`put-instance-public-ports` SUBSTITUI o conjunto inteiro.** Uma porta esquecida na lista
fecha. E o SSH sai restrito a um endereço: `0.0.0.0/0` na 22 é o que transforma uma demonstração
numa máquina varrida por bot em horas.

⚠️ **O Postgres NÃO ganha porta pública.** Ele escuta em `127.0.0.1` e a aplicação fala com ele
pelo `localhost` da mesma máquina. Não há RDS, NAT nem balanceador: seriam cobranças recorrentes
para uma avaliação de um processo só.

## Passo 3 — a máquina, e as versões que o candidato exige

⚠️ **O ROTEIRO ANTERIOR PEDIA `apt-get install -y postgresql`, e isso não é escolher versão.**
A distribuição entrega o que tiver no dia; o candidato foi construído e medido contra o
PostgreSQL **18** e o Node **22**. Um banco de outra linha pode aceitar as migrations e divergir
em detalhe de ordenação, de tipo ou de plano — e a divergência aparece em produção, não aqui.

```sh
# Node 22 — a MESMA linha em que o candidato foi construído e testado.
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs

# PostgreSQL 18 — do repositório oficial do PGDG, com a versão ESCOLHIDA, não a que vier.
sudo apt-get install -y ca-certificates curl gnupg
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update && sudo apt-get install -y postgresql-18

# Chromium e fontes para o PDF. O puppeteer é `serverExternalPackages`: o binário é do sistema.
sudo apt-get install -y chromium-browser fonts-liberation

# nginx e certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

⚠️ **Existir não é renderizar.** Chromium instalado e fonte ausente produz PDF com caixas no
lugar das letras — e isso só aparece olhando o arquivo. O `scripts/instalar-no-servidor.sh` roda
`preflight-navegador.ts` **neste servidor** antes de subir o serviço, e recusa se o PDF não sair.

## Passo 4 — o pacote, com uma cadeia de proveniência só

⚠️ **O ROTEIRO ANTERIOR MISTURAVA DUAS PROVENIÊNCIAS.** Ele empacotava com `git archive HEAD` e
depois falava do candidato pelo nome `<sha>+<digesto>` — e os dois não descrevem a mesma coisa:
`git archive` traz o conteúdo **rastreado** do commit (e ignora o que estiver solto na árvore),
enquanto o digesto daquele nome era do `.next` construído **no Mac**, que não é o build que roda
no servidor.

Agora a cadeia é uma só, e cada elo é verificável:

| Elo | Quem produz | O que prova |
|---|---|---|
| manifesto do fonte | `scripts/empacotar-candidato.sh` | sha256 de **cada arquivo rastreado** do commit |
| digesto do fonte | o sha256 do manifesto | um arquivo alterado muda o digesto |
| pacote `.tgz` | o mesmo script | o conteúdo que viaja |
| sha256 do pacote | conferido **no servidor**, depois do `scp` | que chegou o que saiu |
| build | `next build` **no servidor** | a arquitetura de lá |
| identidade no ar | `GET /release` | que o processo que atende é o candidato instalado |

```sh
# Na máquina de desenvolvimento, com a árvore RASTREADA limpa (o script recusa se não estiver):
scripts/empacotar-candidato.sh /tmp
scp -i ~/.ssh/lightsail-gestao-publica.pem \
  /tmp/gestao-publica-<candidato>.tgz /tmp/gestao-publica-<candidato>.manifesto ubuntu@<IP>:/tmp/
```

⚠️ **O que o manifesto NÃO cobre está escrito dentro dele**: `node_modules` (vem do `npm ci`
contra o `package-lock` do pacote), `prisma/generated` (gerado na arquitetura do servidor),
`.next` (construído lá), Chromium e fontes (pacotes do sistema, com versão conferida) e o `.env`
(configuração e segredo, que **nunca** viajam no pacote). Um hash de `.next` não inventaria nada
disso — por isso o digesto é do FONTE.

## Passo 5 — a instalação, por script idempotente

⚠️ **O ROTEIRO ANTERIOR TINHA A ORDEM ERRADA**: mandava rodar `npm run db:papel` antes de as
dependências existirem — e `db:papel` é `tsx`, que vem do `npm ci`. Também não criava usuário do
serviço, não ajustava permissão de diretório e deixava a unit **sem `User=`**, o que faz o
systemd rodar a aplicação inteira como **root**.

```sh
# No servidor. `--conferir` roda só as pré-condições e não instala nada:
scripts/instalar-no-servidor.sh --pacote /tmp/gestao-publica-<cand>.tgz \
  --manifesto /tmp/gestao-publica-<cand>.manifesto --conferir

# E então, para valer:
scripts/instalar-no-servidor.sh --pacote /tmp/gestao-publica-<cand>.tgz \
  --manifesto /tmp/gestao-publica-<cand>.manifesto
```

O que ele faz, na ordem: confere versões → confere a integridade do pacote → confere o `.env` →
cria o usuário de sistema `gestao-publica` (sem shell) e os diretórios com permissão → extrai →
`npm ci` → `prisma generate` → `migrate deploy` → papel de runtime → SQL manual → permissões
pendentes → licenciamento comercial → `next build` → **preflight do PDF** → unit com `User=`,
`ProtectSystem=strict` e `IDENTIDADE_DO_CANDIDATO` vindo do manifesto.

⚠️ **O Next escuta em `127.0.0.1`**, e não em `0.0.0.0`. Sem `-H 127.0.0.1`, a porta 3000 fica
acessível de fora e contorna o proxy e o TLS.

⚠️ **Duas identidades de banco, e a prova de que a segunda é menor.** O dono aplica migrations
(DDL); o runtime (`gestao_app`) só lê e escreve, sem DDL, sem superusuário e sem `BYPASSRLS`.
Quem afirma isso não é este documento: é `npm run test:runtime`, contra o banco.

## Passo 6 — o proxy

O nginx faz `proxy_pass` para `127.0.0.1:3000`. **Antes do HTTPS, só devem responder em claro**
`/.well-known/acme-challenge/` e o redirecionamento para HTTPS — nada mais.

⚠️ **O roteiro anterior afirmava que o login estava protegido e não conferia.** Agora
`scripts/pos-dns.sh` REPROVA (`EXPOSICAO_INDEVIDA`, saída 17) se `/login` responder 200 em HTTP
claro, e o teste `test/pos-dns.test.ts` (caso C7) prova que ele reprova.

Enquanto o DNS não apontar, o ensaio é por túnel SSH (`ssh -L 8080:127.0.0.1:3000`) — **nunca**
expondo tela de login por HTTP público.

## Passo 7 — backup: destino, credencial, retenção, tarefa e restauração

⚠️ **A TABELA ANTERIOR ERA UMA PROPOSTA, E PROPOSTA NÃO É BACKUP.** Um backup só existe quando
tem destino real, credencial própria, tarefa que roda e restauração ensaiada. Enquanto os cinco
não existirem, o estado honesto é **não há backup** — e é isso que está escrito aqui.

| Item | O que falta decidir/executar |
|---|---|
| Destino externo | **NÃO DEFINIDO.** Lightsail tem *object storage* próprio, cobrado à parte; S3 é outro serviço. **A política de Lightsail não concede acesso a nenhum dos dois** — o destino escolhido entra no quadro de custo e no de permissão |
| Credencial | mínima **para o destino escolhido**, e só para ele |
| Retenção | 7 dias para o banco e para `ANEXOS_DIR` |
| Tarefa | unit `systemd` com timer, e não `cron` solto sem log |
| Restauração | **ensaiada em banco descartável** antes de o backup valer como backup |

⚠️ **Sobre "política mínima".** A política sugerida no preflight usa `Resource: '*'` — e nesta
conta há recursos de outro produto. `'*'` alcança todos eles. Chamá-la de "mínima por projeto"
sem conferir quais ações do Lightsail suportam recurso e condição seria afirmar um recorte que
não foi verificado. Ver [`AWS-PREFLIGHT-V9-N7.md`](AWS-PREFLIGHT-V9-N7.md).

## Passo 8 — depois do DNS, o aceite

```sh
scripts/pos-dns.sh --nome gestao.enginesistemas.com.br --ip <IP-ESTATICO> --candidato <candidato>
```

⚠️ **Ele reprova quando a evidência falta.** A versão anterior aceitava não achar o identificador
do build e ainda assim dizia cobrir o aceite `PUBLICADA`. Os estados, e o código de saída de cada
um, estão no cabeçalho do script: `DNS_PENDENTE` (10), `DNS_INESPERADO` (11), `APLICACAO_MUDA`
(12), `TLS_PENDENTE` (13), `ROTAS_FALHARAM` (14), `IDENTIDADE_AUSENTE` (15),
`IDENTIDADE_DIFERENTE` (16), `EXPOSICAO_INDEVIDA` (17), `PUBLICADA_VALIDADA` (0).

**Conferir e emitir são separados.** Sem `--emitir`, ele não pede certificado nenhum; com
`--emitir`, exige `ACME_EMAIL` (a conta é de alguém, e os termos são aceitos por esse alguém) e
só funciona **na máquina que serve o nome** — o desafio HTTP-01 chega na porta 80 de lá.

Ver [`DNS-GODADDY-gestao.md`](DNS-GODADDY-gestao.md).

## O que foi ensaiado, e o que não foi

| Item | Ensaiado? | Como |
|---|---|---|
| `scripts/pos-dns.sh` | **sim**, 13 casos | `test/pos-dns.test.ts`: DNS ausente, destino errado, múltiplos endereços, 404, 500, rota autenticada aberta, login em claro, identidade ausente, identidade diferente — e o caso positivo. Sem emitir certificado público nem tocar em ambiente de terceiro |
| Pré-condições do passo 3 (versões de Node e Postgres, Chromium, fontes) | **sim**, em Linux | container descartável; ver `docs/operacao/ENSAIO-DA-INSTALACAO.md` |
| Instalação completa (passos 4–6) | **não** | depende de servidor com o banco provisionado; os scripts estão escritos e revisados |
| Backup e restauração | **não** | o destino ainda não foi decidido — ver o passo 7 |
| Provisionamento na AWS (passos 0–2) | **não** | bloqueado por acesso; ver `AWS-PREFLIGHT-V9-N7.md` |

## Os dois estados, que não se confundem

| Estado | O que exige | Hoje |
|---|---|---|
| `AWS_PREPARADA` | recurso identificado, IP estático real, aplicação instalada, banco e anexos persistentes, restauração e checagens executadas | **NÃO.** Bloqueado na autenticação e na permissão de Lightsail |
| `PUBLICADA_VALIDADA` | resolução para o destino desta implantação, HTTPS válido, rotas públicas abrindo, rotas autenticadas fechando, nada autenticado em claro e a identidade do candidato conferida | **NÃO.** Depende do anterior e do DNS |

`http://localhost:3010` no Mac **não é URL hospedada**, e não é citado como se fosse.
