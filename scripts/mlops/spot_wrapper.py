"""
SageMaker Managed Spot Training wrapper.

Wraps existing launch configs to use Spot instances with checkpointing.
Saves 60-70% on ml.g5.xlarge/g5.12xlarge.

Usage:
    from spot_wrapper import enable_spot

    job_config = { ... existing CreateTrainingJob params ... }
    job_config = enable_spot(job_config, checkpoint_s3="s3://bucket/checkpoints/")
"""


def enable_spot(
    job_config: dict,
    checkpoint_s3: str,
    max_wait_seconds: int = None,
) -> dict:
    """Add Managed Spot Training to an existing SageMaker job config.

    Args:
        job_config: Existing CreateTrainingJob params dict
        checkpoint_s3: S3 URI for spot checkpoint storage
        max_wait_seconds: Max seconds to wait for spot capacity.
            Defaults to 2x MaxRuntimeInSeconds.
    """
    config = dict(job_config)

    max_runtime = config.get("StoppingCondition", {}).get("MaxRuntimeInSeconds", 7200)
    if max_wait_seconds is None:
        max_wait_seconds = max_runtime * 2

    config["EnableManagedSpotTraining"] = True
    config["StoppingCondition"] = {
        "MaxRuntimeInSeconds": max_runtime,
        "MaxWaitTimeInSeconds": max_wait_seconds,
    }
    config["CheckpointConfig"] = {
        "S3Uri": checkpoint_s3,
    }

    return config


def spot_savings_summary(sm_client, region: str, job_name: str) -> dict:
    """Get spot savings for a completed job."""
    desc = sm_client.describe_training_job(TrainingJobName=job_name)
    billable = desc.get("BillableTimeInSeconds", 0)
    total = desc.get("TrainingTimeInSeconds", 0)
    savings = 1.0 - (billable / total) if total > 0 else 0.0
    return {
        "job_name": job_name,
        "total_seconds": total,
        "billable_seconds": billable,
        "savings_pct": f"{savings:.0%}",
        "spot_used": desc.get("EnableManagedSpotTraining", False),
    }
