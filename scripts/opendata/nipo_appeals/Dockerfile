# NIPO Appeals Chamber scraper — runs on the GCP dev VM against the shared
# Postgres container. Build context = scripts/opendata (see README.md).
#
#   docker build -t nipo-appeals -f nipo_appeals/Dockerfile .
#   docker run --rm --network deployment_default \
#     -e DATABASE_URL=postgresql://nipo_appeals:***@secondlayer-postgres-local:5432/nipo_appeals \
#     -v nipo_appeals_data:/data \
#     nipo-appeals --create-schema --full --workers 6

FROM python:3.12-slim

WORKDIR /app
COPY nipo_appeals/requirements.txt /app/nipo_appeals/requirements.txt
RUN pip install --no-cache-dir -r /app/nipo_appeals/requirements.txt

COPY nipo_appeals /app/nipo_appeals

ENV NIPO_APPEALS_DATA_DIR=/data
VOLUME /data

ENTRYPOINT ["python", "-m", "nipo_appeals.main"]
CMD []
