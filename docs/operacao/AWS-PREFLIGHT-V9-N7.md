# N7 — preflight de acesso à AWS: o que foi conferido e onde exatamente parou

> Medido em 2026-09-16, nesta máquina, com `aws-cli/2.34.63`. **Somente leitura**: nenhuma
> chamada desta apuração criou, alterou ou removeu recurso. Nenhum valor de credencial foi
> impresso, gravado ou copiado.

## O resultado em uma linha

**Não é "AWS pronta, falta DNS".** O bloqueio é anterior: **não existe credencial programática
para a identidade deste projeto, e essa identidade também não tem permissão no serviço
escolhido.** São dois bloqueios distintos, e os dois têm conserto exato, abaixo.

## O que foi conferido

| Pergunta | Resposta medida |
|---|---|
| Existe AWS CLI? | sim — `aws-cli/2.34.63`, Python 3.14.5, arm64 |
| Que identidade o perfil `default` desta máquina usa? | `arn:aws:iam::441778933745:user/whats-saas` — **é o usuário de OUTRO produto**, com `AdministratorAccess` |
| O usuário `gestao-publica` existe? | **sim**, na mesma conta `441778933745` (`arn:aws:iam::441778933745:user/gestao-publica`) |
| Ele tem chave de acesso programática? | **não — `list-access-keys` devolve lista vazia.** Não há chave para configurar; nenhuma existe |
| Ele tem senha de console? | sim, criada em 2026-09-16T02:03:25Z, **com `PasswordResetRequired: true`** |
| Ele tem MFA? | nenhum dispositivo registrado |
| Ele tem permissão de Lightsail? | **não.** As políticas anexadas são `AmazonEC2FullAccess`, `EC2InstanceConnect`, `IAMUserChangePassword`, `AdministratorAccess-Amplify`, `AdministratorAccess-AWSElasticBeanstalk`, `AccountManagementFromVercel`. **Nenhuma alcança Lightsail** — EC2 e Lightsail são serviços distintos, com ações distintas (`lightsail:*`) |
| O CSV `gestao-publica_credentials.csv` está nesta máquina? | **não.** Procurado por nome em `~/Downloads`, `~/Desktop`, `~/Documents` e em `~` até quatro níveis: nenhuma ocorrência. Ele foi anexado à conversa, e a própria ordem adverte que o anexo não deve ser presumido presente no Mac |
| Inventário Lightsail em `sa-east-1` | uma instância, **`receptor-rastreadores`** (Ubuntu, `micro_3_1`, `running`, IP estático `ip-receptor` → `18.228.149.142`). **É de outro sistema. Não foi tocada, e não deve ser** |
| Há recurso Lightsail da gestao-publica? | **não.** Nenhuma instância, nenhum IP estático, nenhum disco com esse nome |

## Por que a execução parou aqui em vez de provisionar assim mesmo

Três motivos, e nenhum deles é falta de autorização de gasto — essa o usuário deu.

1. **A credencial do projeto não existe nesta máquina, nem em lugar nenhum.** O CSV entregue é de
   **console** (usuário, senha e URL de login), não de chave de acesso. A própria ordem manda não
   executar `aws configure import` sobre ele como se contivesse chaves — e não conteria.

2. **O caminho de console exige intervenção humana que não se contorna.** `PasswordResetRequired:
   true` significa que o primeiro acesso de `gestao-publica` **obriga a troca de senha no
   navegador**. `aws login`, mesmo na versão 2.34 desta máquina, negocia sessão de console — e não
   atravessa uma troca de senha obrigatória. A ordem é explícita: "Não contornar MFA, troca
   obrigatória de senha ou exigência de intervenção humana."

3. **A alternativa disponível seria agir como outro produto, e isso a ordem proíbe.** O perfil
   `default` é `whats-saas`, com `AdministratorAccess`. Provisionar por ele funcionaria
   tecnicamente e seria: (a) usar credencial de outro produto, que a ordem veda; (b) criar
   infraestrutura cobrada sob uma identidade que não é a deste projeto, deixando o rastro de
   auditoria errado desde o primeiro dia. **Mintar uma chave de acesso nova para
   `gestao-publica` usando a chave de administrador de outro produto** também foi recusado: é
   criação de credencial de longa duração, decisão de segurança que não cabe a um executor tomar
   sozinho.

## O conserto exato — duas ações de Winner, nesta ordem

### Ação 1 — dar a `gestao-publica` permissão no serviço escolhido

Sem isto, **mesmo com credencial válida o provisionamento falha com `AccessDenied`**, e falharia
tarde, depois de o resto parecer funcionando.

Caminho mais curto (console IAM → Usuários → `gestao-publica` → Adicionar permissões):
anexar a política gerenciada **`AmazonLightsailFullAccess`**.

