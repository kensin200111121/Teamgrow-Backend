let crm_caller = 'https://app.crmgrow.com';
let vortex_caller = 'https://vortexstage.gst.dev';
let extension_caller = ['https://mail.google.com', 'chrome-extension://'];
let support_caller = 'https://support.crmgrow.com';
let landing_caller = 'https://crmgrow.com';
let recorder_caller = 'https://crmgrow-record.s3-us-west-1.amazonaws.com';
let desktop_caller = '*';
let lambda_caller = '*';
const only_vortex_caller = '*';
const ucraft_caller = '*';
const zapier_caller = '*';
const agentfire_caller = '*';
const micro_service_caller = '*';
let calendar_caller = 'https://scheduler.crmgrow.com';
const stripe_caller = '*';
const twilio_caller = '*';
const wavv_caller = '*';
let material_service_caller = '';

if (process.env.NODE_ENV === 'production') {
  crm_caller = 'https://app.crmgrow.com';
  vortex_caller = 'https://vortex.theredx.com';
  extension_caller = ['https://mail.google.com', 'chrome-extension://'];
  support_caller = 'https://support.crmgrow.com';
  landing_caller = 'https://crmgrow.com';
  recorder_caller = 'https://crmgrow-record.s3-us-west-1.amazonaws.com';
  desktop_caller = '*';
  lambda_caller = '*';
  calendar_caller = [
    'https://scheduler.crmgrow.com',
    'https://scheduler.theredx.com',
  ];
  material_service_caller = ['material.crmgrow.com'];
} else if (process.env.NODE_ENV === 'staging') {
  crm_caller = 'https://stg-app.crmgrow.com';
  vortex_caller = [
    'https://vortexstage.gst.dev',
    'https://vortexstage2.gst.dev',
    'https://vortexstage3.gst.dev',
    'https://vortexdemo.gst.dev',
  ];
  extension_caller = ['https://mail.google.com', 'chrome-extension://'];
  support_caller = 'https://stg-support.crmgrow.com';
  landing_caller = 'https://crmgrow.com';
  recorder_caller = 'https://crmgrow-record.s3-us-west-1.amazonaws.com';
  desktop_caller = '*';
  lambda_caller = '*';
  calendar_caller = [
    'https://stg-scheduler.crmgrow.com',
    'https://vortex-scheduler1.gst.dev',
  ];
  material_service_caller = ['stg-material.crmgrow.com'];
} else if (process.env.NODE_ENV === 'development') {
  crm_caller = ['https://dev-app.crmgrow.com', 'http://localhost:4200'];
  vortex_caller = [
    'https://vortexstage.gst.dev',
    'https://vortexstage2.gst.dev',
    'https://vortexstage3.gst.dev',
    'https://vortexdemo.gst.dev',
  ];
  extension_caller = ['https://mail.google.com', 'chrome-extension://'];
  support_caller = ['https://dev-support.crmgrow.com', 'http://localhost:4202'];
  landing_caller = 'https://crmgrow.com';
  recorder_caller = 'https://crmgrow-record.s3-us-west-1.amazonaws.com';
  desktop_caller = '*';
  lambda_caller = '*';
  calendar_caller = [
    'https://scheduler1.crmgrow.com',
    'https://vortex-scheduler1.gst.dev',
    'http://localhost:4201',
  ];
  material_service_caller = ['dev-material.crmgrow.com'];
} else {
  crm_caller = 'http://localhost:4200';
  vortex_caller = [
    'https://vortexstage.gst.dev',
    'https://vortexstage2.gst.dev',
    'https://vortexstage3.gst.dev',
    'https://vortexdemo.gst.dev',
  ];
  extension_caller = ['https://mail.google.com', 'chrome-extension://'];
  support_caller = 'http://localhost:4202';
  landing_caller = 'https://crmgrow.com';
  recorder_caller = 'https://crmgrow-record.s3-us-west-1.amazonaws.com';
  desktop_caller = '*';
  lambda_caller = '*';
  calendar_caller = [
    'https://scheduler1.crmgrow.com',
    'https://vortex-scheduler1.gst.dev',
  ];
  material_service_caller = ['http://localhost:3003'];
}

const CALLER_DIC = {
  crmgrow: crm_caller,
  vortex: vortex_caller,
  extension: extension_caller,
  support: support_caller,
  landing: landing_caller,
  recorder: recorder_caller,
  desktop: desktop_caller,
  lambda: lambda_caller,
  only_vortex: only_vortex_caller,
  ucraft: ucraft_caller,
  zapier: zapier_caller,
  agentfire: agentfire_caller,
  micro_service: micro_service_caller,
  calendar: calendar_caller,
  stripe: stripe_caller,
  twilio: twilio_caller,
  wavv: wavv_caller,
  material_service: material_service_caller,
};

const LANDING_WHITELIST = ['landing'];
const RECORDER_WHITELIST = [
  'recorder',
  'desktop',
  'crmgrow',
  'vortex',
  'extension',
];
const LAMBDA_WHITELIST = ['lambda'];
const EXTENSION_WHITELIST = ['extension', 'crmgrow', 'vortex'];
const FRONT_WHITELIST = ['crmgrow', 'vortex'];
const SUPPORT_WHITELIST = ['support'];
const SPECIAL_WHITELIST = ['support', 'crmgrow', 'vortex'];
const ONLY_VORTEX_WHITELIST = ['only_vortex'];
const UCRAFT_WHITELIST = ['ucraft'];
const ZAPIER_WHITELIST = ['zapier'];
const AGENTFIRE_WHITELIST = ['agentfire'];
const MICRO_SERVICE_WHITELIST = ['micro_service'];
const CALENDAR_WHITELIST = ['calendar', 'crmgrow', 'vortex'];
const STRIPE_WHITELIST = ['stripe', 'crmgrow', 'vortex'];
const TWILIO_WHITELIST = ['twilio'];
const WAVV_WHITELIST = ['wavv'];
const MATERIAL_WHITELIST = ['material_service'];

module.exports = {
  CALLER_DIC,
  LANDING_WHITELIST,
  RECORDER_WHITELIST,
  LAMBDA_WHITELIST,
  EXTENSION_WHITELIST,
  FRONT_WHITELIST,
  SUPPORT_WHITELIST,
  SPECIAL_WHITELIST,
  ONLY_VORTEX_WHITELIST,
  UCRAFT_WHITELIST,
  ZAPIER_WHITELIST,
  AGENTFIRE_WHITELIST,
  MICRO_SERVICE_WHITELIST,
  CALENDAR_WHITELIST,
  STRIPE_WHITELIST,
  TWILIO_WHITELIST,
  WAVV_WHITELIST,
  MATERIAL_WHITELIST,
};
