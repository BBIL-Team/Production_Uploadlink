import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },

  multifactor: {
    mode: 'OPTIONAL',
    email: true,
  },

  accountRecovery: 'EMAIL_AND_PHONE_WITHOUT_MFA',

  senders: {
    email: {
      fromEmail:
        'bbil-production-dashboard@bbil-organisation.awsapps.com',
      fromName: 'BBIL Production Dashboard',
    },
  },
});
