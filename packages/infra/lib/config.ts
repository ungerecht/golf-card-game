/** Everything that changes between deployments, read from `cdk` context. */
export interface DeployConfig {
  /** The site: https://cardgolf.party */
  domainName: string;
  /** The game server: wss://api.cardgolf.party */
  apiDomainName: string;
  /** ACM certificate for `domainName`. CloudFront only accepts one from us-east-1. */
  certificateArn: string;
  /** Where cost alerts go. */
  alertEmail: string;
  /** `owner/name` of the GitHub repository allowed to deploy. */
  githubRepo: string;
  /** EC2 size for the game server. */
  instanceType: string;
  /** Monthly cost, in USD, that triggers an alert. */
  monthlyBudgetUsd: number;
  /** Set if this AWS account already has the GitHub OIDC provider. */
  oidcProviderArn: string | undefined;
}

type Get = (key: string) => unknown;

function text(get: Get, key: string, fallback?: string): string {
  const value = get(key);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing context "${key}". Pass it with: -c ${key}=...`);
}

export function loadConfig(get: Get): DeployConfig {
  const domainName = text(get, "domainName", "cardgolf.party");
  const certificateArn = text(get, "certificateArn");
  if (
    !/^arn:aws:acm:us-east-1:\d{12}:certificate\/[\w-]+$/.test(certificateArn)
  ) {
    throw new Error(
      `certificateArn must be an ACM certificate in us-east-1 (CloudFront only uses those), got "${certificateArn}"`,
    );
  }
  const githubRepo = text(get, "githubRepo", "ungerecht/golf-card-game");
  if (!/^[\w.-]+\/[\w.-]+$/.test(githubRepo)) {
    throw new Error(
      `githubRepo must look like owner/name, got "${githubRepo}"`,
    );
  }
  const budget = Number(text(get, "monthlyBudgetUsd", "15"));
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error("monthlyBudgetUsd must be a positive number");
  }
  const oidc = get("oidcProviderArn");
  return {
    domainName,
    apiDomainName: `${text(get, "apiSubdomain", "api")}.${domainName}`,
    certificateArn,
    alertEmail: text(get, "alertEmail"),
    githubRepo,
    instanceType: text(get, "instanceType", "t4g.micro"),
    monthlyBudgetUsd: budget,
    oidcProviderArn:
      typeof oidc === "string" && oidc.trim() !== "" ? oidc.trim() : undefined,
  };
}
