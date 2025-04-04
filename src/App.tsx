import { Auth } from 'aws-amplify';

async function uploadFile(file) {
  const user = await Auth.currentAuthenticatedUser();
  const userId = user.username; // Or user.attributes.sub if using Cognito UUIDs

  const fileName = file.name;
  const uploadTime = new Date().toISOString();

  const requestBody = {
    user_id: userId,
    file_name: fileName,
    upload_timestamp: uploadTime,
    s3_key: `s3://your-bucket/${fileName}`
  };

  await fetch('https://your-api-gateway-url/upload-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
}
