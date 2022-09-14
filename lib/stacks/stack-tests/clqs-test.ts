import { Stack, StackProps, Duration, Tags, CfnOutput } from 'aws-cdk-lib'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import { aws_s3 as s3 } from 'aws-cdk-lib'
import { aws_stepfunctions as stepfunctions } from 'aws-cdk-lib'
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as path from 'path'

export interface CLQSTestStackProps extends StackProps {
  landingBucket: s3.Bucket
  transformedBucket: s3.Bucket
  enrichedBucket: s3.Bucket
  calculatorFunction: lambda.Function
  pipelineStateMachine: stepfunctions.StateMachine
  calculatorOutputTable: dynamodb.Table
}

export class CLQSTestStack extends Stack {
  constructor(scope: Construct, id: string, props: CLQSTestStackProps) {
    super(scope, id, props)

    // Calculator tests
    const carbonlakeCalculatorTestFunction = new lambda.Function(this, 'carbonlakeCalculatorTestLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset(path.join(__dirname, './lambda')),
      handler: 'test_calculator.lambda_handler',
      timeout: Duration.seconds(60),
      environment: {
        INPUT_BUCKET_NAME: props.transformedBucket.bucketName,
        OUTPUT_BUCKET_NAME: props.enrichedBucket.bucketName,
        CALCULATOR_FUNCTION_NAME: props.calculatorFunction.functionName,
      },
    })
    props.transformedBucket.grantReadWrite(carbonlakeCalculatorTestFunction)
    props.enrichedBucket.grantReadWrite(carbonlakeCalculatorTestFunction)
    props.calculatorFunction.grantInvoke(carbonlakeCalculatorTestFunction)

    // Pipeline E2E tests
    const carbonlakePipelineTestFunction = new lambda.Function(this, 'carbonlakePipelineTestLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset(path.join(__dirname, './lambda')),
      handler: 'test_pipeline.lambda_handler',
      timeout: Duration.minutes(10),
      environment: {
        INPUT_BUCKET_NAME: props.landingBucket.bucketName,
        OUTPUT_BUCKET_NAME: props.enrichedBucket.bucketName,
        STATE_MACHINE_ARN: props.pipelineStateMachine.stateMachineArn,
        OUTPUT_DYNAMODB_TABLE_NAME: props.calculatorOutputTable.tableName,
      },
    })
    props.landingBucket.grantReadWrite(carbonlakePipelineTestFunction)
    props.enrichedBucket.grantReadWrite(carbonlakePipelineTestFunction)
    props.pipelineStateMachine.grantRead(carbonlakePipelineTestFunction)
    props.calculatorOutputTable.grantReadWriteData(carbonlakePipelineTestFunction)

    // Output name of test function
    new CfnOutput(this, 'CLQSe2eTestLambdaFunctionName', {
      value: carbonlakePipelineTestFunction.functionName,
      description: 'Name of CarbonLake lambda test function',
      exportName: 'CLQSe2eTestLambdaFunctionName',
    });

    // Output aws console link to test function
    new CfnOutput(this, 'CLQSe2eTestLambdaConsoleLink', {
      value: `https://${carbonlakePipelineTestFunction.env.region}.console.aws.amazon.com/lambda/home?${carbonlakePipelineTestFunction.env.region}#/functions/${carbonlakePipelineTestFunction.functionName}?tab=code`,
      description: 'URL to open and invoke calculator test function in the AWS Console',
      exportName: 'CLQSe2eTestLambdaConsoleLink',

    });

    Tags.of(this).add("component", "test");
  }
}
