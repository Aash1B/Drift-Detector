FROM python:3.13-slim

ARG TERRAFORM_VERSION=1.17.1

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(dpkg --print-architecture) \
 && curl -fsSL -o /tmp/terraform.zip \
    https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${ARCH}.zip \
 && unzip /tmp/terraform.zip -d /usr/local/bin \
 && rm /tmp/terraform.zip

WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app

EXPOSE 8000
CMD ["sh", "-c", "cd /app/infra-repo && terraform init -input=false && cd /app/backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"]