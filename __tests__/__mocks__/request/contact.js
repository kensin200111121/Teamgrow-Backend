const contact_req = {
  new_contact_req: {
    additional_field: {},
    address: '',
    addresses: [],
    cell_phone: '+12045552123',
    city: '',
    country: '',
    email: 'bluepine618@hotmail.com',
    emails: [{ value: 'bluepine618@hotmail.com', isPrimary: true, type: '' }],
    first_name: 'rui',
    last_name: 'ning',
    phones: [{ value: '+12045552123', isPrimary: true, type: '' }],
    state: '',
    tags: [],
    unsubscribed: {},
    zip: '',
  },
  phone_contact_req: {
    additional_field: {},
    address: '',
    addresses: [],
    cell_phone: '+12045552123',
    city: '',
    country: '',
    email: '',
    emails: [{ value: 'bluepine618@hotmail.com', isPrimary: true, type: '' }],
    first_name: 'rui',
    last_name: 'ning',
    phones: [{ value: '+12045552123', isPrimary: true, type: '' }],
    state: '',
    tags: [],
    unsubscribed: {},
    zip: '',
  },
};

const csv_contacts = [
  {
    last_name: '',
    email: 'bluepine618@hotmail.com',
    secondary_email: '',
    cell_phone: '+13125440641',
    secondary_phone: '',
    country: '',
    tags: '',
    rate_lock: false,
    favorite: false,
    first_name: 'bluepine618',
  },
  {
    last_name: '',
    email: 'test@mail.com',
    secondary_email: '',
    cell_phone: '+13125440641',
    secondary_phone: '',
    country: '',
    tags: '',
    rate_lock: false,
    favorite: false,
    first_name: 'bluepine618',
  },
  {
    last_name: '',
    email: 'secondary@hotmail.com',
    secondary_email: '',
    cell_phone: '+13125440641',
    secondary_phone: '',
    country: '',
    tags: '',
    first_name: 'bluepine618',
  },
];

const advance_search_data = {
  searchStr: '123',
  analyticsConditions: [],
  recruitingStageCondition: [],
  countryCondition: [],
  regionCondition: [],
  cityCondition: [],
  zipcodeCondition: '',
  tagsCondition: [],
  stagesCondition: [],
  sourceCondition: [],
  brokerageCondition: [],
  activityCondition: [],
  labelCondition: [],
  lastMaterial: {
    send_video: {
      flag: false,
    },
    send_image: {
      flag: false,
    },
    send_pdf: {
      flag: false,
    },
    watched_video: {
      flag: false,
    },
    watched_image: {
      flag: false,
    },
    watched_pdf: {
      flag: false,
    },
  },
  materialCondition: {
    watched_video: {
      flag: false,
    },
    watched_image: {
      flag: false,
    },
    watched_pdf: {
      flag: false,
    },
    not_watched_video: {
      flag: false,
    },
    not_watched_image: {
      flag: false,
    },
    not_watched_pdf: {
      flag: false,
    },
    sent_video: {
      flag: false,
    },
    sent_image: {
      flag: false,
    },
    sent_pdf: {
      flag: false,
    },
    not_sent_video: {
      flag: false,
    },
    not_sent_image: {
      flag: false,
    },
    not_sent_pdf: {
      flag: false,
    },
  },
  includeLabel: true,
  includeLastActivity: true,
  includeBrokerage: true,
  includeSource: true,
  includeStage: true,
  includeTag: true,
  orTag: true,
  includeFollowUps: true,
  assigneeCondition: [],
  teamOptions: {},
  customFieldCondition: [],
  unsubscribed: {
    email: true,
    text: false,
  },
  dir: true,
  field: 'name',
  name: 'alpha_down',
  page: 1,
  count: 25,
  skip: 0,
};
module.exports = { contact_req, csv_contacts, advance_search_data };
