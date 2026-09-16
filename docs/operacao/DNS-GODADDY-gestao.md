# Os registros para a GoDaddy — `gestao.enginesistemas.com.br`

> ⚠️ **Esta tabela ainda NÃO pode ser preenchida com valor real.** O registro `A` precisa do IP
> estático da instância, e nenhuma instância foi criada — o acesso à AWS está bloqueado, e o
> bloqueio exato, com o conserto, está em [`AWS-PREFLIGHT-V9-N7.md`](AWS-PREFLIGHT-V9-N7.md).
>
> **Inventar um IP aqui seria pior que a pendência**: um registro DNS errado propaga, fica em
> cache por horas e leva visitantes a uma máquina de outra pessoa.

## O que Winner vai inserir, quando o IP existir

| Tipo | Nome / Host | Valor | TTL | Observação |
|---|---|---|---|---|
| `A` | `gestao` | **⟨IP estático da instância Lightsail⟩** — pendente | 600 | Aponta `gestao.enginesistemas.com.br` para a instância. O nome é só `gestao`, não o domínio inteiro: a GoDaddy completa com a zona |

**Só este registro.** Nada mais é necessário para o site funcionar.

## O que NÃO se cria, e por quê

| Registro | Por que fica de fora |
|---|---|
| `AAAA` (IPv6) | Só se a instância tiver IPv6 **funcionando e testado**. Um `AAAA` para um endereço que não responde faz o navegador tentar IPv6 primeiro e esperar o tempo de espera antes de cair para IPv4 — o site "fica lento" sem motivo aparente |
| `CNAME` em `gestao` | **Conflita com o `A` no mesmo nome.** Um nome tem `A` ou `CNAME`, nunca os dois |
| `www.gestao` | Ninguém digita isso. Se for desejado depois, é um `CNAME` para `gestao.enginesistemas.com.br` — e aí o `A` continua sendo o único no nome `gestao` |
| Registro de validação de certificado | **Depende do método.** Com Let's Encrypt por HTTP-01 (o previsto aqui), **nenhum registro extra é necessário**: a validação acontece pela porta 80 do próprio IP, depois que o `A` propagar. Só um certificado wildcard, ou a validação DNS-01, exigiria um `_acme-challenge` — e este não é o caso |
| Qualquer alteração em `MX`, `SPF`, `DKIM`, `DMARC` | **Não se toca.** É o e-mail de `enginesistemas.com.br`. Mexer aqui derruba correio, e nada nesta entrega precisa disso |
| Nameservers | **Não se transferem.** A zona continua na GoDaddy, como está |

## Depois de inserir: o que confere se deu certo

O procedimento está em [`IMPLANTACAO-LIGHTSAIL.md`](IMPLANTACAO-LIGHTSAIL.md), passo 8. Em resumo,
e nesta ordem — cada um só faz sentido depois do anterior:

```sh
# 1. O nome resolve? E resolve para o IP CERTO?
dig +short gestao.enginesistemas.com.br A

# 2. A aplicação responde por HTTP no nome (antes do certificado)?
curl -sS -o /dev/null -w '%{http_code}\n' http://gestao.enginesistemas.com.br/transparencia

# 3. Só agora o certificado — o Let's Encrypt precisa que o passo 1 já esteja valendo no mundo.
sudo certbot --nginx -d gestao.enginesistemas.com.br

# 4. E o HTTPS de verdade, com a validação LIGADA. `-k` aqui seria mentir para si mesmo.
curl -sS -o /dev/null -w '%{http_code}\n' https://gestao.enginesistemas.com.br/transparencia
```

⚠️ **A propagação não é instantânea.** Com TTL 600 o comum são minutos, mas um provedor de DNS
que ignora TTL pode levar horas. Se o passo 1 devolver vazio, a resposta é esperar e repetir —
**não** rodar o certbot assim mesmo: ele falha, e falhas repetidas batem no limite de tentativas
do Let's Encrypt, que é por semana.

## O estado honesto desta entrega

- `enginesistemas.com.br`, seus outros subdomínios e a zona da GoDaddy **não foram tocados**.
  Nenhuma chamada desta rodada escreveu em DNS nenhum — e nem poderia: o DNS é ato do usuário,
  por decisão da própria ordem.
- **Não é "falta só o DNS".** Falta, antes do DNS: credencial da identidade do projeto, permissão
  de Lightsail para ela, a instância, o IP e a instalação. O DNS é o **último** passo, não o único.
