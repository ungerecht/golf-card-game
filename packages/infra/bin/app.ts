import { App } from "aws-cdk-lib";
import { loadConfig } from "../lib/config";
import { createStacks } from "../lib/stacks";

const app = new App();
const config = loadConfig((key) => app.node.tryGetContext(key));
createStacks(app, config, {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
});
