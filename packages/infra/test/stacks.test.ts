import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { loadConfig, type DeployConfig } from "../lib/config";
import { createStacks } from "../lib/stacks";

const CERT =
  "arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555";

const config: DeployConfig = {
  domainName: "cardgolf.party",
  apiDomainName: "api.cardgolf.party",
  certificateArn: CERT,
  alertEmail: "me@example.com",
  githubRepo: "ungerecht/golf-card-game",
  instanceType: "t4g.micro",
  monthlyBudgetUsd: 15,
  oidcProviderArn: undefined,
};

function build(overrides: Partial<DeployConfig> = {}) {
  const { client, server, ops } = createStacks(
    new App(),
    { ...config, ...overrides },
    { account: "123456789012", region: "us-east-1" },
  );
  return {
    client: Template.fromStack(client),
    server: Template.fromStack(server),
    ops: Template.fromStack(ops),
  };
}

describe("client", () => {
  const { client } = build();

  it("keeps the bucket private", () => {
    client.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("serves the site name over HTTPS with the given certificate", () => {
    client.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: ["cardgolf.party"],
        ViewerCertificate: Match.objectLike({ AcmCertificateArn: CERT }),
        DefaultRootObject: "index.html",
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: "redirect-to-https",
        }),
      }),
    });
  });

  it("falls back to the app for routes that only exist in the browser", () => {
    client.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponsePagePath: "/index.html",
            ResponseCode: 200,
          }),
          Match.objectLike({
            ErrorCode: 404,
            ResponsePagePath: "/index.html",
            ResponseCode: 200,
          }),
        ]),
      }),
    });
  });
});

describe("server", () => {
  const { server } = build();

  it("has no NAT gateway, which would cost about $32 a month", () => {
    server.resourceCountIs("AWS::EC2::NatGateway", 0);
  });

  it("only lets the world reach ports 80 and 443", () => {
    const groups = server.findResources("AWS::EC2::SecurityGroup");
    const ports = Object.values(groups).flatMap((group) =>
      (group.Properties.SecurityGroupIngress as { FromPort: number }[]).map(
        (rule) => rule.FromPort,
      ),
    );
    expect(ports.sort((a, b) => a - b)).toEqual([80, 443]);
  });

  it("requires IMDSv2", () => {
    server.hasResourceProperties("AWS::EC2::LaunchTemplate", {
      LaunchTemplateData: Match.objectLike({
        MetadataOptions: Match.objectLike({ HttpTokens: "required" }),
      }),
    });
  });

  it("encrypts the disk", () => {
    server.hasResourceProperties("AWS::EC2::Instance", {
      BlockDeviceMappings: [
        Match.objectLike({ Ebs: Match.objectLike({ Encrypted: true }) }),
      ],
    });
  });

  it("gets a fixed address", () => {
    server.resourceCountIs("AWS::EC2::EIP", 1);
    server.resourceCountIs("AWS::EC2::EIPAssociation", 1);
  });

  it("sets up Caddy for the api name and allows only the site's origin", () => {
    const text = JSON.stringify(
      Object.values(server.findResources("AWS::EC2::Instance"))[0],
    );
    expect(text).toContain("api.cardgolf.party {");
    expect(text).toContain("reverse_proxy server:2567");
    expect(text).toContain("ALLOWED_ORIGINS=https://cardgolf.party");
  });

  it("can pull images but not push them", () => {
    const text = JSON.stringify(server.findResources("AWS::IAM::Policy"));
    expect(text).toContain("ecr:BatchGetImage");
    expect(text).not.toContain("ecr:PutImage");
  });
});

describe("ops", () => {
  it("lets only main of the one repository deploy", () => {
    const { ops } = build();
    ops.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "golf-github-deploy",
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub":
                  "repo:ungerecht/golf-card-game:ref:refs/heads/main",
              },
            },
          }),
        ],
      },
    });
  });

  it("never grants everything", () => {
    const { ops } = build();
    for (const policy of Object.values(ops.findResources("AWS::IAM::Policy"))) {
      for (const statement of policy.Properties.PolicyDocument.Statement) {
        const actions = [statement.Action].flat();
        expect(actions).not.toContain("*");
        expect(actions.some((a: string) => a.endsWith(":*"))).toBe(false);
      }
    }
  });

  it("creates the GitHub provider unless one exists", () => {
    build().ops.resourceCountIs("Custom::AWSCDKOpenIdConnectProvider", 1);
    const arn =
      "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com";
    build({ oidcProviderArn: arn }).ops.resourceCountIs(
      "Custom::AWSCDKOpenIdConnectProvider",
      0,
    );
  });

  it("emails when the bill passes the budget", () => {
    const { ops } = build({ monthlyBudgetUsd: 20 });
    ops.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({
        BudgetLimit: { Amount: 20, Unit: "USD" },
        CostTypes: Match.objectLike({ IncludeCredit: false }),
      }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Subscribers: [
            { SubscriptionType: "EMAIL", Address: "me@example.com" },
          ],
        }),
      ]),
    });
  });
});

describe("loadConfig", () => {
  const ctx = (values: Record<string, unknown>) => (key: string) => values[key];

  it("fills in the defaults", () => {
    const loaded = loadConfig(
      ctx({ certificateArn: CERT, alertEmail: "a@b.co" }),
    );
    expect(loaded).toMatchObject({
      domainName: "cardgolf.party",
      apiDomainName: "api.cardgolf.party",
      githubRepo: "ungerecht/golf-card-game",
      instanceType: "t4g.micro",
      monthlyBudgetUsd: 15,
    });
  });

  it("asks for what it cannot guess", () => {
    expect(() => loadConfig(ctx({ alertEmail: "a@b.co" }))).toThrow(
      /certificateArn/,
    );
    expect(() => loadConfig(ctx({ certificateArn: CERT }))).toThrow(
      /alertEmail/,
    );
  });

  it("refuses a certificate from another region", () => {
    const wrong = CERT.replace("us-east-1", "eu-west-1");
    expect(() =>
      loadConfig(ctx({ certificateArn: wrong, alertEmail: "a@b.co" })),
    ).toThrow(/us-east-1/);
  });

  it("refuses a bad repository or budget", () => {
    const base = { certificateArn: CERT, alertEmail: "a@b.co" };
    expect(() => loadConfig(ctx({ ...base, githubRepo: "nope" }))).toThrow(
      /owner\/name/,
    );
    expect(() => loadConfig(ctx({ ...base, monthlyBudgetUsd: "-1" }))).toThrow(
      /positive/,
    );
  });
});
