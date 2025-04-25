const api = {
  AWS: {
    AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_S3_REGION: process.env.AWS_S3_REGION,
    AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
    AWS_SES_REGION: process.env.AWS_SES_REGION,
    AWS_PRIVATE_S3_BUCKET: process.env.AWS_PRIVATE_S3_BUCKET,
    CLOUDFRONT_ACCESS_KEY: process.env.CLOUDFRONT_ACCESS_KEY,
    CLOUDFRONT_PUBLIC_KEY: process.env.CLOUDFRONT_PUBLIC_KEY,
    CLOUDFRONT: process.env.CLOUDFRONT,
    API_GATEWAY:
      process.env.API_GATEWAY ||
      'https://f8nhu9b8o4.execute-api.us-east-2.amazonaws.com',
  },
  OUTLOOK_CLIENT: {
    OUTLOOK_CLIENT_ID: process.env.OUTLOOK_CLIENT_ID,
    OUTLOOK_CLIENT_SECRET: process.env.OUTLOOK_CLIENT_SECRET,
    OLD_OUTLOOK_CLIENT_ID: process.env.OLD_OUTLOOK_CLIENT_ID,
    OLD_OUTLOOK_CLIENT_SECRET: process.env.OLD_OUTLOOK_CLIENT_SECRET,
  },
  OUTLOOK_VORTEX_CLIENT: {
    OUTLOOK_CLIENT_ID: process.env.OUTLOOK_CLIENT_VORTEX_ID,
    OUTLOOK_CLIENT_SECRET: process.env.OUTLOOK_CLIENT_VORTEX_SECRET,
  },
  GMAIL_CLIENT: {
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
  },
  GMAIL_VORTEX_CLIENT: {
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_VORTEX_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_VORTEX_SECRET,
  },
  YAHOO_CLIENT: {
    YAHOO_CLIENT_ID: process.env.YAHOO_CLIENT_ID,
    YAHOO_CLIENT_CECRET: process.env.YAHOO_CLIENT_CECRET,
  },
  ZOOM_CLIENT: {
    ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
  },

  APP_JWT_SECRET:
    process.env.APP_JWT_SECRET || 'THIS IS USED TO SIGN AND VERIFY JWT TOKENS',
  ADMIN_JWT_SECERT:
    process.env.JWT_ADMIN_SECERT ||
    'THIS IS USED TO SIGN AND VERIFY JWT TOKENS',
  OLD_JWT_SECRET:
    process.env.OLD_JWT_SECRET || 'THIS IS USED TO SIGN AND VERIFY JWT TOKENS',
  API_CRYPTO_SECRET:
    process.env.API_CRYPTO_SECRET || 'CRMGROW_OPEN_API_KEY_SECRET_KEYS',
  MICRO_ACCESS_TOKEN: process.env.MICRO_ACCESS_TOKEN,
  IDENTITY_TOKEN: process.env.IDENTITY_TOKEN,
  SENDGRID: {
    SENDGRID_KEY: process.env.SENDGRID_KEY,
  },
  TWILIO: {
    TWILIO_SID: process.env.TWILIO_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_NUMBER: process.env.TWILIO_NUMBER,
    SYSTEM_NUMBER: process.env.SYSTEM_NUMBER || '+18445531347',
    TWILIO_DOMAIN_ID: process.env.TWILIO_DOMAIN_ID,
  },
  VAPID: {
    PUBLIC_VAPID_KEY: process.env.PUBLIC_VAPID_KEY,
    PRIVATE_VAPID_KEY: process.env.PRIVATE_VAPID_KEY,
  },
  STRIPE: {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    PLAN: {
      LITE: process.env.STRIPE_PLAN_LITE,
      PRO: process.env.STRIPE_PLAN_PRO,
      EVO_PRO: process.env.STRIPE_PLAN_PRO,
      ELITE: process.env.STRIPE_PLAN_ELITE,
      EVO_ELITE: process.env.STRIPE_PLAN_ELITE,
      MINIMAL: process.env.STRIPE_PLAN_MINIMAL,
      SLEEP: process.env.STRIPE_PLAN_SLEEP,
      EXT_MONTH: process.env.STRIPE_PLAN_EXT_MONTH,
      EXT_YEAR: process.env.STRIPE_PLAN_EXT_YEAR,
      GROWTH: process.env.STRIPE_PLAN_GROWTH,
      GROWTH_PLUS_TEXT: process.env.STRIPE_PLAN_GROWTH_PLUS_TEXT,
    },
    DISCOUNT: {
      TWENTY: process.env.STRIPE_DISCOUNT_TWENTY,
    },
    DIALER: {
      PREV: process.env.STRIPE_DIALER_PREV,
      SINGLE: process.env.STRIPE_DIALER_SINGLE,
      MULTI: process.env.STRIPE_DIALER_MULTI,
    },
  },
  EMAIL_VERIFICATION_KEY: process.env.EMAIL_VERIFICATION_KEY,
  REWARDFUL: {
    API_KEY: process.env.REWARDFUL_API_KEY,
  },
  FIRSTPROMOTER: {
    API_KEY: process.env.FIRSTPROMOTER_API_KEY,
  },
  UNLAYER: {
    PROJECT_ID: process.env.UNLAYER_PROJECT_ID,
    API_KEY: process.env.UNLAYER_API_KEY,
  },
  DIALER: {
    VENDOR_ID: process.env.WAVV_VENDOR_ID,
    API_KEY: process.env.WAVV_API_KEY,
    VORTEX_VENDOR_ID: process.env.WAVV_VORTEX_VENDOR_ID,
    VORTEX_API_KEY: process.env.WAVV_VORTEX_API_KEY,
  },
  API_JWT_SECRET: process.env.API_JWT_SECRET,
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
  CONVRRT: {
    PROJECT_ID: process.env.CONVRRT_PROJECT_ID,
    ORG_ID: process.env.CONVRRT_ORG_ID,
  },
  API_ACCESS_TOKEN: process.env.API_ACCESS_TOKEN || 'xapitoken',
  FIREBASE: {
    type: process.env.FB_TYPE || 'service_account',
    project_id: process.env.FB_PROJECT_ID || 'crmgrow-xxxxx',
    private_key_id:
      process.env.FB_PRIVATE_KEY_ID || 'xxxxx3fb6cfcb8f9ea66146ccrmgrowcrmgrow',
    private_key:
      process.env.FB_PRIVATE_KEY ||
      '-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----\n',
    client_email:
      process.env.FB_CLIENT_EMAIL ||
      'firebase-adminsdk-xxxxx@crmgrow-xxxxx.iam.gserviceaccount.com',
    client_id: process.env.FB_CLIENT_ID || 'crmgrow4274335crmgrow',
    auth_uri:
      process.env.FB_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri:
      process.env.FB_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url:
      process.env.FB_AUTH_PROVIDER_CERT_URI ||
      'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url:
      process.env.FB_CLIENT_CERT_URI ||
      'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx2%40crmgrow-xxxxx.iam.gserviceaccount.com',
  },
  SLACK: {
    NEW_EXTENSION_USERS: process.env.NEW_EXTENSION_USERS,
  },
  SENTRY: {
    SENTRY_DSN: process.env.SENTRY_DSN,
  },
  GITHUB: {
    ACTION_LAUNCH: process.env.GIT_ACTION_LAUNCH_TOKEN,
  },
};

module.exports = api;
