## Python Service

deployed to subdomain py.d0paminedriven.com

#### Deployed to AWS Fargate 

shares a cluster and load balancer with ws-server but has its own dedicated security group etc

#### How to

- spin up locally

```bash
pdm run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- spin up Docker locallyy

```bash
docker compose -d up
```