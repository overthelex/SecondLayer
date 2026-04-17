FROM python:3.12-slim

# OpenSSH client (for prod_writer.py to ssh into prod), curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
        openssh-client iproute2 ca-certificates curl docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY importers/ /app/importers/

ENV PYTHONUNBUFFERED=1 \
    CHECKPOINT_DIR=/data/checkpoints \
    LOG_LEVEL=INFO

VOLUME ["/data", "/root/.ssh"]

ENTRYPOINT ["python", "-m"]
