import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import type * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

export interface OpsStackProps extends StackProps {
  githubRepo: string;
  alertEmail: string;
  monthlyBudgetUsd: number;
  /** An OIDC provider that already exists in the account. Only one is allowed. */
  oidcProviderArn: string | undefined;
  /** Names of the stacks the deploy role may read outputs from. */
  stackNames: string[];
  bucket: s3.IBucket;
  distribution: cloudfront.IDistribution;
  repository: ecr.IRepository;
  instance: ec2.IInstance;
}

/**
 * What GitHub Actions needs to deploy, and a cost alert.
 * GitHub proves who it is with a short-lived OpenID Connect token, so there
 * are no AWS access keys stored anywhere.
 */
export class OpsStack extends Stack {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: OpsStackProps) {
    super(scope, id, props);

    const providerArn =
      props.oidcProviderArn ??
      new iam.OpenIdConnectProvider(this, "GitHub", {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
      }).openIdConnectProviderArn;

    this.deployRole = new iam.Role(this, "DeployRole", {
      roleName: "golf-github-deploy",
      maxSessionDuration: Duration.hours(1),
      // Only workflows on the main branch of this repository.
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${props.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });
    const role = this.deployRole;
    new CfnOutput(this, "DeployRoleArn", {
      description: "Save as the AWS_ROLE_ARN variable in GitHub.",
      value: role.roleArn,
    });

    // Find the bucket, distribution and so on without storing their names.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks"],
        resources: props.stackNames.map((name) =>
          this.formatArn({
            service: "cloudformation",
            resource: "stack",
            resourceName: `${name}/*`,
          }),
        ),
      }),
    );

    // The client: upload the build, then clear the CDN cache.
    props.bucket.grantReadWrite(role);
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [
          this.formatArn({
            service: "cloudfront",
            region: "",
            resource: "distribution",
            resourceName: props.distribution.distributionId,
          }),
        ],
      }),
    );

    // The server: push an image, then tell the instance to run it.
    props.repository.grantPullPush(role);
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:SendCommand"],
        resources: [
          this.formatArn({
            service: "ssm",
            account: "",
            resource: "document",
            resourceName: "AWS-RunShellScript",
          }),
          this.formatArn({
            service: "ec2",
            resource: "instance",
            resourceName: props.instance.instanceId,
          }),
        ],
      }),
    );
    // These two cannot be limited to one resource.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"],
        resources: ["*"],
      }),
    );

    // The alert counts what the usage would cost, ignoring free credits.
    // Otherwise it stays silent for months and then surprises you.
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "golf-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" },
        costTypes: { includeCredit: false, includeRefund: false },
      },
      notificationsWithSubscribers: [
        { threshold: 50, notificationType: "ACTUAL" },
        { threshold: 80, notificationType: "ACTUAL" },
        { threshold: 100, notificationType: "FORECASTED" },
      ].map(({ threshold, notificationType }) => ({
        notification: {
          notificationType,
          comparisonOperator: "GREATER_THAN",
          threshold,
          thresholdType: "PERCENTAGE",
        },
        subscribers: [{ subscriptionType: "EMAIL", address: props.alertEmail }],
      })),
    });
  }
}
