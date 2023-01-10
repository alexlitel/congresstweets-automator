import AWS from 'aws-sdk'
import { BUCKET } from './config'

export const loadBucketData = async () => {
  try {
    const s3 = new AWS.S3()
    const bucketData = (
      await s3
        .getObject({
          Bucket: BUCKET,
          Key: 'state.json',
        })
        .promise()
    ).Body.toString('utf-8')

    return JSON.parse(bucketData)
  } catch (e) {
    return {}
  }
}

export const checkIfBucketDataExists = async () => {
  const s3 = new AWS.S3()

  try {
    await s3
      .headObject({
        Bucket: BUCKET,
        Key: 'state.json',
      })
      .promise()

    return true
  } catch {
    return false
  }
}

export const writeBucketData = async (data) => {
  const s3 = new AWS.S3()

  await s3
    .putObject({
      Bucket: BUCKET,
      Key: 'state.json',
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    })
    .promise()
  return true
}
