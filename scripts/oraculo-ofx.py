"""
O ORACULO DO OFX -- uma implementacao INDEPENDENTE, para conferir a nossa.

  Por que este arquivo existe
  ---------------------------
  Ate 2026-09-10, `packages/ofx/ofx.test.ts` conferia o nosso parser COM O NOSSO
  PARSER: montava um OFX com o helper `ofx()`, chamava `parseOfx`, e comparava o
  resultado com o que o proprio teste tinha acabado de escrever no arquivo. Um
  teste assim passa com QUALQUER interpretacao errada, desde que seja consistente
  -- foi exatamente assim que o offset do diretorio central do zip sobreviveu a
  oito testes verdes.

  Aqui quem le o arquivo e o `ofxtools` 1.1.1 (PyPI, projeto de terceiros, sem
  relacao com este repositorio). O que ele extrai vira `esperado.json`, e o teste
  do vitest confronta o NOSSO parser com o que O OUTRO leu.

  Uso:
      python3 scripts/oraculo-ofx.py                 # confere (falha se divergir)
      python3 scripts/oraculo-ofx.py --gravar        # regrava o esperado.json

  Dependencia: `ofxtools`. Ela NAO entra no package.json nem no runtime -- e uma
  ferramenta de conferencia, roda a mao quando o corpus muda. O esperado.json
  fica versionado justamente para que a suite nao dependa de python nem de rede.
"""

import json
import re
import sys
from datetime import timedelta, timezone
from decimal import Decimal
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CORPUS = RAIZ / "packages" / "ofx" / "corpus"
ESPERADO = CORPUS / "esperado.json"

try:
    from ofxtools.Parser import OFXTree
except ImportError:
    print(
        "ofxtools nao esta instalado. Este script e uma ferramenta de conferencia,\n"
        "nao uma dependencia da suite. Para rodar:\n"
        "    python3 -m venv .venv-ofx\n"
        "    .venv-ofx/bin/pip install ofxtools==1.1.1\n"
        "    .venv-ofx/bin/python scripts/oraculo-ofx.py --gravar",
        file=sys.stderr,
    )
    raise SystemExit(2)


# ═══ ⚠️ A DIVERGENCIA QUE ESTE ORACULO ENCONTROU NA PRIMEIRA EXECUCAO ═══
#
# O `ofxtools` normaliza DTPOSTED para UTC e guarda o INSTANTE. A transacao
#     <DTPOSTED>20260131235900[-3:BRT]
# vira `datetime(2026, 2, 1, 2, 59, tzinfo=UTC)` -- e `.date()` sobre ela e
# **2026-02-01**. O nosso parser descarta o fuso e guarda **2026-01-31**.
#
# Um dia de diferenca, numa transacao do ultimo dia do mes: ela MUDA DE MES. Numa
# conciliacao bancaria mensal isso e a diferenca entre fechar e nao fechar.
#
# ⚠️ QUEM ESTA CERTO E O NOSSO PARSER, e a razao e de dominio, nao de biblioteca:
# a conciliacao e feita contra o EXTRATO QUE O TESOUREIRO TEM NA MAO, e o extrato
# do banco brasileiro mostra 31/01. Lancar essa linha em fevereiro porque o
# instante em Greenwich ja virou o dia deixaria a conciliacao de janeiro
# permanentemente aberta por uma transacao que o papel diz que e de janeiro.
#
# ⚠️ E ISTO **NAO** E "AJUSTAR O ORACULO PARA O TESTE PASSAR". O oraculo continua
# sendo quem le o arquivo; o que se corrigiu foi o ADAPTADOR -- a regra de qual
# data do calendario um instante pertence e decisao de dominio, e ela tem de ser
# aplicada aos DOIS lados ou a comparacao vira comparacao de convencao.
#
# Para que a divergencia nunca desapareca de vista, o esperado.json guarda AS
# DUAS: `instanteUtc` (o oraculo cru, sem interpretacao nossa) e
# `dataLocalDeclarada` (o mesmo instante no fuso que O ARQUIVO declara). O teste
# confronta o nosso parser com a segunda; a primeira fica de testemunha.

