import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

export interface ClientStackProps extends StackProps {
  domainName: string;
  certificateArn: string;
}

/** The React app: a private S3 bucket served through CloudFront. */
export class ClientStack extends Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ClientStackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, "Site", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // The site is rebuilt from git, so tearing the stack down loses nothing.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.distribution = new cloudfront.Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      domainNames: [props.domainName],
      certificate: acm.Certificate.fromCertificateArn(
        this,
        "Certificate",
        props.certificateArn,
      ),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // North America and Europe only: the cheapest price class.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true,
      },
      // Routes like /host only exist in the browser, so unknown paths get the app.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: "/index.html",
        ttl: Duration.seconds(0),
      })),
    });

    new CfnOutput(this, "BucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
    });
    new CfnOutput(this, "DistributionDomainName", {
      description: "Point the site's CNAME in Cloudflare here.",
      value: this.distribution.distributionDomainName,
    });
  }
}
