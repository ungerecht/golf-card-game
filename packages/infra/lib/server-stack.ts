import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

export interface ServerStackProps extends StackProps {
  /** Where the game server is reached, such as api.cardgolf.party. */
  apiDomainName: string;
  /** Web pages allowed to call the server from a browser. */
  clientOrigins: string[];
  instanceType: string;
}

/** Where the deploy script lives on the instance. */
export const DEPLOY_SCRIPT = "/opt/golf/deploy.sh";

/**
 * One small EC2 instance running two containers: the game server, and Caddy
 * in front of it, which gets the TLS certificate for the api address.
 * Games live in memory, so one machine is all there is.
 */
export class ServerStack extends Stack {
  readonly repository: ecr.Repository;
  readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ServerStackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: "golf-server",
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [{ maxImageCount: 5 }],
    });

    // A public subnet and no NAT gateway: a NAT gateway costs about $32 a month.
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      ],
    });

    // No SSH. Use AWS Systems Manager Session Manager to get a shell.
    const securityGroup = new ec2.SecurityGroup(this, "Web", {
      vpc,
      description: "HTTP and HTTPS to Caddy",
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "HTTP (certificate checks, redirect)",
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "HTTPS and secure WebSockets",
    );

    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
      ],
    });
    this.repository.grantPull(role);

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -euo pipefail",
      "dnf install -y docker",
      "systemctl enable --now docker",
      "mkdir -p /opt/golf",
      // Caddy turns the api address into HTTPS and passes WebSockets through.
      "cat > /opt/golf/Caddyfile <<'CADDY'",
      `${props.apiDomainName} {`,
      "\treverse_proxy server:2567",
      "}",
      "CADDY",
      `cat > ${DEPLOY_SCRIPT} <<'DEPLOY'`,
      "#!/bin/bash",
      "# Pulls an image tag (default: latest) and restarts the game server.",
      "set -euo pipefail",
      `REPO=${this.repository.repositoryUri}`,
      `REGION=${this.region}`,
      "TAG=latest",
      "if [ $# -ge 1 ]; then TAG=$1; fi",
      'IMAGE="$REPO:$TAG"',
      'aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$(echo "$REPO" | cut -d/ -f1)"',
      'docker pull "$IMAGE"',
      "docker network inspect golf >/dev/null 2>&1 || docker network create golf",
      "docker rm -f server >/dev/null 2>&1 || true",
      "docker run -d --name server --init --restart unless-stopped --network golf \\",
      `  -e ALLOWED_ORIGINS=${props.clientOrigins.join(",")} "$IMAGE"`,
      "if ! docker inspect caddy >/dev/null 2>&1; then",
      "  docker run -d --name caddy --restart unless-stopped --network golf \\",
      "    -p 80:80 -p 443:443 \\",
      "    -v /opt/golf/Caddyfile:/etc/caddy/Caddyfile:ro -v caddy_data:/data caddy:2",
      "fi",
      "docker image prune -f >/dev/null",
      "DEPLOY",
      `chmod +x ${DEPLOY_SCRIPT}`,
    );

    this.instance = new ec2.Instance(this, "Server", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup,
      role,
      userData,
      userDataCausesReplacement: true,
      requireImdsv2: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(12, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    // A fixed address, so the DNS record never has to change.
    const address = new ec2.CfnEIP(this, "Address", { domain: "vpc" });
    new ec2.CfnEIPAssociation(this, "AddressAssociation", {
      allocationId: address.attrAllocationId,
      instanceId: this.instance.instanceId,
    });

    new CfnOutput(this, "ElasticIp", {
      description: `Point an A record for ${props.apiDomainName} here.`,
      value: address.ref,
    });
    new CfnOutput(this, "InstanceId", { value: this.instance.instanceId });
    new CfnOutput(this, "RepositoryUri", {
      value: this.repository.repositoryUri,
    });
  }
}
