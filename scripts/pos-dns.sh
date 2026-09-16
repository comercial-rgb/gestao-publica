#!/usr/bin/env bash
# ═══ CONFERÊNCIA DE PUBLICAÇÃO — pós-DNS, pós-TLS, pós-identidade (V10 T5) ═══
#
# ⚠️ ELE REPROVA QUANDO A EVIDÊNCIA FALTA. A versão anterior aceitava não encontrar o
# identificador do build e ainda assim terminava dizendo "isto cobre o aceite PUBLICADA" — um
# aceite que aprova o que não conferiu é pior que nenhum, porque alguém registra o resultado.
#
# ⚠️ ELE NÃO ESPERA NINGUÉM. Um script em laço até o DNS propagar parece travado e não diz nada.
# Roda uma vez, informa em que degrau parou, e o CÓDIGO DE SAÍDA nomeia o estado.
#
# ⚠️ CONFERIR E EMITIR SÃO COISAS DIFERENTES. Por padrão ele só CONFERE. A emissão do
# certificado só acontece com `--emitir`, e só na máquina que serve o nome — pedir certificado
# do Mac do desenvolvedor não funciona (o desafio HTTP-01 chega no servidor) e queima tentativa.
#
# OS ESTADOS (e o código de saída de cada um):
#    0  PUBLICADA_VALIDADA   — nome, TLS, rotas, negações e identidade conferidos
#   10  DNS_PENDENTE         — o nome não resolve
#   11  DNS_INESPERADO       — resolve para OUTRO destino (pior que não resolver)
#   12  APLICACAO_MUDA       — resolve, e a aplicação não responde
#   13  TLS_PENDENTE         — sem certificado válido
#   14  ROTAS_FALHARAM       — TLS ok, alguma rota não respondeu o esperado
#   15  IDENTIDADE_AUSENTE   — a instalação não declara qual candidato está no ar
#   16  IDENTIDADE_DIFERENTE — está no ar um candidato que não é o esperado
#   17  EXPOSICAO_INDEVIDA   — há rota autenticada servida em HTTP claro
#   20  USO_INCORRETO        — falta argumento obrigatório
#
# USO:
#   scripts/pos-dns.sh --nome gestao.enginesistemas.com.br --ip 1.2.3.4 --candidato 2590048+3424d989f3c1
#   scripts/pos-dns.sh --nome ... --ip ... --candidato ... --emitir      (emite o certificado, no servidor)
#
# ⚠️ AS COSTURAS DE TESTE (`POS_DNS_*`) só valem com `POS_DNS_MODO_TESTE=1`, e existem porque um
# instrumento que nunca foi visto acusando é um instrumento que ninguém sabe se acusa. Ver
# `test/pos-dns.test.ts`: DNS ausente, destino errado, 404, identidade ausente, identidade
# diferente e identidade correta — seis casos, sem emitir certificado público nem tocar em
# ambiente de terceiro.
set -uo pipefail

NOME=""
IP_ESPERADO=""
CANDIDATO_ESPERADO=""
EMITIR=0

while [ $# -gt 0 ]; do
  case "$1" in
    --nome) NOME="${2:-}"; shift 2 ;;
    --ip) IP_ESPERADO="${2:-}"; shift 2 ;;
    --candidato) CANDIDATO_ESPERADO="${2:-}"; shift 2 ;;
    --emitir) EMITIR=1; shift ;;
    *) echo "argumento desconhecido: $1"; exit 20 ;;
  esac
done

MODO_TESTE="${POS_DNS_MODO_TESTE:-0}"
# A base das requisições. Em produção é sempre https://<nome>; o teste aponta para um servidor local.
BASE_HTTPS="https://$NOME"
BASE_HTTP="http://$NOME"
RESOLVEDOR="dig +short"
if [ "$MODO_TESTE" = "1" ]; then
  BASE_HTTPS="${POS_DNS_BASE:-$BASE_HTTPS}"
  BASE_HTTP="${POS_DNS_BASE_HTTP:-$BASE_HTTP}"
  RESOLVEDOR="${POS_DNS_RESOLVEDOR:-$RESOLVEDOR}"
fi

if [ -z "$NOME" ]; then
  echo "USO INCORRETO: --nome e obrigatorio."
  exit 20
fi
if [ -z "$IP_ESPERADO" ]; then
  echo "USO INCORRETO: --ip e obrigatorio no modo de aceite."
  echo "  Conferir 'resolve para alguma coisa' nao e conferir 'resolve para a NOSSA maquina'."
  echo "  Um nome que resolve para servidor alheio passaria — e esse e o caso perigoso."
  exit 20
