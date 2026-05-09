"""
Experiment A: Tokenizer & Base Model Selection
Configuration for AWS Bedrock model comparison on Ukrainian legal text.
"""

from dataclasses import dataclass, field


@dataclass
class ModelConfig:
    model_id: str
    provider: str
    region: str
    display_name: str
    cost_per_1k_input: float
    cost_per_1k_output: float
    max_tokens: int = 4096
    temperature: float = 0.0


MODELS = {
    "qwen3_32b": ModelConfig(
        model_id="qwen.qwen3-32b-v1:0",
        provider="Qwen",
        region="eu-central-1",
        display_name="Qwen3 32B (dense)",
        cost_per_1k_input=0.00030,
        cost_per_1k_output=0.00060,
    ),
    "llama33_70b": ModelConfig(
        model_id="us.meta.llama3-3-70b-instruct-v1:0",
        provider="Meta",
        region="us-east-1",
        display_name="Llama 3.3 70B",
        cost_per_1k_input=0.00072,
        cost_per_1k_output=0.00072,
    ),
    "mistral_large3": ModelConfig(
        model_id="mistral.mistral-large-3-675b-instruct",
        provider="Mistral AI",
        region="us-east-1",
        display_name="Mistral Large 3 (675B)",
        cost_per_1k_input=0.002,
        cost_per_1k_output=0.006,
    ),
    "llama4_maverick": ModelConfig(
        model_id="us.meta.llama4-maverick-17b-instruct-v1:0",
        provider="Meta",
        region="us-east-1",
        display_name="Llama 4 Maverick (17B MoE)",
        cost_per_1k_input=0.00017,
        cost_per_1k_output=0.00085,
    ),
    "qwen3_235b": ModelConfig(
        model_id="qwen.qwen3-235b-a22b-2507-v1:0",
        provider="Qwen",
        region="eu-central-1",
        display_name="Qwen3 235B (A22B MoE)",
        cost_per_1k_input=0.00080,
        cost_per_1k_output=0.00160,
    ),
    "nemotron_120b": ModelConfig(
        model_id="nvidia.nemotron-super-3-120b",
        provider="NVIDIA",
        region="eu-central-1",
        display_name="Nemotron Super 3 (120B)",
        cost_per_1k_input=0.00078,
        cost_per_1k_output=0.00039,
    ),
    "nova_pro": ModelConfig(
        model_id="eu.amazon.nova-pro-v1:0",
        provider="Amazon",
        region="eu-central-1",
        display_name="Nova Pro",
        cost_per_1k_input=0.00080,
        cost_per_1k_output=0.00320,
    ),
}


@dataclass
class EvalTask:
    name: str
    system_prompt: str
    user_template: str
    few_shot_examples: list = field(default_factory=list)
    metric: str = "accuracy"


CASE_TYPE_CLASSES = [
    "цивільна", "кримінальна", "адміністративна", "господарська",
]

OUTCOME_CLASSES = [
    "задоволено", "відмовлено", "частково задоволено",
    "закрито", "залишено без розгляду",
]

EVAL_TASKS = {
    "case_type": EvalTask(
        name="Класифікація типу справи",
        system_prompt="Ти — експерт з українського права. Відповідай ТІЛЬКИ одним словом.",
        user_template=(
            "Визнач тип судової справи на основі тексту рішення.\n"
            "Можливі типи: цивільна, кримінальна, адміністративна, господарська.\n\n"
            "Текст рішення:\n{text}\n\n"
            "Тип справи:"
        ),
        few_shot_examples=[
            {
                "text": "РІШЕННЯ ІМЕНЕМ УКРАЇНИ ... позивач звернувся до суду з позовом про стягнення заборгованості за договором позики ...",
                "answer": "цивільна",
            },
            {
                "text": "ВИРОК ІМЕНЕМ УКРАЇНИ ... обвинувачений вчинив крадіжку чужого майна, тобто таємне викрадення ...",
                "answer": "кримінальна",
            },
            {
                "text": "ПОСТАНОВА ... позивач оскаржує рішення податкового органу про донарахування податкових зобов'язань ...",
                "answer": "адміністративна",
            },
        ],
        metric="accuracy",
    ),
    "case_outcome": EvalTask(
        name="Класифікація результату справи",
        system_prompt="Ти — експерт з українського права. Відповідай ТІЛЬКИ одним варіантом з наданого списку.",
        user_template=(
            "Визнач результат судового рішення.\n"
            "Можливі результати: задоволено, відмовлено, частково задоволено, закрито, залишено без розгляду.\n\n"
            "Текст рішення:\n{text}\n\n"
            "Результат:"
        ),
        few_shot_examples=[
            {
                "text": "... суд вирішив: позов задовольнити повністю. Стягнути з відповідача ...",
                "answer": "задоволено",
            },
            {
                "text": "... суд вирішив: у задоволенні позову відмовити ...",
                "answer": "відмовлено",
            },
            {
                "text": "... суд вирішив: позов задовольнити частково. Стягнути з відповідача частину ...",
                "answer": "частково задоволено",
            },
        ],
        metric="accuracy",
    ),
    "norm_extraction": EvalTask(
        name="Витяг правових норм",
        system_prompt=(
            "Ти — експерт з українського права. Витягни всі правові норми "
            "(статті законів, кодексів), на які посилається текст рішення."
        ),
        user_template=(
            "Витягни всі правові норми (статті законів/кодексів), "
            "на які посилається це судове рішення.\n"
            "Відповідай у форматі JSON масиву: "
            '[{{"law": "назва закону", "article": "номер статті"}}]\n\n'
            "Текст рішення:\n{text}\n\n"
            "Правові норми (JSON):"
        ),
        metric="f1",
    ),
    "summarization": EvalTask(
        name="Юридичне резюмування",
        system_prompt="Ти — експерт з українського права.",
        user_template=(
            "Підсумуй це судове рішення у 3-5 реченнях українською мовою. "
            "Вкажи: сторони, суть спору, ключові аргументи, рішення суду.\n\n"
            "Текст рішення:\n{text}\n\n"
            "Резюме:"
        ),
        metric="llm_judge",
    ),
}

EVAL_DATA_PATH = "output/experiment_a/data/eval_dataset.jsonl"
RESULTS_DIR = "output/experiment_a"
FIGURES_DIR = "output/experiment_a/figures"

N_EVAL_SAMPLES = 300
TEXT_TRUNCATE_TOKENS = 2000
N_FERTILITY_SAMPLES = 100
