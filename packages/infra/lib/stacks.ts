import type { App, Environment } from "aws-cdk-lib";
import { ClientStack } from "./client-stack";
import type { DeployConfig } from "./config";
import { OpsStack } from "./ops-stack";
import { ServerStack } from "./server-stack";

/** Builds every stack. Shared by `bin/app.ts` and the tests. */
export function createStacks(
  app: App,
  config: DeployConfig,
  env?: Environment,
) {
  const client = new ClientStack(app, "GolfClient", {
    env,
    domainName: config.domainName,
    certificateArn: config.certificateArn,
  });
  const server = new ServerStack(app, "GolfServer", {
    env,
    apiDomainName: config.apiDomainName,
    clientOrigins: [`https://${config.domainName}`],
    instanceType: config.instanceType,
  });
  const ops = new OpsStack(app, "GolfOps", {
    env,
    githubRepo: config.githubRepo,
    alertEmail: config.alertEmail,
    monthlyBudgetUsd: config.monthlyBudgetUsd,
    oidcProviderArn: config.oidcProviderArn,
    stackNames: [client.stackName, server.stackName],
    bucket: client.bucket,
    distribution: client.distribution,
    repository: server.repository,
    instance: server.instance,
  });
  return { client, server, ops };
}
