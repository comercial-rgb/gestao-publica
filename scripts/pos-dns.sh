#!/usr/bin/env bash
# Conferência pós-DNS de gestao.enginesistemas.com.br — idempotente, sem laço infinito.
#
# ⚠️ ELE NÃO ESPERA NINGUÉM. Um script que fica em laço até o DNS propagar parece travado,
# ocupa a máquina e não diz nada. Este roda uma vez, informa exatamente em que degrau parou,
# e sai com código != 0 — quem chamar decide se roda de novo daqui a dez minutos.
#
# ⚠️ E ELE NÃO CHAMA O CERTBOT ANTES DA HORA. Tentativa de emissão com o nome ainda sem
# resolver falha, e falhas repetidas batem no limite SEMANAL do Let's Encrypt — o conserto
# passa a ser "esperar até a semana que vem".
set -uo pipefail

NOME="${1:-gestao.enginesistemas.com.br}"
IP_ESPERADO="${2:-}"

passo() { printf '\n[%s] %s\n' "$1" "$2"; }

passo 1 "o nome resolve?"
IP_ATUAL="$(dig +short "$NOME" A | head -1)"
if [ -z "$IP_ATUAL" ]; then
  echo "  NAO. $NOME ainda nao tem registro A visivel daqui."
  echo "  O que fazer: inserir o registro A na GoDaddy (docs/operacao/DNS-GODADDY-gestao.md) e"
  echo "  repetir este script. Propagacao com TTL 600 costuma levar minutos."
  exit 10
fi
echo "  sim: $IP_ATUAL"

if [ -n "$IP_ESPERADO" ] && [ "$IP_ATUAL" != "$IP_ESPERADO" ]; then
  echo "  ⚠️ RESOLVE, MAS PARA OUTRO ENDERECO (esperado $IP_ESPERADO)."
  echo "  Isto e pior que nao resolver: o nome esta apontando para maquina alheia. NAO seguir."
  exit 11
fi

passo 2 "a aplicacao responde por HTTP no nome?"
CODIGO="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "http://$NOME/transparencia" || echo 000)"
if [ "$CODIGO" != "200" ] && [ "$CODIGO" != "301" ] && [ "$CODIGO" != "308" ]; then
  echo "  NAO: HTTP $CODIGO. O DNS chegou, a aplicacao nao. Conferir o servico e o nginx no servidor."
  exit 12
fi
echo "  sim: HTTP $CODIGO"

passo 3 "o certificado"
if curl -sS -o /dev/null --max-time 15 "https://$NOME/transparencia" 2>/dev/null; then
  echo "  ja valido — nada a emitir. (Idempotente: rodar de novo nao reemite.)"
else
  echo "  ausente ou invalido. Emitindo pelo certbot (HTTP-01, pela porta 80 deste nome):"
  sudo certbot --nginx -d "$NOME" --non-interactive --agree-tos --keep-until-expiring || {
    echo "  ⚠️ a emissao falhou. NAO repetir em laco: o limite do Let's Encrypt e semanal."
    exit 13
  }
fi

passo 4 "as jornadas externas, com a validacao TLS LIGADA"
# ⚠️ Nada de `-k` aqui. Desligar a validacao para "o teste passar" e afirmar HTTPS que nao existe.
FALHAS=0
for rota in /transparencia /transparencia/bens /servicos /login; do
  C="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://$NOME$rota" || echo 000)"
  printf '  %-24s HTTP %s\n' "$rota" "$C"
  [ "$C" = "200" ] || FALHAS=$((FALHAS + 1))
done

passo 5 "a identidade do build que esta no ar"
curl -sS --max-time 15 "https://$NOME/transparencia" | grep -o 'data-build="[^"]*"' | head -1 || \
  echo "  (a pagina nao publica o identificador do build — conferir pelo registro do candidato)"

if [ "$FALHAS" -gt 0 ]; then
  echo ""
  echo "⚠️ $FALHAS rota(s) nao responderam 200. NAO registrar como PUBLICADA."
  exit 14
fi

echo ""
echo "OK: resolucao, HTTP, TLS valido e as rotas externas responderam."
echo "Isto cobre o aceite PUBLICADA. NAO cobre suite, percursos nem instalacao — cada um tem"
echo "evidencia propria."