fi
if [ -z "$CANDIDATO_ESPERADO" ]; then
  echo "USO INCORRETO: --candidato e obrigatorio no modo de aceite."
  echo "  Sem ele nao ha como dizer se o que esta no ar e o artefato que foi validado."
  exit 20
fi

passo() { printf '\n[%s] %s\n' "$1" "$2"; }
falhar() { echo ""; echo "ESTADO: $1"; exit "$2"; }

# ─────────────────────────────────────────────────────────────────────────────
passo 1 "o nome resolve, e para o destino desta implantacao?"
# ⚠️ TRES CASOS DISTINTOS, e a versao anterior tratava um so:
#   · o resolvedor FALHA  -> nao e "nao resolve": e nao sabemos;
#   · resolve para VARIOS -> nao se escolhe o primeiro em silencio;
#   · resolve INDIRETO    -> um CNAME e legitimo, mas o A final e que tem de bater.
RESPOSTA="$($RESOLVEDOR "$NOME" A 2>/dev/null)"
ESTADO_DIG=$?
if [ "$ESTADO_DIG" -ne 0 ]; then
  echo "  O RESOLVEDOR FALHOU (codigo $ESTADO_DIG). Isto NAO e 'o nome nao existe' — e"
  echo "  'nao foi possivel perguntar'. Conferir a rede desta maquina antes de concluir."
  falhar "DNS_PENDENTE (resolvedor indisponivel)" 10
fi

ENDERECOS="$(echo "$RESPOSTA" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)"
INDIRETOS="$(echo "$RESPOSTA" | grep -vE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^$' || true)"
if [ -n "$INDIRETOS" ]; then
  echo "  resolucao INDIRETA no caminho: $(echo "$INDIRETOS" | tr '\n' ' ')"
  echo "  (legitimo; o que decide e o endereco final abaixo)"
fi
if [ -z "$ENDERECOS" ]; then
  echo "  NAO. $NOME ainda nao tem endereco visivel daqui."
  echo "  O que fazer: inserir o registro na GoDaddy (docs/operacao/DNS-GODADDY-gestao.md) e"
  echo "  repetir. Com TTL 600, a propagacao costuma levar minutos."
  falhar "DNS_PENDENTE" 10
fi

QUANTOS="$(echo "$ENDERECOS" | wc -l | tr -d ' ')"
if [ "$QUANTOS" -gt 1 ]; then
  echo "  ⚠️ RESOLVE PARA $QUANTOS ENDERECOS: $(echo "$ENDERECOS" | tr '\n' ' ')"
  echo "  Nao se escolhe um deles em silencio: parte do trafego iria para o outro."
  falhar "DNS_INESPERADO (multiplos enderecos)" 11
fi

IP_ATUAL="$(echo "$ENDERECOS" | head -1)"
if [ "$IP_ATUAL" != "$IP_ESPERADO" ]; then
  echo "  ⚠️ RESOLVE, MAS PARA OUTRO ENDERECO: $IP_ATUAL (esperado $IP_ESPERADO)."
  echo "  Isto e PIOR que nao resolver: o nome aponta para maquina alheia, e seguir daqui"
  echo "  significaria conferir o sistema de outra pessoa. NAO seguir."
  falhar "DNS_INESPERADO" 11
fi
echo "  sim: $IP_ATUAL (o esperado)"

# ─────────────────────────────────────────────────────────────────────────────
passo 2 "a aplicacao responde no nome?"
# ⚠️ O STATUS E LIDO E CLASSIFICADO, um a um. A versao anterior aceitava 200, 301 e 308 e
# tratava todo o resto como falha — mas nao olhava PARA ONDE o redirecionamento ia. Um proxy mal
# configurado que mandasse o trafego para outro sitio devolveria 301 e passaria. E `curl` sem
# `--fail` devolve SUCESSO com 404 e 500: "o servidor respondeu alguma coisa" nao e "a aplicacao
# esta no ar". Aqui nao se usa `--fail` porque o codigo e lido explicitamente — o que ele daria
# de graca, este `case` da com a mensagem certa para cada caso.
CODIGO="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE_HTTP/transparencia" 2>/dev/null || echo 000)"
DESTINO_REDIR="$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time 15 "$BASE_HTTP/transparencia" 2>/dev/null || echo "")"
case "$CODIGO" in
  200) echo "  sim: HTTP $CODIGO (servindo em claro — ver o passo 5)" ;;
  301|302|307|308)
    echo "  redireciona: HTTP $CODIGO -> ${DESTINO_REDIR:-(sem destino)}"
    case "$DESTINO_REDIR" in
      https://*) echo "  destino em HTTPS, como esperado" ;;
      "") echo "  ⚠️ redireciona sem destino declarado"; falhar "APLICACAO_MUDA" 12 ;;
      *) echo "  ⚠️ redireciona para fora do HTTPS: $DESTINO_REDIR"; falhar "APLICACAO_MUDA" 12 ;;
    esac
    ;;
  *)
    echo "  NAO: HTTP $CODIGO. O DNS chegou, a aplicacao nao."
    echo "  Conferir o servico (systemctl status) e o proxy no servidor."
    falhar "APLICACAO_MUDA" 12
    ;;
