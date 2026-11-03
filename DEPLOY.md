# Deploying to AWS

The site is `https://cardgolf.party` and the game server is `wss://api.cardgolf.party`.

```
Browser ──► cardgolf.party ──► CloudFront ──► private S3 bucket (the React build)
   │
   └─────► api.cardgolf.party ──► EC2 instance ──► Caddy (HTTPS) ──► game server (Docker)
```

- **Cloudflare** only does the domain name and DNS. Both records are "DNS only" (grey cloud).
- **Client** (`GolfClient` stack): S3 and CloudFront, with an ACM certificate you create once.
- **Server** (`GolfServer` stack): one `t4g.micro` EC2 instance with a fixed IP, plus an ECR repository for the image. There is no load balancer and no NAT gateway, because each costs more than the instance. Games live in memory, so one machine is all there is, and a deploy drops anyone mid-game.
- **Ops** (`GolfOps` stack): the role GitHub Actions uses to deploy (no stored AWS keys), and a monthly cost alert.
- The code is in `packages/infra`. `.github/workflows/deploy.yml` runs after every push to `main`.

## What it costs

Rough on-demand prices in us-east-1, so check the [AWS pricing calculator](https://calculator.aws/) before relying on them:

| Item                                             | Per month        |
| ------------------------------------------------ | ---------------- |
| `t4g.micro` instance                             | about $6         |
| Public IPv4 address (charged even when attached) | about $3.65      |
| 12 GB disk                                       | about $1         |
| S3, CloudFront, ECR, GitHub Actions              | pennies          |
| Domain (Cloudflare, at cost)                     | about $10 a year |

New AWS accounts get credits for the first months, which cover the instance. The cost alert ignores credits on purpose, so it warns at 50% and 80% of the real monthly cost, and when the forecast passes 100%. The default budget is $15 (`-c monthlyBudgetUsd=20` changes it).

## One-time setup

You need an AWS account, the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) logged in with permission to create resources (`aws sts get-caller-identity` works), and `pnpm install` run in this repository. Pick one region for everything. `us-east-1` is the simplest, because CloudFront certificates must live there anyway.

### 1. Create the certificate

```sh
CERT=$(aws acm request-certificate --region us-east-1 \
  --domain-name cardgolf.party --validation-method DNS \
  --query CertificateArn --output text)
echo "$CERT"
aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT" \
  --query "Certificate.DomainValidationOptions[0].ResourceRecord"
```

If `ResourceRecord` is empty, wait a few seconds and run the second command again. In Cloudflare, add the CNAME it shows (type CNAME, the given name and value, **DNS only**). Then wait until AWS sees it, which can take a few minutes:

```sh
aws acm wait certificate-validated --region us-east-1 --certificate-arn "$CERT"
```

### 2. Create the infrastructure

```sh
pnpm --filter @golf/infra cdk bootstrap
pnpm --filter @golf/infra cdk deploy --all \
  -c certificateArn="$CERT" \
  -c alertEmail=you@example.com
```

Notes:

- `bootstrap` is needed once per account and region.
- If the account already has a GitHub OIDC provider (`aws iam list-open-id-connect-providers`), add `-c oidcProviderArn=<its arn>`. An account can only have one.
- CloudFront takes 5 to 15 minutes to create.
- The first run asks for AWS lookups. CDK writes them to `packages/infra/cdk.context.json`, which git ignores.

When it finishes, it prints four values you need: `DistributionDomainName`, `ElasticIp`, `DeployRoleArn` and, for reference, `InstanceId`.

### 3. Point the domain at AWS

In Cloudflare DNS, both records **DNS only**:

| Type  | Name  | Value                                                               |
| ----- | ----- | ------------------------------------------------------------------- |
| CNAME | `@`   | the `DistributionDomainName` (like `d111111abcdef8.cloudfront.net`) |
| A     | `api` | the `ElasticIp`                                                     |

Cloudflare allows a CNAME on the bare domain by flattening it.

### 4. Tell GitHub where to deploy

In the repository, go to Settings, then Secrets and variables, then Actions, then Variables, and add:

| Variable       | Value                                           |
| -------------- | ----------------------------------------------- |
| `AWS_ROLE_ARN` | the `DeployRoleArn` output                      |
| `AWS_REGION`   | the region you deployed to, such as `us-east-1` |

No secrets are needed. Optionally set `API_URL` if the server address ever changes from `https://api.cardgolf.party`.

### 5. Deploy

Push to `main`, or run the **Deploy** workflow by hand (Actions tab, then Deploy, then Run workflow). It runs the checks, then deploys the client and the server. The first server deploy gets its HTTPS certificate from Let's Encrypt as soon as the `api` record resolves, so the final health check can take a minute.

Check it:

```sh
curl https://api.cardgolf.party/health   # {"ok":true}
```

Then open `https://cardgolf.party` and start a game.

## Day to day

- **Deploys** happen on every push to `main`. A change that fails the checks is not deployed.
- **Server logs:** `aws ssm start-session --target <InstanceId>` (needs the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)), then `sudo docker logs --tail 100 server`. There is no SSH.
- **Roll the server back:** every image is tagged with its commit. In a Session Manager shell, run `sudo /opt/golf/deploy.sh <commit-sha>`. ECR keeps the last five images.
- **Change the infrastructure:** edit `packages/infra`, then run `cdk diff` and `cdk deploy --all` with the same `-c` options as before.
- **A new instance** (when the Amazon Linux image updates, or the bootstrap script changes) comes up with nothing running. Re-run the Deploy workflow's server job to start the game server. The fixed IP moves to it by itself.
- **Allowed origins:** the server only accepts browser requests from `https://cardgolf.party` (`ALLOWED_ORIGINS`). To use another address, such as a preview site, change `clientOrigins` in `packages/infra/lib/stacks.ts`.

## Taking it down

```sh
pnpm --filter @golf/infra cdk destroy --all \
  -c certificateArn="$CERT" -c alertEmail=you@example.com
```

Then delete the two DNS records and the certificate validation record in Cloudflare, and the certificate in ACM (`aws acm delete-certificate --region us-east-1 --certificate-arn "$CERT"`). The bucket and the image repository are emptied and removed with the stacks.
