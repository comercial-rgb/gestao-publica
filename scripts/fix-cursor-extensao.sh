#!/usr/bin/env bash
# fix-cursor-extensao.sh
# Problema A: a extensao Claude Code do Cursor traz um binario EMBUTIDO 2.1.207,
# abaixo do minimo 2.1.251. Atualizar o npm global NAO corrige isso.
#
# Uso:
#   bash fix-cursor-extensao.sh            # diagnostica
#   bash fix-cursor-extensao.sh --fix      # tenta atualizar pela CLI do Cursor
#   bash fix-cursor-extensao.sh --patch    # fallback: copia o binario novo do VS Code

set -uo pipefail
MIN="2.1.251"
CUR_EXT_DIR="$HOME/.cursor/extensions"
VSC_EXT_DIR="$HOME/.vscode/extensions"

bold(){ printf "\033[1m%s\033[0m\n" "$1"; }
ok(){ printf "  \033[32mOK\033[0m   %s\n" "$1"; }
bad(){ printf "  \033[31mFALHA\033[0m %s\n" "$1"; }
info(){ printf "  ---  %s\n" "$1"; }
vercmp(){ [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

melhor_versao() { # dir -> imprime a maior versao de extensao claude-code encontrada
  find "$1" -maxdepth 1 -iname "anthropic.claude-code-*-darwin-arm64" -type d 2>/dev/null \
    | sed -E 's/.*claude-code-([0-9.]+)-darwin.*/\1/' | sort -V | tail -1
}

bold "=== Extensao no CURSOR ==="
CUR_V="$(melhor_versao "$CUR_EXT_DIR")"
if [ -z "$CUR_V" ]; then
  bad "nenhuma extensao Claude Code no Cursor"
elif vercmp "$CUR_V" "$MIN"; then
  ok "Cursor tem $CUR_V (>= $MIN)"
else
  bad "Cursor tem $CUR_V — abaixo de $MIN. Esta e a causa do erro."
fi

bold "=== Extensao no VS CODE (referencia) ==="
VSC_V="$(melhor_versao "$VSC_EXT_DIR")"
[ -n "$VSC_V" ] && ok "VS Code tem $VSC_V" || info "nenhuma no VS Code"

bold "=== CLI do Cursor disponivel? ==="
if command -v cursor >/dev/null 2>&1; then
  ok "cursor CLI: $(command -v cursor)"
  HAS_CLI=1
else
  info "cursor CLI ausente. No Cursor: Cmd+Shift+P -> 'Shell Command: Install cursor command'"
  HAS_CLI=0
fi
echo

case "${1:-}" in
  --fix)
    bold "=== Atualizando extensao via CLI do Cursor ==="
    if [ "$HAS_CLI" -eq 0 ]; then
      bad "sem CLI do Cursor. Atualize pela UI: Extensions -> Claude Code -> Update/Reinstall."
      exit 1
    fi
    cursor --install-extension anthropic.claude-code --force 2>&1 | tail -10
    echo
    NOVA="$(melhor_versao "$CUR_EXT_DIR")"
    if [ -n "$NOVA" ] && vercmp "$NOVA" "$MIN"; then
      ok "Cursor agora em $NOVA. Feche o Cursor com Cmd+Q e reabra."
    else
      bad "continua em ${NOVA:-?}. O marketplace do Cursor pode estar servindo versao antiga."
      info "Fallback: rode este script com --patch"
    fi
    ;;

  --patch)
    bold "=== FALLBACK: substituir o binario embutido do Cursor ==="
    info "Isso troca o executavel dentro da extensao do Cursor pelo do VS Code."
    info "E reversivel: o backup fica com sufixo .bak"
    [ -z "$VSC_V" ] && { bad "sem extensao no VS Code para copiar"; exit 1; }
    vercmp "$VSC_V" "$MIN" || { bad "VS Code tambem esta em $VSC_V, abaixo de $MIN"; exit 1; }

    SRC="$VSC_EXT_DIR/anthropic.claude-code-$VSC_V-darwin-arm64/resources/native-binary/claude"
    DST="$CUR_EXT_DIR/anthropic.claude-code-$CUR_V-darwin-arm64/resources/native-binary/claude"
    [ -f "$SRC" ] || { bad "origem nao existe: $SRC"; exit 1; }
    [ -f "$DST" ] || { bad "destino nao existe: $DST"; exit 1; }

    info "origem : $SRC ($("$SRC" --version 2>/dev/null | head -1))"
    info "destino: $DST ($("$DST" --version 2>/dev/null | head -1))"
    cp -p "$DST" "$DST.bak" && ok "backup criado: $DST.bak"
    cp -p "$SRC" "$DST" && chmod +x "$DST" && ok "binario substituido"
    xattr -d com.apple.quarantine "$DST" 2>/dev/null || true
    echo
    ok "agora: $("$DST" --version 2>/dev/null | head -1)"
    bold ">>> Feche o Cursor com Cmd+Q e reabra."
    info "Para reverter: mv \"$DST.bak\" \"$DST\""
    ;;

  *)
    bold ">>> Diagnostico concluido."
    info "--fix   : atualiza a extensao pela CLI do Cursor (caminho limpo)"
    info "--patch : troca o binario embutido pelo do VS Code (fallback)"
    ;;
esac