esac

# ─────────────────────────────────────────────────────────────────────────────
passo 3 "o certificado"
# ⚠️ Nada de `-k`. Desligar a validacao para "o teste passar" e afirmar HTTPS que nao existe.
TLS_OK=0
if curl -sS -o /dev/null --max-time 15 "$BASE_HTTPS/transparencia" 2>/dev/null; then
  TLS_OK=1
  echo "  valido — nada a emitir."
fi

if [ "$TLS_OK" -eq 0 ]; then
  if [ "$EMITIR" -ne 1 ]; then
    echo "  ausente ou invalido, e este script NAO emite sem --emitir."
    echo "  ⚠️ A EMISSAO ACONTECE NA MAQUINA QUE SERVE O NOME: o desafio HTTP-01 chega pela"
    echo "  porta 80 DESTE nome, e pedir do Mac do desenvolvedor nao funciona — so gasta"
    echo "  tentativa. Rode no servidor: scripts/pos-dns.sh --nome ... --ip ... --candidato ... --emitir"
    falhar "TLS_PENDENTE" 13
  fi
  if ! command -v certbot > /dev/null 2>&1; then
    echo "  ⚠️ certbot nao esta instalado NESTA maquina. Instale-o no servidor e repita la."
    falhar "TLS_PENDENTE (certbot ausente)" 13
  fi
  CONTA_ACME="${ACME_EMAIL:-}"
  if [ -z "$CONTA_ACME" ]; then
    echo "  ⚠️ ACME_EMAIL nao definido. A conta ACME e de alguem, e os termos do emissor sao"
    echo "  aceitos por esse alguem — aceita-los como efeito escondido de uma checagem poe no"
    echo "  nome de quem rodou o script um compromisso que ele nao leu."
    falhar "TLS_PENDENTE (conta ACME nao definida)" 13
  fi
  echo "  emitindo (HTTP-01, conta $CONTA_ACME):"
  # ⚠️ `--keep-until-expiring` REAPROVEITA certificado valido em vez de reemitir.
  if ! certbot --nginx -d "$NOME" --non-interactive --agree-tos -m "$CONTA_ACME" --keep-until-expiring; then
    echo "  ⚠️ a emissao falhou. NAO repetir em laco: emissores ACME tem limite de tentativas,"
    echo "  e o do Let's Encrypt e por certificado/por semana — leia a mensagem acima antes de"
    echo "  tentar de novo, porque a causa costuma estar nela."
    falhar "TLS_PENDENTE (emissao falhou)" 13
  fi
  echo "  emitido."
fi

# ─────────────────────────────────────────────────────────────────────────────
passo 4 "as rotas externas, com a validacao TLS LIGADA"
# ⚠️ QUATRO GETs 200 NAO SAO JORNADA DE NEGOCIO. Eles provam DISPONIBILIDADE de paginas. A
# jornada e provada pelos percursos de navegador do MESMO artefato (`scripts/smoke-*.ts`), e o
# relatorio deles e a evidencia que vale na homologacao. Isto aqui e o degrau anterior.
FALHAS=0
for rota in /transparencia /transparencia/bens /transparencia/despesas /servicos /login /consulta/certidao; do
  C="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_HTTPS$rota" 2>/dev/null || echo 000)"
  printf '  %-28s HTTP %s\n' "$rota" "$C"
  [ "$C" = "200" ] || FALHAS=$((FALHAS + 1))
done

