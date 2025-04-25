const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const system_settings = require('../configs/system_settings');
const { PACKAGE } = require('../constants/package');

const UserSchema = new Schema(
  {
    user_name: String,
    nick_name: String,
    social_id: String,
    email: String,
    hash: String,
    salt: String,
    cell_phone: String,
    phone: {
      number: String,
      internationalNumber: String,
      nationalNumber: String,
      countryCode: String,
      areaCode: String,
      dialCode: String,
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'payment' },
    sub_account_payments: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'payment' },
    ],
    time_zone_info: String,
    email_signature: { type: String, default: '' },
    pre_loaded: Boolean,
    location: { type: String, default: '' },
    twilio_number: String,
    twilio_number_id: String,
    twilio_number_scope: { type: String, default: 'primary' },
    picture_profile: String,
    learn_more: String,
    role: String,
    primary_connected: Boolean,
    outlook_refresh_token: String,
    outlook_version: String, // TODO: remove this when you remove the old outlook setting from project
    google_refresh_token: String,
    yahoo_refresh_token: String,
    other_emailer: Object,
    connected_email_type: String,
    calendar_connected: Boolean,
    calendar_list: Array,
    connected_email: String,
    connected_email_id: String, // only used for identity tokens (vortex user), not useful for crmgrow user.
    daily_report: Boolean,
    weekly_report: Boolean,
    admin_notification: { type: Number, default: 0 },
    desktop_notification: Boolean,
    desktop_notification_subscription: String,
    text_notification: Boolean,
    sub_account_info: {
      is_enabled: Boolean,
      is_limit: { type: Boolean, default: true },
      max_count: Number,
    },
    organization_info: {
      is_enabled: { type: Boolean, default: true },
      is_owner: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: Number,
    },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'organization' },
    is_minimal: Boolean,
    is_primary: { type: Boolean, default: true },
    login_enabled: { type: Boolean, default: true },
    master_enabled: { type: Boolean, default: true },
    user_disabled: { type: Boolean, default: false },
    primary_account: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    billing_access_enabled: { type: Boolean, default: true },
    team_stay_enabled: { type: Boolean, default: true },
    assistant_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: PACKAGE.PRO.assistant_info.max_count,
      },
    },
    text_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: PACKAGE.PRO.text_info.max_count,
      },
      count: { type: Number, default: 0 }, // used text count (recieved, sent, failed)
      received: { type: Number, default: 0 }, // received text count
      failed: { type: Number, default: 0 }, // failed text count
      additional_credit: Object,
      initial_credit: { type: Boolean, default: false },
      subaccount_used_count: { type: Number, default: 0 }, // used text count for all sub accounts (except itself)
    },
    calendar_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: PACKAGE.PRO.calendar_info.max_count,
      },
    },
    email_info: {
      mass_enable: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: system_settings.EMAIL_DAILY_LIMIT.BASIC,
      },
      count: Number,
    },
    automation_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: PACKAGE.PRO.automation_info.max_count,
      },
    },
    material_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      upload_max_count: {
        type: Number,
        default: PACKAGE.PRO.material_info.upload_max_count,
      },
      record_max_duration: {
        type: Number,
        default: PACKAGE.PRO.material_info.record_max_duration,
      },
    },
    team_info: {
      is_enabled: { type: Boolean, default: true },
      owner_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: PACKAGE.PRO.team_info.max_count,
      },
    },
    dialer_info: {
      is_enabled: Boolean,
      level: String,
      payment: { type: mongoose.Schema.Types.ObjectId, ref: 'payment' },
    },
    pipe_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: Number,
    },
    ext_email_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: false },
      max_count: Number,
      emails: {
        type: Array,
        default: [],
      },
    },
    material_track_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: false },
      max_count: Number,
    },
    // onboarding embedded
    user_version: { type: Number, default: system_settings.USER_VERSION },
    capture_enabled: { type: Boolean, default: true },
    link_track_enabled: { type: Boolean, default: true },
    email_verified: Boolean,
    welcome_email: { type: Boolean, default: false },
    is_trial: { type: Boolean, default: true },
    is_free: Boolean,
    wavv_status: {
      value: { type: String, default: '' },
      updated_at: Date,
    },
    is_wavv_enabled: { type: Boolean, default: false }, // status of the wavv sms feature enabled. Used for the support admin for canada users
    subscription: {
      is_failed: { type: Boolean, default: false },
      updated_at: Date,
      is_suspended: { type: Boolean, default: false },
      // suspended_at: Date,
      attempt_count: Number,
      amount: Number,
      period: { type: String, default: 'month' },
      is_limit: { type: Boolean, default: true },
      is_paused: { type: Boolean, default: false },
    },
    package_level: { type: String, default: 'GROWTH' },
    old_package_level: { type: String, default: 'GROWTH' },
    due_commission: Number,
    paid_commission: Number,
    total_commission: Number,
    setup_oneonone: Boolean,
    created_at: Date,
    updated_at: Date,
    last_logged: Date,
    del: { type: Boolean, default: false },
    extension_single: { type: Boolean, default: false },
    disabled_at: Date,
    data_cleaned: Boolean,
    data_released: Boolean,
    cleaned_at: Date,
    close_reason: String,
    close_feedback: String,
    admin_loggin: Boolean,
    guest_loggin: Boolean,
    sub_domain: String,
    wavv_number: String,
    social_link: {
      facebook: String,
      twitter: String,
      linkedin: String,
    },
    company: String,
    affiliate: {
      id: String,
      link: String,
      paypal: String,
      firstpromoter_id: String,
      ref_id: String,
      is_enabled: Boolean,
    },
    old_affiliate: Object,
    referred_firstpromoter: Boolean,
    parent_affiliate: String,
    // campaign smtp connected
    campaign_smtp_connected: Boolean,
    // campaign smtp code is verified
    smtp_info: {
      host: String,
      user: String,
      pass: String,
      secure: Boolean,
      port: Number,
      email: String,
      smtp_connected: Boolean,
      verification_code: String,
      daily_limit: Number,
      start_time: String,
      end_time: String,
    },
    campaign_info: {
      is_enabled: { type: Boolean, default: true },
    },
    email_draft: {
      subject: String,
      content: String,
    },
    text_draft: {
      content: String,
    },
    dialer: String,
    scheduler_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      connected_email: String,
      calendar_id: String,
      max_count: {
        type: Number,
        default: PACKAGE.PRO.scheduler_info.max_count,
      },
    },
    landing_page_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: PACKAGE.PRO.landing_page_info.max_count,
      },
    },
    onboard: {
      watched_modal: { type: Boolean, default: false },
      profile: { type: Boolean, default: false },
      connect_email: { type: Boolean, default: false },
      created_contact: { type: Boolean, default: false },
      upload_video: { type: Boolean, default: false },
      send_video: { type: Boolean, default: false },
      sms_service: { type: Boolean, default: false },
      connect_calendar: { type: Boolean, default: false },
      dialer_checked: { type: Boolean, default: false },
      tour: { type: Boolean, default: false },
      material_download: { type: Boolean, default: false },
      automation_download: { type: Boolean, default: false },
      template_download: { type: Boolean, default: false },
      complete: { type: Boolean, default: false },
    },
    support_info: {
      feature_request: { type: Boolean, default: false },
    },
    version: Object,
    iOSDeviceToken: { type: String },
    androidDeviceToken: { type: String },
    email_alias: [
      {
        email: { type: String },
        name: { type: String },
        code: { type: String },
        expired_at: { type: Date },
        verified: { type: Boolean, default: false },
        primary: { type: Boolean, default: false },
      },
    ],
    google_contact_list: Object,
    notification_info: {
      seenBy: String,
      lastId: String,
    },
    assignee_info: {
      is_enabled: { type: Boolean, default: false },
      is_editable: { type: Boolean, default: false },
    },
    can_restore_seat: Boolean,
    agent_vending_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: PACKAGE.PRO.agent_vending_info.max_count,
      },
    },
    email_watch: {
      started_date: Date,
      history_id: String,
    },
    source: { type: String, default: 'crmgrow' },
    vortex_id: String,
    vortex_wavv: { type: String },
    vortex_matched_id: { type: String }, // This is required on staging only. Because production user id and stage id are different.
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

UserSchema.index({ email: 1 });
UserSchema.index({ nick_name: 1 });
UserSchema.index({ primary_account: 1 });

const User = mongoose.model('user', UserSchema);

module.exports = User;
