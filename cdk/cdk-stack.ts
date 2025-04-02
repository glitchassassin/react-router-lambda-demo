import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Set absolute path to the lambda.ts handler
    const entry = path.join(__dirname, '../server/lambda.ts');

    // Create Lambda function for React Router
    const lambdaFunction = new nodejs.NodejsFunction(this, 'ReactRouterHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
          'aws-sdk' // Not actually needed (or provided): https://github.com/remix-run/react-router/issues/13341
        ],
        minify: true,
        sourceMap: true,
        target: 'es2022',
      },
      environment: {
        NODE_ENV: 'production',
      },
    });

    // Create Function URL for the Lambda
    const functionUrl = lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // Create S3 bucket for static assets
    const staticBucket = new s3.Bucket(this, 'StaticBucket', {
      enforceSSL: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(functionUrl),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        '/assets/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(staticBucket, {
            originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST],
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
    });

    // Deploy static assets to S3
    new s3deploy.BucketDeployment(this, 'DeployStaticAssets', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../build/client/assets'))],
      destinationBucket: staticBucket,
      destinationKeyPrefix: 'assets',
      distribution,
      distributionPaths: ['/assets/*'],
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.domainName,
    });
  }
}