passo 4b "as NEGACOES — o que NAO pode abrir sem sessao"
# ⚠️ O ACEITE TEM DE CONFERIR O QUE FECHA, e nao so o que abre. Uma configuracao de proxy errada
# que sirva a area autenticada como publica responderia 200 em tudo — e passaria num aceite que
# so procura 200.
for rota in /licenciamento /receita/lancamentos /administracao/usuarios; do
  C="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_HTTPS$rota" 2>/dev/null || echo 000)"
  DEST="$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time 20 "$BASE_HTTPS$rota" 2>/dev/null || echo "")"
  case "$C" in
    30[0-9])
      case "$DEST" in
        */login*) printf '  %-28s HTTP %s -> login (correto)\n' "$rota" "$C" ;;
        *) printf '  %-28s HTTP %s -> %s (INESPERADO)\n' "$rota" "$C" "$DEST"; FALHAS=$((FALHAS + 1)) ;;
      esac
      ;;
    401|403) printf '  %-28s HTTP %s (correto)\n' "$rota" "$C" ;;
    *) printf '  %-28s HTTP %s — rota autenticada respondendo sem sessao\n' "$rota" "$C"; FALHAS=$((FALHAS + 1)) ;;
  esac
done

if [ "$FALHAS" -gt 0 ]; then
  echo ""
  echo "⚠️ $FALHAS verificacao(oes) de rota falharam. NAO registrar como publicada."
  falhar "ROTAS_FALHARAM" 14
fi

# ─────────────────────────────────────────────────────────────────────────────
passo 5 "a area autenticada NAO e servida em HTTP claro"
# ⚠️ O ROTEIRO ANTIGO AFIRMAVA QUE O LOGIN ESTAVA PROTEGIDO e nao conferia. Antes do HTTPS, so
# o necessario para a validacao ACME e o redirecionamento deve responder em claro — um
# formulario de login em HTTP e senha trafegando aberta, com o documento dizendo o contrario.
C_CLARO="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE_HTTP/login" 2>/dev/null || echo 000)"
case "$C_CLARO" in
  200)
    echo "  ⚠️ /login responde 200 em HTTP CLARO. Senha trafegaria aberta."
    echo "  Conferir o proxy: em claro so devem passar /.well-known/acme-challenge e o redirect."
    falhar "EXPOSICAO_INDEVIDA" 17
    ;;
  30[0-9]) echo "  ok: HTTP $C_CLARO (redireciona para HTTPS)" ;;
  *) echo "  ok: HTTP $C_CLARO (nao serve conteudo em claro)" ;;
esac

# ─────────────────────────────────────────────────────────────────────────────
passo 6 "a identidade do que esta no ar"
# ⚠️ AQUI ESTAVA O ACEITE FALSO. A versao anterior procurava um `data-build` no HTML, aceitava
# nao achar, e terminava aprovando. Agora a identidade e OBRIGATORIA e vem de um endereco
# proprio (`/release`), que a instalacao preenche a partir do manifesto do pacote.
IDENTIDADE="$(curl -sS --max-time 15 "$BASE_HTTPS/release" 2>/dev/null || echo "")"
CANDIDATO_NO_AR="$(echo "$IDENTIDADE" | sed -n 's/.*"candidato":"\([^"]*\)".*/\1/p')"
if [ -z "$CANDIDATO_NO_AR" ]; then
  echo "  A instalacao NAO declara qual candidato esta no ar."
  echo "  resposta de /release: ${IDENTIDADE:-(vazia)}"
  echo "  O que fazer: definir IDENTIDADE_DO_CANDIDATO na unit do servico, a partir do"
  echo "  manifesto do pacote instalado (docs/operacao/IMPLANTACAO-LIGHTSAIL.md)."
  falhar "IDENTIDADE_AUSENTE" 15
fi
echo "  no ar: $CANDIDATO_NO_AR"
if [ "$CANDIDATO_NO_AR" != "$CANDIDATO_ESPERADO" ]; then
  echo "  ⚠️ NAO E O CANDIDATO ESPERADO ($CANDIDATO_ESPERADO)."
  echo "  Esta no ar um artefato diferente do que foi validado. NAO registrar como publicada."
  falhar "IDENTIDADE_DIFERENTE" 16
fi
echo "  confere com o candidato validado."

echo ""
echo "ESTADO: PUBLICADA_VALIDADA"
echo "Conferidos: resolucao para o destino desta implantacao, resposta da aplicacao, TLS valido,"
echo "rotas publicas, NEGACAO das rotas autenticadas, ausencia de conteudo autenticado em claro e"
echo "a identidade do candidato no ar."
echo ""
echo "⚠️ O QUE ISTO NAO COBRE, e cada um tem evidencia propria: a suite de testes, a suite sob"
echo "outro fuso, os percursos de navegador, a instalacao/upgrade em banco limpo e o restore do"
echo "backup. Quatro respostas 200 provam que a pagina abre, nao que a jornada funciona."
exit 0
