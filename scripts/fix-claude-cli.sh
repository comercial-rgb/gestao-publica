#!/usr/bin/env bash
# fix-claude-cli.sh — diagnostica e corrige o erro:
#   "Claude Code 2.1.207 does not support this model; version 2.1.251 or newer is required"
#
# Uso:
#   bash fix-claude-cli.sh            # so diagnostica
#   bash fix-claude-cli.sh --fix      # diagnostica e corrige
#
# Testado em: macOS (zsh/bash)

set -uo pipefail

MIN_REQUIRED="2.1.251"
TARGET="2.1.270"   # canal 'latest' em 12/09/2026

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  \033[32mOK\033[0m   %s\n" "$1"; }
bad()  { printf "  \033[31mFALHA\033[0m %s\n" "$1"; }
info() { printf "  ---  %s\n" "$1"; }

vercmp() { # vercmp A B -> 0 se A >= B
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

bold "=== 1. Binarios 'claude' no PATH ==="
which -a claude 2>/dev/null || bad "nenhum 'claude' no PATH"
echo

bold "=== 2. Versao ativa ==="
CUR="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [ -z "$CUR" ]; then
  bad "nao consegui ler a versao"
else
  if vercmp "$CUR" "$MIN_REQUIRED"; then
    ok "versao $CUR (>= $MIN_REQUIRED) — o CLI do PATH nao e a causa"
  else
    bad "versao $CUR — abaixo do minimo $MIN_REQUIRED"
  fi
fi
echo

bold "=== 3. Metodo de instalacao ==="
CLAUDE_PATH="$(command -v claude 2>/dev/null)"
info "caminho ativo: ${CLAUDE_PATH:-<nenhum>}"
if npm ls -g --depth=0 2>/dev/null | grep -q "@anthropic-ai/claude-code"; then
  info "npm global: $(npm ls -g --depth=0 2>/dev/null | grep '@anthropic-ai/claude-code')"
  METODO="npm"
elif [ -d "$HOME/.local/share/claude" ] || [ -d "$HOME/.claude/local" ]; then
  info "instalacao nativa detectada"
  METODO="native"
else
  info "metodo indeterminado"
  METODO="?"
fi
echo

bold "=== 4. CLI embutido na extensao do Cursor ==="
FOUND_EMBED=0
for d in "$HOME/.cursor/extensions" "$HOME/.cursor-server/extensions" "$HOME/.vscode/extensions"; do
  [ -d "$d" ] || continue
  while IFS= read -r ext; do
    FOUND_EMBED=1
    info "extensao: $ext"
    find "$ext" -maxdepth 4 \( -name "cli.js" -o -name "claude" \) -type f 2>/dev/null | while read -r f; do
      info "  binario embutido: $f"
    done
  done < <(find "$d" -maxdepth 1 -iname "*claude*" -type d 2>/dev/null)
done
[ "$FOUND_EMBED" -eq 0 ] && info "nenhuma extensao Claude encontrada nesses caminhos"
echo

bold "=== 5. Canal de update configurado ==="
# ATENCAO: o canal 'stable' esta em 2.1.236 — ABAIXO do minimo exigido.
grep -R "installMethod\|autoUpdater\|channel" "$HOME/.claude.json" "$HOME/.claude/settings.json" 2>/dev/null | head -10 \
  || info "sem canal explicito nos configs"
echo

if [ "${1:-}" != "--fix" ]; then
  bold ">>> Diagnostico concluido. Rode com --fix para corrigir."
  exit 0
fi

bold "=== 6. CORRIGINDO -> $TARGET ==="
case "$METODO" in
  npm)
    info "npm install -g @anthropic-ai/claude-code@$TARGET"
    npm install -g "@anthropic-ai/claude-code@$TARGET" || { bad "npm falhou"; exit 1; }
    ;;
  *)
    info "tentando 'claude update' primeiro"
    claude update 2>&1 | tail -5
    NEW="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    if [ -n "$NEW" ] && vercmp "$NEW" "$MIN_REQUIRED"; then
      ok "atualizou para $NEW"
    else
      bad "ficou em ${NEW:-?} (provavel canal 'stable' = 2.1.236). Instalando via npm."
      npm install -g "@anthropic-ai/claude-code@$TARGET" || { bad "npm falhou"; exit 1; }
    fi
    ;;
esac
echo

bold "=== 7. Verificacao final ==="
hash -r 2>/dev/null || true
FINAL="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [ -n "$FINAL" ] && vercmp "$FINAL" "$MIN_REQUIRED"; then
  ok "claude $FINAL — requisito atendido"
  bold ">>> Agora feche o Cursor com Cmd+Q (nao so a janela) e reabra."
else
  bad "ainda em ${FINAL:-?}. Me mande a saida completa deste script."
fi
