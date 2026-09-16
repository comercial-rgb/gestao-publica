# Implantação da avaliação em Lightsail — o roteiro, e o que dele já foi executado

> **Escopo:** ambiente de **avaliação** da Gestão Pública em `gestao.enginesistemas.com.br`.
> Não é produção municipal. Não há dado produtivo, mensagem real, pagamento nem transmissão fiscal.
>
> ⚠️ **O QUE FOI EXECUTADO DESTE ROTEIRO, EM 2026-09-16: apenas os passos de LEITURA do passo 0.**
> Nenhum recurso foi criado, alterado ou removido; não há custo novo nesta conta por causa desta
> rodada. O bloqueio, com o conserto exato, está em [`AWS-PREFLIGHT-V9-N7.md`](AWS-PREFLIGHT-V9-N7.md).
> Os comandos de mutação abaixo estão escritos e revisados, **não executados** — e este documento
> diz isso em vez de deixar parecer que estão.

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

## Passo 3 — a máquina

```sh
ssh -i ~/.ssh/lightsail-gestao-publica.pem ubuntu@<IP>
sudo apt-get update && sudo apt-get install -y postgresql nginx certbot python3-certbot-nginx \
  ca-certificates curl gnupg
# Node na MESMA linha do package-lock (v22 nesta máquina de desenvolvimento)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
# Chromium para o PDF. O puppeteer é serverExternalPackages: o binário é do sistema.
sudo apt-get install -y chromium-browser fonts-liberation
```

## Passo 4 — o banco, com os dois papéis separados

O repositório já distingue o dono (migrations, DDL) do papel de runtime (`gestao_app`, sem
superusuário, sem `BYPASSRLS`, sem posse de tabela, sem DDL). `scripts/provisionar-papel-runtime.ts`
é quem o cria; `prisma/papel-runtime.ts` é quem monta a URL dele.

```sh
sudo -u postgres createuser --pwprompt gestao          # dono: migrations
sudo -u postgres createdb  --owner=gestao gestao_publica
# O papel de runtime vem do script do repositório, não de um GRANT escrito à mão:
npm run db:papel
```

⚠️ **Senha de implantação ≠ senha de desenvolvimento.** E o `.env` do Mac **não** é transportado:
o servidor recebe um `.env` próprio, com `DATABASE_URL`, `APP_DB_USUARIO`, `APP_DB_SENHA`,
`ANEXOS_DIR`, `SEED_IDENTIDADE` e `NEXT_PUBLIC_BUILD_COMMIT`. Nada de `.env` versionado.

## Passo 5 — o artefato

⚠️ **Push continua sem autorização.** O pacote vai por `scp`, a partir de um commit local
identificado — e o candidato tem nome próprio `<sha curto>+<digesto>`, porque com árvore alterada
o SHA sozinho não identifica conteúdo nenhum (ver `scripts/release-do-candidato.mjs`).

```sh
# Na máquina de desenvolvimento, com a árvore congelada:
git archive --format=tar.gz -o /tmp/gestao-publica-<candidato>.tgz HEAD
scp -i ~/.ssh/lightsail-gestao-publica.pem /tmp/gestao-publica-<candidato>.tgz ubuntu@<IP>:/tmp/

# No servidor — o build acontece LÁ, na arquitetura de lá:
tar xzf /tmp/gestao-publica-<candidato>.tgz -C /opt/gestao-publica
cd /opt/gestao-publica
npm ci
npx prisma generate                 # ⚠️ na arquitetura do servidor; o cliente do Mac não serve
npx prisma migrate deploy
npm run db:sql                      # índices parciais e checks que o Prisma não representa
npm run permissoes:atualizar -- pendentes   # o MESMO caminho do banco dos percursos
NEXT_PUBLIC_BUILD_COMMIT=<sha> npx next build
```

⚠️ **`npm run permissoes:atualizar -- pendentes` é o mesmo comando que o banco dos percursos usa.**
Foi unificado nesta rodada justamente para que instalação, atualização e percurso não tenham três
caminhos de provisionamento diferentes — era assim que uma versão nova de permissão ficava de fora
de um deles e a tela "não abria".

⚠️ **O build não pode disputar a máquina com o processo que atende.** Numa instância de 8 GB,
buildar enquanto o site responde derruba o site. Buildar **antes** de subir o serviço, ou numa
janela declarada.

## Passo 6 — o serviço e o proxy

```ini
# /etc/systemd/system/gestao-publica.service
[Service]
WorkingDirectory=/opt/gestao-publica
EnvironmentFile=/opt/gestao-publica/.env
ExecStart=/usr/bin/npx next start -p 3000
Restart=always
RestartSec=5
```

O nginx faz `proxy_pass` para `127.0.0.1:3000`. Enquanto o DNS não apontar, o `server_name` é o IP,
e o ensaio é por túnel SSH (`ssh -L 8080:127.0.0.1:3000`) ou por `--resolve` no curl — **nunca**
expondo tela de login por HTTP público.

## Passo 7 — backup, e o que ele cobre

| Item | Proposta |
|---|---|
| Banco | `pg_dump` diário, retenção de 7 dias, fora da instância |
| Anexos (`ANEXOS_DIR`) | cópia diária, mesma retenção |
| Antes de cada migration | snapshot adicional, nomeado com o candidato |
| Restauração | **ensaiada em banco descartável** antes de valer como backup |

⚠️ **Isto é proposta operacional de demonstração, e não cumpre SLA/RPO de edital.** Dizer que
cumpre seria exatamente o tipo de afirmação que esta entrega não faz. E a limpeza remove **só
cópias vencidas pela política** — nunca histórico de negócio.

## Passo 8 — depois do DNS

`scripts/pos-dns.sh` (neste repositório) é idempotente e não fica em laço esperando ninguém:
confere a resolução, confere o HTTP, e só então conclui o TLS. Ver
[`DNS-GODADDY-gestao.md`](DNS-GODADDY-gestao.md).

## Os dois estados, que não se confundem

| Estado | O que exige | Hoje |
|---|---|---|
| `AWS_PREPARADA` | recurso identificado, IP estático real, aplicação instalada, banco e anexos persistentes, restauração e checagens executadas | **NÃO.** Bloqueado na autenticação e na permissão de Lightsail |
| `PUBLICADA` | resolução pública, HTTPS válido, jornadas externas e digest conferidos | **NÃO.** Depende do anterior e do DNS |

`http://localhost:3010` no Mac **não é URL hospedada**, e não é citado como se fosse.
