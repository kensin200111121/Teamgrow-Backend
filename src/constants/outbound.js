const CONTACT = {
  id: '',
  first_name: '',
  last_name: '',
  email: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  cell_phone: '',
  country: '',
  source: '',
  company: '',
  label: '',
  tags: '',
  secondary_email: '',
  secondary_phone: '',
  website: '',
  additional_field: '',
  created_at: '',
};

const CONTACT_REMOVE = {
  num: '',
  contacts: '',
  removed_date: '',
};

const DEAL_ADD = {
  id: '',
  title: '',
  user: '',
  contact: '',
  pipe_line: '',
  deal_stage: '',
  additional_field: '',
  create_at: '',
};

const DEAL_MOVE = {
  id: '',
  title: '',
  user: '',
  contact: '',
  pipe_line: '',
  deal_source: '',
  deal_target: '',
  create_at: '',
};

const MATERIAL_SEND = {
  subject: '',
  contact: '',
  video: '',
  pdf: '',
  image: '',
  create_at: '',
};

const MATERIAL_WATCH = {
  contact: '',
  material_id: '',
  material_type: '',
  material_title: '',
  material_amount: '',
  create_at: '',
};

const AUTOMATION_ASSIGNED = {
  id: '',
  title: '',
  type: '',
  deal: '',
  contact: '',
  create_at: '',
};

const NOTE = {
  id: '',
  title: '',
  content: '',
  contact: '',
  create_at: '',
};

const FOLLOWUP = {
  id: '',
  contact: '',
  type: '',
  content: '',
  due_date: '',
  set_recurrence: '',
  recurrence_mode: '',
  create_at: '',
};

const FOLLOWUP_REMOVE = {
  num: '',
  removed_task: '',
  removed_date: '',
};

const LEAD_SOURCE_TYPE = {
  ALL: 'all',
  LEADSCHEDULE: 'leadschedule',
  LEADFORM: 'leadform',
};

const LEAD_SOURCE_TYPE_LIST = [
  { id: LEAD_SOURCE_TYPE.ALL, title: 'All' },
  { id: LEAD_SOURCE_TYPE.LEADSCHEDULE, title: 'Lead Schedule' },
  { id: LEAD_SOURCE_TYPE.LEADFORM, title: 'Lead Form' },
];
module.exports.CONTACT = CONTACT;
module.exports.CONTACT_REMOVE = CONTACT_REMOVE;
module.exports.DEAL_ADD = DEAL_ADD;
module.exports.DEAL_MOVE = DEAL_MOVE;
module.exports.MATERIAL_SEND = MATERIAL_SEND;
module.exports.MATERIAL_WATCH = MATERIAL_WATCH;
module.exports.AUTOMATION_ASSIGNED = AUTOMATION_ASSIGNED;
module.exports.NOTE = NOTE;
module.exports.FOLLOWUP = FOLLOWUP;
module.exports.FOLLOWUP_REMOVE = FOLLOWUP_REMOVE;
module.exports.LEAD_SOURCE_TYPE = LEAD_SOURCE_TYPE;
module.exports.LEAD_SOURCE_TYPE_LIST = LEAD_SOURCE_TYPE_LIST;
