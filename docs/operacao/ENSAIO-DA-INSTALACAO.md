# O ensaio da instalação — o que foi executado em Linux, e o que não foi

> V10 T5. Executado em 2026-09-16, nesta máquina, em container descartável.
> **Nenhum recurso de nuvem foi criado, alterado ou removido. Nenhum custo novo.**

## Por que ensaiar

A ordem V10 apontou, com razão, que o roteiro de implantação trazia **trechos de exemplo** e
afirmações que ninguém tinha verificado: `apt-get install -y postgresql` não prova a versão que o
candidato exige; "Chromium instalado" não prova que um PDF sai; e uma unit `systemd` sem `User=`
roda a aplicação inteira como **root**.

Trecho de exemplo não se ensaia. Por isso o roteiro passou a ter dois scripts —
`scripts/conferir-runtime.sh` e `scripts/instalar-no-servidor.sh` — e o primeiro foi **ensaiado
em Linux**, caso a caso.

## O que foi ensaiado

`scripts/ensaio-das-precondicoes.sh`, dentro de um container `postgres:18`
(**Debian GNU/Linux 13 trixie**), com binários de mentira no `PATH`. Sete casos: seis que devem
**reprovar**, e o sétimo que deve **aprovar** — porque um guard que só foi visto vermelho não
prova que o verde é alcançável.

```sh
docker run --rm -v "$PWD:/repo:ro" \
  -v "$PWD/scripts/ensaio-das-precondicoes.sh:/ensaio.sh:ro" \
  postgres:18 bash /ensaio.sh
```

Saída medida:

```
== ensaio das pre-condicoes, em "Debian GNU/Linux 13 (trixie)" ==

OK   1. node ausente                            saida=10    node nao encontrado nesta maquina.
OK   2. node de outra linha (v20)               saida=10    node v20: esperado v22 …
OK   3. psql presente e mudo                    saida=11    psql presente, mas nao respondeu a versao.
OK   4. postgres de outra linha (16)            saida=11    postgresql 16.4: esperado a linha 18 …
OK   5. chromium ausente                        saida=12    chromium nao encontrado — o PDF nao sai sem ele.
OK   6. fontconfig ausente                      saida=12    fontconfig (fc-list) nao encontrado …
OK   7. tudo certo (o verde e alcancavel)       saida=0

== e o psql REAL do container, sem mentira nenhuma ==
  postgresql: 18.6
  [runtime] pre-condicoes satisfeitas.
  saida=0
```

⚠️ **O último bloco importa mais do que parece**: ele roda contra o `psql` **de verdade** da
imagem, sem nenhuma mentira no caminho, e confirma que a versão que o guard exige (18) é a que a
imagem oficial entrega — ou seja, o alvo do roteiro é alcançável, e não um número inventado.

⚠️ **Um caso NÃO é reproduzível aqui, e está declarado**: "psql totalmente ausente". A imagem
embarca o `psql`, e tirá-lo do `PATH` sem tirar `grep` e `awk` junto não vale o esforço. O ramo é
o mesmo `command -v` que o caso 1 já viu acusar com o `node`; o que se ensaiou no lugar foi o
vizinho — binário presente e mudo —, que é um risco real (pacote quebrado, wrapper errado).

## O que NÃO foi ensaiado, e por quê

| Item | Por que não |
|---|---|
| `scripts/instalar-no-servidor.sh` inteiro | exige servidor com banco provisionado, `sudo` e `systemd`. Num container sem `systemd`, o passo da unit não roda — e um ensaio que pula o passo mais perigoso não é ensaio |
| O PDF de verdade (`preflight-navegador.ts`) no alvo | exige Chromium e fontes instalados no servidor; a imagem `postgres:18` não os tem, e instalá-los no container provaria o container, não o alvo |
| Backup e restauração | o destino externo ainda não foi decidido — ver `IMPLANTACAO-LIGHTSAIL.md`, passo 7 |
| Qualquer passo de nuvem | bloqueado por acesso — ver `AWS-PREFLIGHT-V9-N7.md` |

## O aceite da publicação

`scripts/pos-dns.sh` foi ensaiado por outro caminho, que não precisa de servidor real:
`test/pos-dns.test.ts`, **13 casos**, com servidor local e resolvedor de mentira. Nove deles são
recusas (DNS ausente, destino diferente, múltiplos endereços, 404, 500, rota autenticada aberta,
login em claro, identidade ausente, identidade diferente), e o décimo é o caso positivo.
Nenhum certificado público foi emitido e nenhum ambiente de terceiro foi consultado.
