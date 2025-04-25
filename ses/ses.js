const fs = require('fs');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const api = require('../src/configs/api');
const {
  SESClient,
  CreateTemplateCommand,
  UpdateTemplateCommand,
} = require('@aws-sdk/client-ses');

const ses = new SESClient({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const templateName = 'VortexPageLeadCapture';

const subjects = {
  DailyReport: 'crmgrow report today',
  TaskReminder: `crmgrow task reminder: {{contact_name}} at {{due_start}}`,
  DealTaskReminder: `crmgrow task reminder: {{contact_name}} at {{due_start}}`,
  TeamCallRequest: `crmgrow community member call join request: {{user_name}}`,
  TeamRequest: `crmgrow community member join request: {{user_name}}`,
  TeamRequestAccepted: `{{team_name}} has accepted your join request`,
  TeamRequestDeclined: `{{team_name}} has declined your join request`,
  TeamCallInvitation: `{{user_name}} has accepted your call request`,
  TeamCallInquiryFailed: `{{user_name}} has rejected your call request`,
  TeamCallAccepted: `{{leader_name}} has accepted your call request`,
  OnboardCall: `One on one onboarding`,
  OnboardCall1: `One on one onboarding`,
  EliteJoinWelcome: `Thank you for choosing Elite package`,
  WebinarInvitation: `Live "how to use" crmgrow webinar`,
  Welcome: 'Welcome to crmgrow, {{user_name}}!',
  VideoWatched: 'crmgrow video watched: {{contact_name}} at {{created_at}}',
  VideoLeadCapture: 'crmgrow video watched: {{contact_name}} at {{created_at}}',
  PageLeadCapture: '{{contact_name}} visited lead form page at {{created_at}}',
  EmailOpened: `Opened email: {{contact_name}} at {{created_at}}`,
  PaymentNotification: 'crmgrow payment notification',
  PaymentFailed: 'crmgrow payment failed notification',
  CancelAccount: 'crmgrow cancel notification',
  CancelAccountConfirmation: 'We are sorry to see you go',
  SleepAccount: 'You switched to sleep account',
  ShareContact: 'crmgrow share contact notification',
  TeamInvitation: `You've been invited to join community {{team_name}} in crmgrow`,
  EmailClicked: `Email clicked: {{contact_name}} at {{clicked_at}}`,
  ForgotPassword: `crmgrow forgot password notification`,
  CreateAssistant: `crmgrow assistant invitation`,
  TextReplied: `crmgrow text replied notification`,
  ContactUs: 'crmgrow contact us notification',
  ImageWatched: 'crmgrow image watched: {{contact_name}} at {{created_at}}',
  PdfWatched: 'crmgrow PDF reviewed: {{contact_name}} at {{created_at}}',
  ScheduleEvent: 'New event has been scheduled',
  SchedulerReminder:
    'crmgrow scheduler reminder: {{contact_name}} at {{due_start}}',
  SuspendNotification: 'crmgrow suspended your account',
  WelcomePro: 'Welcome to Pro Subscription of crmgrow',
  WelcomeElite: 'Welcome to Elite Subscription of crmgrow',
  WelcomeGrowth: 'Welcome to Growth Subscription of crmgrow',
  WelcomeGrowthPlusText: 'Welcome to Growth Plus Text Subscription of crmgrow',
  WelcomeDialer: 'Welcome to Wavv Power Dialer of crmgrow',
  WelcomeAddSubProfile: 'Welcome to your additional Elite Profile',
  TeamJoinAccepted: `{{user_name}} has accepted joining community`,
  TeamJoinDeclined: `{{user_name}} has declined joining community`,
  CalendarTokenExpired: 'Calendar token expired',
  EmailTokenExpired: 'Email token expired',
  ZoomTokenExpired: 'Zoom token expired',
  VortexDealTaskReminder: `Vortex task reminder: {{contact_name}} at {{due_start}}`,
  VortexSchedulerReminder:
    'Vortex scheduler reminder: {{contact_name}} at {{due_start}}',
  VortexShareContact: 'Vortex share contact notification',
  VortexTaskReminder: `Vortex task reminder: {{contact_name}} at {{due_start}}`,
  VortexTeamInvitation: `You've been invited to join community {{team_name}} in Vortex`,
  VortexTeamRequest: `Vortex community member join request: {{user_name}}`,
  VortexTeamRequestAccepted: `{{team_name}} has accepted your join request`,
  VortexTeamRequestDeclined: `{{team_name}} has declined your join request`,
  VortexTextReplied: `Vortex text replied notification`,
  VortexImageWatched:
    'vortex image watched: {{contact_name}} at {{created_at}}',
  VortexPdfWatched: 'vortex PDF reviewed: {{contact_name}} at {{created_at}}',
  VortexVideoWatched:
    'vortex video watched: {{contact_name}} at {{created_at}}',
  VortexVideoLeadCapture: 'video watched: {{contact_name}} at {{created_at}}',
  VortexPageLeadCapture:
    '{{contact_name}} visited lead form page at {{created_at}}',
  VortexScheduleEvent: 'New event has been scheduled',
  VortexTeamJoinDeclined: `{{user_name}} has declined joining community`,
  VortexTeamJoinAccepted: `{{user_name}} has accepted joining community`,
  ShareContactInCommunity: `crmgrow share contact notification`,
  VortexShareContactInCommunity: `vortex share contact notification`,
  VortexAutomationExecuteError: 'Automation Deal execution failed',
  AutomationExecuteError: 'Automation Deal execution failed',
  VortexAutomationExecuteContactError: 'Automation Contact execution failed',
  AutomationExecuteContactError: 'Automation Contact execution failed',
};
const htmls = {};
fs.readFile(
  `./readTemplates/${templateName}.html`,
  'utf8',
  async function (err, data) {
    if (err) {
      return console.log(err);
    }
    const createParams = {
      Template: {
        TemplateName: templateName,
        SubjectPart: subjects[templateName],
        TextPart: data,
        HtmlPart: data,
      },
    };
    // If you create new Email template, then plz use "CreateTemplateCommand" function
    // otherwise plz use "UpdateTemplateCommand" function
    // finally plz launch this file using "node ses.js" command
    // const command = new CreateTemplateCommand(createParams);
    const command = new UpdateTemplateCommand(createParams);
    const response = await ses.send(command).catch((err) => {
      console.log('ses command err', err.message);
    });
    console.log('-----response', response);
  }
);
