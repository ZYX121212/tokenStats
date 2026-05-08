import re


ALIASES = [
    (re.compile(r"^gpt-4o(?:-\d{4}-\d{2}-\d{2})?$", re.I), "GPT-4o"),
    (re.compile(r"^gpt-4o-mini(?:-\d{4}-\d{2}-\d{2})?$", re.I), "GPT-4o mini"),
    (re.compile(r"^gpt-4\.1(?:-\d{4}-\d{2}-\d{2})?$", re.I), "GPT-4.1"),
    (re.compile(r"^gpt-4\.1-mini(?:-\d{4}-\d{2}-\d{2})?$", re.I), "GPT-4.1 mini"),
    (re.compile(r"^claude-3-5-sonnet.*$", re.I), "Claude 3.5 Sonnet"),
    (re.compile(r"^claude-3-7-sonnet.*$", re.I), "Claude 3.7 Sonnet"),
    (re.compile(r"^claude-sonnet-4.*$", re.I), "Claude Sonnet 4"),
    (re.compile(r"^gemini-1\.5-pro.*$", re.I), "Gemini 1.5 Pro"),
    (re.compile(r"^gemini-1\.5-flash.*$", re.I), "Gemini 1.5 Flash"),
    (re.compile(r"^gemini-2\.0-flash.*$", re.I), "Gemini 2.0 Flash"),
    (re.compile(r"^deepseek-chat.*$", re.I), "DeepSeek Chat"),
    (re.compile(r"^deepseek-reasoner.*$", re.I), "DeepSeek Reasoner"),
    (re.compile(r"^qwen.*$", re.I), "Qwen"),
    (re.compile(r"^glm.*$", re.I), "GLM"),
    (re.compile(r"^ernie.*$", re.I), "ERNIE"),
]


def normalize_model(model: str) -> str:
    if not model:
        return "Unknown"
    for pattern, alias in ALIASES:
        if pattern.match(model):
            return alias
    return model