_FUSO = re.compile(r"<DTPOSTED>\s*(\d{8,14})(?:\[([+-]?\d+(?:\.\d+)?)(?::[^\]]*)?\])?")


def offsets_declarados(caminho: Path) -> list:
    """Os offsets que o ARQUIVO declara, em ordem. Extracao mecanica do texto cru --
    nao e uma segunda implementacao do parse, e so le o colchete que o ofxtools
    descarta ao normalizar para UTC."""
    bruto = caminho.read_text(encoding="latin-1")
    fusos = []
    for _, off in _FUSO.findall(bruto):
        fusos.append(timezone(timedelta(hours=float(off))) if off else None)
    return fusos


def ler(caminho: Path) -> dict:
    arvore = OFXTree()
    with caminho.open("rb") as fh:
        arvore.parse(fh)
    ofx = arvore.convert()
    extrato = ofx.statements[0]

    fusos = offsets_declarados(caminho)

    transacoes = []
    for i, t in enumerate(extrato.transactions):
        valor = Decimal(t.trnamt)
        fuso = fusos[i] if i < len(fusos) else None
        local = t.dtposted.astimezone(fuso) if fuso is not None else t.dtposted
        transacoes.append(
            {
                "fitid": t.fitid,
                # O oraculo CRU, sem interpretacao nossa -- ver o bloco acima.
                "instanteUtc": t.dtposted.isoformat(),
                # O mesmo instante no fuso que O ARQUIVO declara. E esta que o teste
                # confronta com o nosso parser.
                "dataLocalDeclarada": local.date().isoformat(),
                # ⚠️ VALOR ABSOLUTO + NATUREZA, e nao o sinal cru. E a normalizacao
                # de fronteira do nosso dominio; aqui ela e aplicada AO RESULTADO DO
                # ORACULO, para que a comparacao seja de CONTEUDO e nao de convencao.
                "valor": format(abs(valor), "f"),
                "natureza": "CREDITO" if valor > 0 else "DEBITO",
                "memo": t.memo,
                "documento": t.checknum,
            }
        )

    return {
        "moeda": extrato.curdef,
        "acctid": extrato.account.acctid,
        "bankid": getattr(extrato.account, "bankid", None),
        "periodoInicio": extrato.dtstart.date().isoformat() if extrato.dtstart else None,
        "periodoFim": extrato.dtend.date().isoformat() if extrato.dtend else None,
        "transacoes": transacoes,
    }


def main() -> int:
    arquivos = sorted(p for p in CORPUS.glob("*.ofx"))
    if not arquivos:
        print(f"nenhum .ofx em {CORPUS}", file=sys.stderr)
        return 2

    lido = {
        "_gerado_por": "ofxtools 1.1.1 (PyPI) via scripts/oraculo-ofx.py",
        "_aviso": (
            "NAO EDITE A MAO. Estes valores foram lidos por uma implementacao "
            "INDEPENDENTE do nosso parser. Editar este arquivo para fazer um teste "
            "passar destroi a unica coisa que ele prova."
        ),
        "arquivos": {p.name: ler(p) for p in arquivos},
    }
    saida = json.dumps(lido, indent=2, ensure_ascii=False) + "\n"

    if "--gravar" in sys.argv:
        ESPERADO.write_text(saida, encoding="utf-8")
        print(f"gravado: {ESPERADO} ({len(arquivos)} arquivos)")
        return 0

    if not ESPERADO.exists():
        print(f"{ESPERADO} nao existe. Rode com --gravar.", file=sys.stderr)
        return 1
    if ESPERADO.read_text(encoding="utf-8") != saida:
        print(
            "DIVERGENCIA: o oraculo le hoje algo diferente do esperado.json "
            "versionado. Ou o corpus mudou, ou a versao do ofxtools mudou. "
            "Decida qual antes de regravar.",
            file=sys.stderr,
        )
        return 1
    print(f"confere: {len(arquivos)} arquivos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
