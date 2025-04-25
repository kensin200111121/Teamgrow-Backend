const mongoose = require('mongoose');

const email_user_garbage = {
  id: mongoose.Types.ObjectId('64aef9d778c3d10e1b24431b'),
  _id: mongoose.Types.ObjectId('64aef9d778c3d10e1b24431b'),
  user: [mongoose.Types.ObjectId('64aef9d778c3d10e1b244319')],
  edited_video: [],
  edited_pdf: [],
  edited_image: [],
  edited_automation: [],
  edited_label: [],
  reminder_before: 10,
  reminder_scheduler: 20,
  capture_dialog: false,
  capture_delay: 0,
  capture_videos: [],
  capture_images: [],
  capture_pdfs: [],
  capture_form: 'default',
  capture_field: {
    default: {
      name: 'Simple Form',
      fields: [
        {
          required: true,
          name: 'First Name',
          type: 'text',
          placeholder: '',
        },
        {
          required: true,
          name: 'Last Name',
          type: 'text',
          placeholder: '',
        },
        {
          required: true,
          name: 'Email',
          type: 'email',
          placeholder: '',
        },
        {
          required: false,
          name: 'Phone',
          type: 'phone',
          placeholder: '',
        },
      ],
      tags: [],
      automation: '',
      capture_delay: 0,
      capture_video: '',
    },
  },
  material_theme: 'theme2',
  auto_follow_up: {
    enabled: false,
    period: 0,
    content: 'has reviewed material',
  },
  auto_resend: {
    enabled: false,
    period: 24,
  },
  auto_follow_up2: {
    enabled: false,
    period: 0,
    content: 'has reviewed material',
  },
  auto_resend2: {
    enabled: false,
    period: 24,
  },
  highlights: [],
  brands: [],
  additional_fields: [],
  template_tokens: [],
  calendar_info: {
    is_enabled: false,
  },
  smtp_info: {
    business_day: {
      sun: false,
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: false,
    },
  },
  business_time: {
    is_enabled: true,
    start_time: '00:00:00.000',
    end_time: '23:00:00.000',
    enabled_days: [],
  },
  business_day: {
    sun: true,
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: true,
  },
  confirm_message: {
    automation_business_hour: true,
    email_out_of_business_hour: true,
    email_mass_overflow: false,
  },
  read_notifications: [],
  csv_templates: [],
  call_labels: [],
  twilio_sub_account: {
    is_enabled: false,
  },
  twilio_campaign_draft: {
    messages: [],
  },
  team_settings: [
    {
      id: 'admin',
      options: [
        {
          id: 'admin.login_enabled',
          value: false,
        },
        {
          id: 'admin.master_enabled',
          value: false,
        },
        {
          id: 'admin.billing_access_enabled',
          value: false,
          options: [
            {
              id: 'admin.team_stay_enabled',
              value: true,
            },
          ],
        },
        {
          id: 'admin.assignee_info.is_editable',
          value: false,
        },
      ],
    },
    {
      id: 'member',
      options: [
        {
          id: 'member.login_enabled',
          value: false,
        },
        {
          id: 'member.master_enabled',
          value: false,
        },
        {
          id: 'member.billing_access_enabled',
          value: false,
          options: [
            {
              id: 'member.team_stay_enabled',
              value: true,
            },
          ],
        },
        {
          id: 'member.assignee_info.is_editable',
          value: false,
        },
      ],
    },
  ],
  is_notification_read: false,
  created_at: new Date('2023-07-12T19:07:03.264+0000'),
  updated_at: new Date('2024-08-13T02:20:53.115+0000'),
  __v: 6,
  access_token: 'test-access_token',
  capture_forms: {},
  calendly: {
    token: 'test-calendly-token',
    email: 'rui@crmgrow.com',
  },
  api_key: 'test-api-key',
  zoom: 'test-zoom-token',
  desktop_notification: {
    material: true,
    text_replied: true,
    email: true,
    link_clicked: true,
    follow_up: true,
    lead_capture: true,
    unsubscription: true,
    resubscription: false,
    reminder_scheduler: true,
  },
  email_notification: {
    material: true,
    text_replied: true,
    email: true,
    link_clicked: true,
    follow_up: true,
    lead_capture: true,
    unsubscription: true,
    resubscription: true,
    reminder_scheduler: true,
  },
  mobile_notification: {
    email: true,
    follow_up: true,
    lead_capture: false,
    link_clicked: true,
    material: true,
    reminder_scheduler: false,
    resubscription: true,
    text_replied: false,
    unsubscription: true,
  },
  text_notification: {
    material: true,
    text_replied: true,
    email: true,
    link_clicked: true,
    follow_up: true,
    lead_capture: true,
    unsubscription: true,
    resubscription: false,
    reminder_scheduler: true,
  },
};

module.exports = { email_user_garbage };
