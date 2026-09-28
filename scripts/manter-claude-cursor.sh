#!/usr/bin/env bash
# manter-claude-cursor.sh
# Reaplica o patch do binario Claude Code no Cursor sempre que necessario.
# Idempotente: se o Cursor ja estiver com binario >= MIN, nao faz nada.
#
# Por que existe: a extensao do Cursor vem do Open VSX, que serve versao antiga
# (2.1.207). O binario embutido dela e trocado pelo do VS Code. Toda vez que o
# Cursor atualizar/reinstalar a extensao, o binario antigo volta.
#
# Uso:
#   bash manter-claude-cursor.sh          # verifica e corrige se preciso
#   bash manter-claude-cursor.sh --check  # so verifica, nao altera (exit 1 se quebrado)

set -uo pipefail
MIN="2.1.251"
CUR_EXT="$HOME/.cursor/extensions"
VSC_EXT="$HOME/.vscode/extensions"

ok(){   printf "  \033[32mOK\033[0m   %s\n" "$1"; }
bad(){  printf "  \033[31mFALHA\033[0m %s\n" "$1"; }
info(){ printf "  ---  %s\n" "$1"; }
vercmp(){ [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

# Binario ativo do Cursor = o da extensao de MAIOR versao instalada la
dir_ext_cursor="$(find "$CUR_EXT" -maxdepth 1 -iname 'anthropic.claude-code-*-darwin-arm64' -type d 2>/dev/null | sort -V | tail -1)"
[ -z "$dir_ext_cursor" ] && { bad "nenhuma extensao Claude Code no Cursor"; exit 1; }
BIN_CURSOR="$dir_ext_cursor/resources/native-binary/claude"
[ -f "$BIN_CURSOR" ] || { bad "binario nao encontrado: $BIN_CURSOR"; exit 1; }

V_ATUAL="$("$BIN_CURSOR" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
info "Cursor usa: $dir_ext_cursor"
info "binario atual: ${V_ATUAL:-?}"

if [ -n "$V_ATUAL" ] && vercmp "$V_ATUAL" "$MIN"; then
  ok "binario $V_ATUAL atende o minimo $MIN — nada a fazer"
  exit 0
fi

bad "binario ${V_ATUAL:-?} abaixo de $MIN"
[ "${1:-}" = "--check" ] && exit 1

# Procura a melhor origem: qualquer binario claude >= MIN no VS Code ou no proprio Cursor
MELHOR=""; MELHOR_V=""
while IFS= read -r b; do
  [ -f "$b" ] || continue
  v="$("$b" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  [ -z "$v" ] && continue
  if [ -z "$MELHOR_V" ] || vercmp "$v" "$MELHOR_V"; then MELHOR="$b"; MELHOR_V="$v"; fi
done < <(find "$VSC_EXT" "$CUR_EXT" -path '*/resources/native-binary/claude' -type f 2>/dev/null)

if [ -z "$MELHOR" ] || ! vercmp "$MELHOR_V" "$MIN"; then
  bad "nenhuma origem >= $MIN disponivel (melhor encontrada: ${MELHOR_V:-nenhuma})"
  info "Abra o VS Code e deixe a extensao Claude Code atualizar; depois rode isto de novo."
  exit 1
fi

info "origem: $MELHOR ($MELHOR_V)"
[ -f "$BIN_CURSOR.bak" ] || cp -p "$BIN_CURSOR" "$BIN_CURSOR.bak"
cp -p "$MELHOR" "$BIN_CURSOR" && chmod +x "$BIN_CURSOR"
xattr -d com.apple.quarantine "$BIN_CURSOR" 2>/dev/null || true
ok "Cursor agora em $("$BIN_CURSOR" --version 2>/dev/null | head -1)"
printf "\033[1m>>> Feche o Cursor com Cmd+Q e reabra.\033[0m\n"
