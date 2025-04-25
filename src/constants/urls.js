let domain = 'https://api.crmgrow.com';
let old_domain = 'https://ecsbe.crmgrow.com';
let vortex = 'https://vortexstage3.gst.dev';
let convrrt = 'https://pages.crmgrow.com';
let material = 'https://dev-material.crmgrow.com';
let automation = 'https://dev-automation.crmgrow.com';
let vortex_material = 'https://dev-material.crmgrow.com';
let identity = 'https://stage.identity-server.k8sd.gst.dev';
let calendar = 'https://scheduler.crmgrow.com';
let vortex_calendar = 'https://scheduler.theredx.com';
const DOMAIN_NAME = 'api.crmgrow.com';
let front = 'https://app.crmgrow.com';
if (process.env.NODE_ENV === 'production') {
  domain = 'https://api.crmgrow.com';
  old_domain = 'https://ecsbe.crmgrow.com';
  front = 'https://app.crmgrow.com';
  convrrt = 'https://pages.crmgrow.com';
  vortex = 'https://vortex.theredx.com';
  material = 'https://material.crmgrow.com';
  automation = 'https://automation.crmgrow.com';
  vortex_material = 'https://media.view-content.com';
  identity = 'https://identity-server.redx.com';
} else if (process.env.NODE_ENV === 'staging') {
  domain = 'https://stg-api.crmgrow.com';
  old_domain = 'https://stg-api.crmgrow.com';
  front = 'https://stg-app.crmgrow.com';
  vortex = 'https://vortexstage3.gst.dev';
  convrrt = 'https://stg-pages.crmgrow.com';
  material = 'https://stg-material.crmgrow.com';
  automation = 'https://stg-automation.crmgrow.com';
  vortex_material = 'https://stg-material.crmgrow.com';
  identity = 'https://stage.identity-server.k8sd.gst.dev';
  calendar = 'https://stg-scheduler.crmgrow.com';
  vortex_calendar = 'https://vortex-scheduler1.gst.dev';
} else if (process.env.NODE_ENV === 'development') {
  domain = 'https://dev-api.crmgrow.com';
  old_domain = 'https://dev-api.crmgrow.com';
  front = 'https://dev-app.crmgrow.com';
  vortex = 'https://vortexstage.gst.dev';
  convrrt = 'https://stg-pages.crmgrow.com';
  material = 'https://dev-material.crmgrow.com';
  automation = 'https://dev-automation.crmgrow.com';
  vortex_material = 'https://dev-material.crmgrow.com';
  identity = 'https://stage.identity-server.k8sd.gst.dev';
  calendar = 'https://scheduler1.crmgrow.com';
  vortex_calendar = 'https://scheduler1.theredx.com';
} else {
  domain = 'http://127.0.0.1:3000';
  old_domain = 'http://127.0.0.1:3000';
  front = 'http://localhost:4200';
  vortex = 'https://vortexstage3.gst.dev';
  convrrt = 'https://stg-pages.crmgrow.com';
  material = 'http://127.0.0.1:3002';
  automation = 'http://127.0.0.1:3003';
  vortex_material = 'http://127.0.0.1:3003';
  identity = 'https://stage.identity-server.k8sd.gst.dev';
}

