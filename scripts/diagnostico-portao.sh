#!/usr/bin/env bash
# diagnostico-portao.sh — descobre POR QUE o test:tudo esta pendurado.
# Seguro: nao mata nada, so observa. Rode em OUTRO terminal, com o portao rodando.

set -uo pipefail
bold(){ printf "\n\033[1m%s\033[0m\n" "$1"; }
info(){ printf "  ---  %s\n" "$1"; }

bold "1. PROCESSOS — quem esta vivo e consumindo o que"
printf "  %-8s %-6s %-6s %-10s %s\n" "PID" "%CPU" "%MEM" "TEMPO" "COMANDO"
ps -Ao pid,pcpu,pmem,etime,command 2>/dev/null \
  | grep -E "vitest|prisma|portao|tsx|next|node" | grep -v grep \
  | awk '{printf "  %-8s %-6s %-6s %-10s %s\n", $1,$2,$3,$4, substr($0, index($0,$5), 90)}' | head -15
info "CPU perto de 0 = pendurado esperando. CPU alta = trabalhando (ou paginando)."

bold "2. MEMORIA E SWAP"
sysctl vm.swapusage 2>/dev/null
vm_stat 2>/dev/null | awk '
  /page size of/ {gsub(/[^0-9]/,"",$8); ps=$8}
  /Pages free/ {gsub(/\./,"",$3); free=$3}
  /Pages active/ {gsub(/\./,"",$3); act=$3}
  /Pages wired/ {gsub(/\./,"",$4); wir=$4}
  /Pageouts/ {gsub(/\./,"",$NF); po=$NF}
  END {
    printf "  RAM livre ...... %.0f MB\n", free*ps/1048576
    printf "  RAM ativa ...... %.0f MB\n", act*ps/1048576
    printf "  RAM wired ...... %.0f MB\n", wir*ps/1048576
  }'
info "Referencia medida em 10/09 neste Mac: durante a suite, RAM livre 29-232 MB."

bold "3. DOCKER — o Postgres esta de pe?"
if command -v docker >/dev/null 2>&1; then
  docker ps --format '  {{.Names}}  |  {{.Status}}  |  {{.Ports}}' 2>&1 | head -10
  CONT="$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep 5436 | awk '{print $1}' | head -1)"
  if [ -n "$CONT" ]; then
    info "container na porta 5436: $CONT"
    docker exec "$CONT" pg_isready 2>&1 | sed 's/^/  /'
  else
    printf "  \033[31mNENHUM container publicando a porta 5436\033[0m\n"
    info "Se e isso, o global-setup esta pendurado no connect(), que nao tem timeout."
  fi
else
  info "docker nao encontrado no PATH"
fi

bold "4. PORTA 5436 responde?"
nc -zv -G 3 localhost 5436 2>&1 | sed 's/^/  /'
info "Recusado = falha rapida e clara. SEM RESPOSTA = espera infinita, o caso mudo."

bold "5. O QUE O POSTGRES ESTA FAZENDO"
if [ -n "${CONT:-}" ]; then
  docker exec "$CONT" psql -U gestao -d postgres -tAc "
    SELECT '  pid=' || pid
        || ' | db=' || coalesce(datname,'-')
        || ' | app=' || coalesce(application_name,'-')
        || ' | estado=' || coalesce(state,'-')
        || ' | espera=' || coalesce(wait_event_type,'-') || '/' || coalesce(wait_event,'-')
        || ' | ha ' || coalesce(date_trunc('second', now()-query_start)::text,'-')
        || ' | ' || left(regexp_replace(coalesce(query,'-'), '\s+', ' ', 'g'), 70)
      FROM pg_stat_activity
     WHERE pid <> pg_backend_pid() AND datname IS NOT NULL
     ORDER BY query_start;" 2>&1 | head -20
  echo
  info "advisory locks (a trava da suite usa a chave 728113355):"
  docker exec "$CONT" psql -U gestao -d postgres -tAc "
    SELECT '  objid=' || objid || ' pid=' || pid || ' granted=' || granted
      FROM pg_locks WHERE locktype='advisory';" 2>&1 | head -10
else
  info "sem container identificado — pulando"
fi

bold "6. VEREDITO RAPIDO"
echo "  Sem container na 5436 .................. banco fora, connect pendurado"
echo "  Container ok + vitest com CPU ~0 ....... pendurado no prisma migrate deploy"
echo "  Container ok + vitest com CPU alta ..... rodando; ver swap acima"
echo "  query 'CREATE INDEX'/'migrate' presa ... migration segurando lock"