Caminho mínimo, se preferir política própria em vez da gerenciada — estas são as ações que o
provisionamento desta demonstração usa, e nada além:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LightsailDaDemonstracaoGestaoPublica",
      "Effect": "Allow",
      "Action": [
        "lightsail:GetRegions",
        "lightsail:GetBlueprints",
        "lightsail:GetBundles",
        "lightsail:GetInstances",
        "lightsail:GetInstance",
        "lightsail:GetInstanceState",
        "lightsail:GetInstanceAccessDetails",
        "lightsail:GetStaticIps",
        "lightsail:GetStaticIp",
        "lightsail:GetKeyPairs",
        "lightsail:CreateKeyPair",
        "lightsail:CreateInstances",
        "lightsail:AllocateStaticIp",
        "lightsail:AttachStaticIp",
        "lightsail:PutInstancePublicPorts",
        "lightsail:GetInstancePortStates",
        "lightsail:TagResource",
        "lightsail:CreateInstanceSnapshot",
        "lightsail:GetInstanceSnapshots"
      ],
      "Resource": "*"
    }
  ]
}
```

> `lightsail:DeleteInstance`, `DeleteStaticIp` e `DeleteInstanceSnapshot` **ficaram de fora de
> propósito**. Nada nesta entrega apaga recurso, e uma permissão de destruição concedida "por via
> das dúvidas" é a que um erro futuro usa.

### Ação 2 — dar a esta identidade uma credencial que a CLI consiga usar

⚠️ **CORRIGIDO NA V10 T5.** A redação anterior tratava a chave de acesso como o caminho e a
sessão de console como alternativa. É o contrário: **credencial temporária é o caminho
preferido**, e a chave de longa duração é a alternativa — uma chave criada hoje continua válida
por anos, viaja em arquivo, e não expira sozinha quando alguém deixa o projeto.

**Caminho preferido — sessão de console, credencial temporária:**

1. Winner faz o primeiro login no console com o CSV entregue e **completa a troca obrigatória de
   senha** (é no navegador; `aws login` não atravessa essa troca);
2. um administrador autorizado concede a `gestao-publica`, além da permissão do serviço (Ação 1),
   o acesso que o fluxo de login da CLI exige (`SignInLocalDevelopmentAccess`);
3. então, **nesta máquina**:

   ```sh
   aws login --profile gestao-publica         # negocia a sessao; regiao sa-east-1
   AWS_PROFILE=gestao-publica aws sts get-caller-identity   # tem de devolver .../user/gestao-publica
   ```

   A CLI instalada aqui é a **2.34.63**, acima do mínimo documentado (2.32) para esse fluxo.

   ⚠️ **Credencial temporária EXPIRA.** O provisionamento inteiro (instância, IP estático, portas)
   leva minutos, e cabe numa sessão — mas quem for executá-lo deve confirmar a validade restante
   antes de começar, e renovar em vez de emendar. **Nenhum segredo, e nenhum prazo de sessão, é
   copiado para relatório algum.**

**Alternativa — chave de acesso de longa duração:** console IAM → `gestao-publica` → Credenciais
de segurança → Criar chave de acesso → *Command Line Interface*; depois `aws configure --profile
gestao-publica`. Vale quando a sessão de console não for possível; e, se for esse o caminho,
revogue a chave assim que a implantação estiver de pé.

⚠️ **Perfil NOMEADO nos dois casos, nunca o `default`.** O `default` desta máquina é de outro
produto e continua sendo dele. E isto é sobre **acesso e auditoria**, não sobre faturamento: a
conta é a mesma, e a separação de custo se faz por tag, inventário e orçamento — não por
credencial.

### Sobre chamar a política acima de "mínima"

⚠️ **Ela é mínima em AÇÕES, e não em RECURSOS.** O `Resource: "*"` alcança qualquer recurso de
Lightsail desta conta — e nesta conta há recursos de outro produto (`receptor-rastreadores`,
`ip-receptor`). Restringir por ARN exigiria conferir, ação a ação, quais operações de Lightsail
suportam recurso e condição, e isso **não foi verificado**. Até que seja, o texto honesto é este:
a lista de ações é o recorte; o recorte por recurso está em aberto.

## Preflight repetido em 2026-09-16 (V10 T5)

Somente leitura, e o resultado é: **o acesso NÃO mudou.**

```
$ aws configure list-profiles
default

$ AWS_PROFILE=gestao-publica aws sts get-caller-identity
aws: [ERROR]: The config profile (gestao-publica) could not be found
```

Não existe perfil `gestao-publica` nesta máquina — nem chave, nem sessão. O `default` (de outro
produto) **não foi usado**, e nenhuma chave nova foi criada. As duas ações acima continuam
pendentes, e são de Winner.

## O que continua verdadeiro enquanto isso não acontece

- **Nenhuma instância foi criada. Não há IP estático da gestao-publica. Não há custo novo nesta
  conta por causa desta rodada.**
- A tabela DNS para a GoDaddy **não pode ser entregue com valor real**: o registro `A` de
  `gestao.enginesistemas.com.br` precisa do IP estático, e o IP só existe depois da alocação.
  Inventar um IP seria pior que a pendência. O formato exato, com o único campo faltando
  nomeado, está em `docs/operacao/DNS-GODADDY-gestao.md`.
- `enginesistemas.com.br`, seus outros subdomínios e a zona da GoDaddy **não foram tocados**, como
  manda a ordem — o DNS é ato do usuário.
