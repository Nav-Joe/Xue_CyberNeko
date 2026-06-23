$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$bert = Join-Path $root 'Bert-VITS2'

if (-not (Test-Path (Join-Path $bert 'infer.py'))) {
    Write-Error 'Bert-VITS2 not found'
}

# --- text/cleaner.py: lazy language imports ---
$cleaner = Join-Path $bert 'text\cleaner.py'
$cleanerContent = @'
from text import cleaned_text_to_sequence


def _language_module(language: str):
    if language == "ZH":
        from text import chinese

        return chinese
    if language == "JP":
        from text import japanese

        return japanese
    if language == "EN":
        from text import english

        return english
    raise ValueError(f"Unsupported language: {language}")


def clean_text(text, language):
    language_module = _language_module(language)
    norm_text = language_module.text_normalize(text)
    phones, tones, word2ph = language_module.g2p(norm_text)
    return norm_text, phones, tones, word2ph


def clean_text_bert(text, language):
    language_module = _language_module(language)
    norm_text = language_module.text_normalize(text)
    phones, tones, word2ph = language_module.g2p(norm_text)
    bert = language_module.get_bert_feature(norm_text, word2ph)
    return phones, tones, bert


def text_to_sequence(text, language):
    norm_text, phones, tones, word2ph = clean_text(text, language)
    return cleaned_text_to_sequence(phones, tones, language)


if __name__ == "__main__":
    pass
'@
Set-Content -Path $cleaner -Value $cleanerContent -Encoding UTF8

# --- text/__init__.py: lazy get_bert ---
$initPy = Join-Path $bert 'text\__init__.py'
$initText = Get-Content -Path $initPy -Raw -Encoding UTF8
$oldGetBert = @'
def get_bert(norm_text, word2ph, language, device, style_text=None, style_weight=0.7):
    from .chinese_bert import get_bert_feature as zh_bert
    from .english_bert_mock import get_bert_feature as en_bert
    from .japanese_bert import get_bert_feature as jp_bert

    lang_bert_func_map = {"ZH": zh_bert, "EN": en_bert, "JP": jp_bert}
    bert = lang_bert_func_map[language](
        norm_text, word2ph, device, style_text, style_weight
    )
    return bert
'@
$newGetBert = @'
def get_bert(norm_text, word2ph, language, device, style_text=None, style_weight=0.7):
    if language == "ZH":
        from .chinese_bert import get_bert_feature as bert_fn
    elif language == "EN":
        from .english_bert_mock import get_bert_feature as bert_fn
    elif language == "JP":
        from .japanese_bert import get_bert_feature as bert_fn
    else:
        raise ValueError("language should be ZH, JP or EN")

    bert = bert_fn(norm_text, word2ph, device, style_text, style_weight)
    return bert
'@
if ($initText -notmatch 'if language == "ZH":\s+from \.chinese_bert') {
    if ($initText -notmatch [regex]::Escape($oldGetBert.Trim())) {
        Write-Warning 'text/__init__.py get_bert block not found; skip or patch manually'
    } else {
        $initText = $initText.Replace($oldGetBert.Trim(), $newGetBert.Trim())
        Set-Content -Path $initPy -Value $initText -Encoding UTF8 -NoNewline
    }
}

# --- infer.py: skip eager oldVersion imports (marker-based) ---
$inferPy = Join-Path $bert 'infer.py'
$inferText = Get-Content -Path $inferPy -Raw -Encoding UTF8
if ($inferText -notmatch 'CURRENT_VERSIONS') {
    $inferText = $inferText -replace '(?s)from oldVersion\.V210\.models import SynthesizerTrn as V210SynthesizerTrn.*?symbolsMap = \{.*?\}\r?\n\r?\n', @'
# 当前版本信息（Xue_CyberNeko：2.3 与 2.2 共用主模型推理，旧版按需加载）
latest_version = "2.2"
CURRENT_VERSIONS = {latest_version, "2.3"}


def _legacy_synth(version: str):
    if version in ("2.1",):
        from oldVersion.V210.models import SynthesizerTrn as V210SynthesizerTrn
        from oldVersion.V210.text import symbols as V210symbols

        return V210SynthesizerTrn, V210symbols
    if version in ("2.0.2-fix", "2.0.1", "2.0"):
        from oldVersion.V200.models import SynthesizerTrn as V200SynthesizerTrn
        from oldVersion.V200.text import symbols as V200symbols

        return V200SynthesizerTrn, V200symbols
    if version in ("1.1.1-fix", "1.1.1"):
        from oldVersion.V111.models import SynthesizerTrn as V111SynthesizerTrn
        from oldVersion.V111.text import symbols as V111symbols

        return V111SynthesizerTrn, V111symbols
    if version in ("1.1", "1.1.0"):
        from oldVersion.V110.models import SynthesizerTrn as V110SynthesizerTrn
        from oldVersion.V110.text import symbols as V110symbols

        return V110SynthesizerTrn, V110symbols
    if version in ("1.0.1", "1.0", "1.0.0"):
        from oldVersion.V101.models import SynthesizerTrn as V101SynthesizerTrn
        from oldVersion.V101.text import symbols as V101symbols

        return V101SynthesizerTrn, V101symbols
    raise ValueError(f"Unsupported model version: {version}")


'@
    $inferText = $inferText -replace '(?s)def get_net_g\(model_path: str, version: str, device: str, hps\):\r?\n    if version != latest_version:.*?else:\r?\n        # 当前版本模型 net_g\r?\n        net_g = SynthesizerTrn\(', @'
def get_net_g(model_path: str, version: str, device: str, hps):
    if version in CURRENT_VERSIONS:
        net_g = SynthesizerTrn('
    $inferText = $inferText -replace '(?s)        net_g = SynthesizerTrnMap\[version\]\(\r?\n            len\(symbolsMap\[version\]\),', @'
        synth_cls, version_symbols = _legacy_synth(version)
        net_g = synth_cls(
            len(version_symbols),'
    Set-Content -Path $inferPy -Value $inferText -Encoding UTF8 -NoNewline
    Write-Warning 'infer.py partially patched; verify get_net_g and infer() manually if TTS fails'
}

# --- text/chinese_bert.py: transformers 5.x meta tensor fix ---
$chineseBert = Join-Path $bert 'text\chinese_bert.py'
$bertText = Get-Content -Path $chineseBert -Raw -Encoding UTF8
if ($bertText -notmatch 'low_cpu_mem_usage=False') {
    $bertText = $bertText -replace 'models\[device\] = AutoModelForMaskedLM\.from_pretrained\(LOCAL_PATH\)\.to\(device\)', @'
models[device] = AutoModelForMaskedLM.from_pretrained(
            LOCAL_PATH,
            low_cpu_mem_usage=False,
            torch_dtype=torch.float32,
        ).to(device)
        models[device].eval()'@
    Set-Content -Path $chineseBert -Value $bertText -Encoding UTF8 -NoNewline
}

Write-Host '[完成] Bert-VITS2 中文推理补丁已应用'
