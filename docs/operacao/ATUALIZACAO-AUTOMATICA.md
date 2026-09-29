# Atualização automática em produção

Depois de ligada, cada envio para a `main` do GitHub vira versão no ar, sem ninguém entrar no servidor
e sem o site cair. A versão nova é montada ao lado da antiga e só recebe acesso depois de responder.

Peças:

- `.github/workflows/publicar.yml` dispara a cada envio para a `main`. Fica **inerte** enquanto os
  segredos do servidor não estiverem cadastrados no GitHub.
- `scripts/atualizar-no-servidor.sh` roda no servidor e faz os mesmos passos de
  `instalar-no-servidor.sh`, numa pasta por versão.
- `test/atualizar-no-servidor.test.ts` ensaia o script em modo de simulação. Ele prova a ordem dos passos
  e que, se a versão nova falhar, nada é trocado.

## Quanto tempo leva

Do envio até a versão nova no ar leva de **3 a 6 minutos**, a maior parte na compilação do Next.js.
Durante esse tempo **o site continua no ar** com a versão anterior. A troca em si leva menos de um
segundo: o nginx recarrega e as conexões em curso terminam na versão antiga.

Na frota o sistema é em Rails, que não compila, por isso lá a troca parece instantânea. Aqui a
compilação é inevitável, mas acontece com o site atendendo.

## O que acontece a cada envio

1. O GitHub entra no servidor por SSH. Lá, a cópia do repositório é atualizada para o commit enviado.
2. O servidor confere o runtime e o `.env`, com os mesmos critérios da instalação.
3. O código do commit vai para `/opt/gestao-publica/versoes/<commit>`, via `git archive`.
4. Rodam `npm ci`, `prisma generate` e `prisma migrate deploy`. As migrations só acrescentam, então a
   versão no ar continua funcionando. Em seguida rodam `db:papel`, `db:sql`, as permissões pendentes, o
   licenciamento, `next build` e a conferência do PDF.
5. A versão nova sobe na **outra porta**: 3000 ou 3001, alternando.
6. O servidor confere se `/release` na porta nova responde o commit certo, com até 120 s de espera.
   - **Se não responder:** a nova é parada, nada é trocado, o site continua na versão anterior e o
     job do GitHub fica vermelho.
7. O nginx passa a mandar para a porta nova (`reload`, sem queda) e a antiga é parada.
8. Ficam guardadas as 5 versões mais recentes.
9. O GitHub confere que o domínio responde o commit novo.

## Para ligar (uma vez só)

O que depende de você, porque ninguém mais pode fazer:

1. **Credencial da AWS.** O usuário IAM `gestao-publica` não tem chave de acesso nem permissão no
   Lightsail (medido em 16/09, ver `AWS-PREFLIGHT-V9-N7.md`). Resolva no console da AWS. Outra saída é
   usar o servidor da frota (EC2), se você preferir que os dois sistemas fiquem na mesma máquina.
2. **Domínio.** O alvo nomeado é `gestao.enginesistemas.com.br`, com o DNS em `DNS-GODADDY-gestao.md`.

Depois disso, a instalação inicial segue `IMPLANTACAO-LIGHTSAIL.md` (`instalar-no-servidor.sh`,
nginx, certificado). Para passar ao regime de atualização automática:

3. **Chave de leitura do repositório.** No servidor, gere uma chave SSH para o usuário `gestao-publica`
   e cadastre a parte pública em GitHub, Settings, Deploy keys, **somente leitura**. Depois clone o
   repositório:
   `sudo -u gestao-publica git clone git@github.com:comercial-rgb/gestao-publica.git /opt/gestao-publica/repositorio`
4. **nginx apontando para o grupo de portas.** No bloco do site, troque o destino fixo pelo nome do
   grupo, `proxy_pass http://gestao_publica;`, e crie o arquivo do grupo uma vez:
   `echo 'upstream gestao_publica { server 127.0.0.1:3000; }' | sudo tee /etc/nginx/conf.d/gestao-publica-upstream.conf`
5. **Primeira atualização à mão**, para conferir no próprio servidor:
   `sudo /opt/gestao-publica/repositorio/scripts/atualizar-no-servidor.sh --commit <sha da main>`
   Depois dela, a unit antiga da instalação (`gestao-publica.service`) pode ser desabilitada. Quem
   atende passa a ser `gestao-publica@3000` ou `gestao-publica@3001`.
6. **Segredos no GitHub** (Settings, Secrets and variables, Actions):

   | Segredo | O que é |
   |---|---|
   | `PRODUCAO_SSH_HOST` | IP ou nome do servidor |
   | `PRODUCAO_SSH_USUARIO` | usuário com sudo que o GitHub usa (ex.: `ubuntu`) |
   | `PRODUCAO_SSH_CHAVE` | chave privada desse usuário, **só para isso** |
   | `PRODUCAO_SSH_KNOWN_HOSTS` | saída de `ssh-keyscan <host>`: o GitHub confere a identidade do servidor |
   | `PRODUCAO_DOMINIO` | `gestao.enginesistemas.com.br` |

Com os segredos cadastrados, o próximo envio para a `main` publica.

## O que continua valendo

- **O `.env` de produção é do servidor**, com segredos próprios, e nunca é copiado da máquina de
  desenvolvimento.
- **Migration só acrescenta.** Uma migration que removesse coluna quebraria a versão antiga durante a
  troca, e é proibida pelas regras do repositório.
- **Backup ainda não tem destino decidido.** Publicar dado real sem backup é decisão sua, e está
  registrada como pendente no roteiro de implantação.