const urls = {
  MAIN_DOMAIN: '.crmgrow.com',
  DOMAIN_ADDR: domain,
  DOMAIN_NAME,
  DOMAIN_ORIGIN: front,
  MATERIAL_URL: material,
  MICRO_AUTOMATION_URL: `${automation}/micro`,
  DOMAIN_URL: `${front}/`,
  API_URL: `${domain}/api/`,
  LOGIN_URL: `${front}/login`,
  PROFILE_URL: `${front}/profile/`,
  SOCIAL_SIGNUP_URL: `${front}/signup/`,
  INTEGRATION_URL: `${front}/settings/integration`,
  APP_SIGNIN_URL: `${domain}/social-oauth-callback/`,
  APP_SIGNUP_URL: `${domain}/social-register-callback/`,
  OUTLOOK_AUTHORIZE_URL: `${front}/profile/outlook`,
  GMAIL_AUTHORIZE_URL: `${front}/profile/gmail`,
  GOOGLE_CONTACT_URL: `${front}/contacts`,
  ZOOM_AUTHORIZE_URL: `${front}/profile/zoom`,
  GOOGLE_CALENDAR_AUTHORIZE_URL: `${front}/calendar/google`,
  OUTLOOK_CALENDAR_AUTHORIZE_URL: `${front}/calendar/outlook`,
  VIDEO_THUMBNAIL_URL: `${domain}/api/video/thumbnail/`,
  PDF_PREVIEW_URL: `${domain}/api/pdf/preview/`,
  IMAGE_PREVIEW_URL: `${domain}/api/image/preview/`,
  FILE_URL: `${domain}/api/file/`,
  VIDEO_URL: `${domain}/api/video/pipe/`,
  MATERIAL_VIEW_VIDEO_URL: `${material}/video1/`,
  MATERIAL_USER_VIEW_VIDEO_URL: `${material}/video`,
  MATERIAL_OLD_USER_VIEW_VIDEO_URL: `${old_domain}/video`,
  MATERIAL_VIEW_PAGE: `${material}/material`,
  MATERIAL_VIEW_PDF_URL: `${material}/pdf1/`,
  MATERIAL_USER_VIEW_PDF_URL: `${material}/pdf`,
  MATERIAL_OLD_USER_VIEW_PDF_URL: `${old_domain}/pdf`,
  MATERIAL_VIEW_IMAGE_URL: `${material}/image1/`,
  MATERIAL_USER_VIEW_IMAGE_URL: `${material}/image`,
  MATERIAL_OLD_USER_VIEW_IMAGE_URL: `${old_domain}/image`,
  LANDING_PAGE_URL: `${material}/page1/`,
  CONTACT_PAGE_URL: `${front}/contacts/`,
  DEAL_PAGE_URL: `${front}/pipeline/deals/`,
  ANALYTIC_VIDEO_PAGE_URL: `${front}/materials/analytics/video/`,
  ANALYTIC_PDF_PAGE_URL: `${front}/materials/analytics/pdf/`,
  ANALYTIC_IMAGE_PAGE_URL: `${front}/materials/analytics/image/`,
  FOLLOWUP_PAGE_URL: `${front}/tasks/`,

  ASSETS_URL: `${domain}/assets/`,
  ACCEPT_INVITATION_URL: `${domain}/api/appointment/accept?`,
  DECLINE_INVITATION_URL: `${domain}/api/appointment/decline?`,
  SMS_RECEIVE_URL: `${domain}/api/sms/receive-twilio/`,
  CALL_RECEIVE_URL: `${domain}/api/call/forward-twilio/`,
  RESET_PASSWORD_URL: `${front}/reset-password/`,
  AVATAR_URL:
    'https://marketing-image-production.s3.amazonaws.com/uploads/cdf34fec41e40d4000fcf649d42a6666957666fba97ba03fa77eed3365e757943285d8cb65df1e79749c088f114af817384e9ff251957e17162e6e223379f3e2.png',
  CONTACT_CSV_URL:
    'https://teamgrow.s3.us-east-2.amazonaws.com/csv_template.csv',
  IMPORT_CSV_URL: `${front}/contacts/import-csv`,
  INTRO_VIDEO_URL: 'https://crmgrow.com/demo',
  // INTRO_VIDEO_URL: `${domain}/video?video=5eeb3e0c702a0f3536f5501a&user=5e9a02eaefb6b2a3449245dc`,
  GOOGLE_CALENDAR_URL: 'https://calendar.google.com/calendar/r/eventedit?',
  TRACK_URL: `${domain}/api/email/opened/`,
  UNSUBSCRIPTION_URL: `${domain}/unsubscribe`,
  RESUBSCRIPTION_URL: `${domain}/resubscribe/`,
  CLICK_REDIRECT_URL: `${domain}/redirect`,
  LOGO_URL: 'https://teamgrow.s3.us-east-2.amazonaws.com/image.png',
  DEFAULT_TEMPLATE_PAGE_LOGO: `${domain}/theme/images/default_logo.png`,
  STORAGE_BASE: 'https://teamgrow.s3.us-east-2.amazonaws.com',
  TEAM_LIST_URL: `${front}/community/`,
  TEAM_URL: `${front}/community/`,
  TEAM_ACCEPT_URL: `${front}/community/accept/`,
  TEAM_ACCEPT_REQUEST_URL: `${front}/community/accept-request`,
  TEAM_CALLS: `${front}/community/calls/`,

  BILLING_URL: `${front}/profile/billing`,
  FACEBOOK_URL: 'https://www.facebook.com/groups/crmgrowgroup',
  TERMS_SERVICE_URL: 'https://crmgrow.com/terms_of_service.html',
  PRIVACY_URL: 'https://crmgrow.com/privacy.html',
  UNSUSCRIPTION_URL: `${front}/settings/notifications`,
  RECORDING_PREVIEW_URL:
    'https://teamgrow.s3.us-east-2.amazonaws.com/gif120/9/5f7fd210b5c62a75b11e130b',
  ONEONONE_URL: 'https://crmgrow.com/oneonone',
  FOLLOWUP_TYPE_URL: {
    task: 'https://teamgrow.s3.us-east-2.amazonaws.com/twotone_task_black_48dp.png',
    email:
      'https://teamgrow.s3.us-east-2.amazonaws.com/twotone_email_black_48dp.png',
    material:
      'https://teamgrow.s3.us-east-2.amazonaws.com/twotone_smart_display_black_48dp.png',
    call: 'https://teamgrow.s3.us-east-2.amazonaws.com/twotone_call_black_48dp.png',
    meeting:
      'https://teamgrow.s3.us-east-2.amazonaws.com/twotone_people_black_48dp.png',
  },
  VERIFY_EMAIL_URL: `${front}/verify-email`,
  CONVRRT_DOMAIN: convrrt,

  VORTEX_ORIGIN: vortex,
  VORTEX_DOMAIN_URL: `${vortex}/`,
  VORTEX_OUTLOOK_AUTHORIZE_URL: `${vortex}/crm/profile/outlook`,
  VORTEX_GMAIL_AUTHORIZE_URL: `${vortex}/crm/profile/gmail`,
  VORTEX_GOOGLE_CONTACT_URL: `${vortex}/crm/contacts`,
  VORTEX_ZOOM_AUTHORIZE_URL: `${vortex}/crm/settings/integration`,
  VORTEX_GOOGLE_CALENDAR_AUTHORIZE_URL: `${vortex}/crm/calendar/google`,
  VORTEX_OUTLOOK_CALENDAR_AUTHORIZE_URL: `${vortex}/crm/calendar/outlook`,
  VORTEX_CONTACT_PAGE_URL: `${vortex}/crm/contacts/`,
  VORTEX_FOLLOWUP_PAGE_URL: `${domain}/crm/tasks/`,
  VORTEX_TEAM_LIST_URL: `${vortex}/crm/community/`,
  VORTEX_TEAM_URL: `${vortex}/crm/community/`,
  VORTEX_TEAM_ACCEPT_URL: `${vortex}/crm/community/accept/`,
  VORTEX_TEAM_ACCEPT_REQUEST_URL: `${vortex}/crm/community/accept-request`,
  VORTEX_TEAM_CALLS: `${vortex}/crm/community/calls/`,
  VORTEX_MATERIAL_USER_VIEW_VIDEO_URL: `${vortex_material}/video`,
  VORTEX_MATERIAL_USER_VIEW_PDF_URL: `${vortex_material}/pdf`,
  VORTEX_MATERIAL_USER_VIEW_IMAGE_URL: `${vortex_material}/image`,
  VORTEX_MATERIAL_VIEW_VIDEO_URL: `${vortex_material}/video1/`,
  VORTEX_MATERIAL_VIEW_PDF_URL: `${vortex_material}/pdf1/`,
  VORTEX_MATERIAL_VIEW_IMAGE_URL: `${vortex_material}/image1/`,
  VORTEX_LANDING_PAGE_URL: `${vortex_material}/page1/`,
  MICRO_APP_URL: `${domain}/micro`,
  IDENTITY_API_URL: `${identity}/api`,
  VORTEX_API_URL: `${vortex}/api`,
  WAVV_URL: 'https://api.wavv.com/v2/',
  CALENDAR: calendar,
  CALENDAR_VORTEX: vortex_calendar,
  SOCKET_ORIGINS: [
    front,
    vortex,
    'https://mail.google.com',
    ...(process.env.NODE_ENV === 'production'
      ? []
      : [
          'https://vortexstage2.gst.dev',
          'https://vortexstage3.gst.dev',
          'https://vortexdemo.gst.dev',
          'http://localhost:4200',
        ]),
  ],
};

module.exports = urls;
