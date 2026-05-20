"""
MLflow integration for SageMaker training jobs.

Drop-in logger: import and call at the start/end of any training script.

Usage in train.py:
    from mlflow_logger import start_run, log_metrics, end_run

    run = start_run("attention-analysis", {"model": "qwen3-32b", "experiment": 1})
    # ... training ...
    log_metrics({"accuracy": 0.85, "dar": 0.42})
    end_run()
"""

import json
import os
import time
from pathlib import Path

MLFLOW_AVAILABLE = False
try:
    import mlflow
    MLFLOW_AVAILABLE = True
except ImportError:
    pass

CONFIG_PATH = Path(__file__).parent / "mlflow_config.json"
_active_run = None


def _load_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    tracking_uri = os.environ.get("MLFLOW_TRACKING_URI")
    if tracking_uri:
        return {"mlflow_tracking_uri": tracking_uri}
    return None


def start_run(experiment_name: str, params: dict = None, tags: dict = None) -> bool:
    global _active_run
    if not MLFLOW_AVAILABLE:
        print("[mlflow_logger] mlflow not installed, logging to local JSON only")
        return False

    config = _load_config()
    if not config:
        print("[mlflow_logger] No MLflow config found, logging to local JSON only")
        return False

    try:
        mlflow.set_tracking_uri(config["mlflow_tracking_uri"])
        mlflow.set_experiment(experiment_name)

        run_tags = {
            "project": "secondlayer",
            "launched_from": os.environ.get("SM_TRAINING_JOB_NAME", "local"),
        }
        if tags:
            run_tags.update(tags)

        _active_run = mlflow.start_run(tags=run_tags)

        if params:
            mlflow.log_params(params)

        sagemaker_job = os.environ.get("SM_TRAINING_JOB_NAME")
        if sagemaker_job:
            mlflow.log_param("sagemaker_job_name", sagemaker_job)
            mlflow.log_param("instance_type", os.environ.get("SM_RESOURCE_CONFIG", "unknown"))

        print(f"[mlflow_logger] Run started: {_active_run.info.run_id}")
        return True
    except Exception as e:
        print(f"[mlflow_logger] Failed to connect to MLflow: {e}")
        _active_run = None
        return False


def log_metrics(metrics: dict, step: int = None):
    if _active_run and MLFLOW_AVAILABLE:
        try:
            mlflow.log_metrics(metrics, step=step)
        except Exception as e:
            print(f"[mlflow_logger] Metric logging failed: {e}")

    output_dir = Path(os.environ.get("SM_MODEL_DIR", "/opt/ml/model"))
    if not output_dir.exists():
        output_dir = Path(".")
    metrics_file = output_dir / "mlflow_metrics.jsonl"
    with open(metrics_file, "a") as f:
        entry = {"timestamp": time.time(), "metrics": metrics}
        if step is not None:
            entry["step"] = step
        f.write(json.dumps(entry) + "\n")


def log_artifact(local_path: str):
    if _active_run and MLFLOW_AVAILABLE:
        try:
            mlflow.log_artifact(local_path)
        except Exception as e:
            print(f"[mlflow_logger] Artifact logging failed: {e}")


def end_run(status: str = "FINISHED"):
    global _active_run
    if _active_run and MLFLOW_AVAILABLE:
        try:
            mlflow.end_run(status=status)
            print(f"[mlflow_logger] Run ended: {status}")
        except Exception as e:
            print(f"[mlflow_logger] End run failed: {e}")
    _active_run = None
