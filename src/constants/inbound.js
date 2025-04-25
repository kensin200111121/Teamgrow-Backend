const CONTACT_FIELDS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'cell_phone', label: 'Cell phone' },
  { key: 'tags', label: 'Tags' },
  { key: 'country', label: 'Country' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
  { key: 'address', label: 'Address' },
  { key: 'zip_code', label: 'Zip code' },
  { key: 'source', label: 'Source' },
  { key: 'website', label: 'Website' },
  { key: 'brokerage', label: 'Company' },
  { key: 'note', label: 'Note' },
];

const FOLLOWUP_CREATE_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'content', label: 'Content' },
];

const NOTE_ADD_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'content', label: 'Content' },
];

const AUTOMATION_ASSIGN_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'automatio', label: 'Automation' },
];

const TAG_ADD_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'tag', label: 'Tag' },
];

const VIDEO_SEND_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'video', label: 'Video' },
  { key: 'content_template', label: 'Content Template' },
];

const PDF_SEND_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'pdf', label: 'PDF' },
  { key: 'content_template', label: 'Content Template' },
];

const IMAGE_SEND_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'image', label: 'Image' },
  { key: 'content_template', label: 'Content Template' },
];

module.exports.CONTACT_FIELDS = CONTACT_FIELDS;
module.exports.FOLLOWUP_CREATE_FIELDS = FOLLOWUP_CREATE_FIELDS;
module.exports.NOTE_ADD_FIELDS = NOTE_ADD_FIELDS;
module.exports.AUTOMATION_ASSIGN_FIELDS = AUTOMATION_ASSIGN_FIELDS;
module.exports.TAG_ADD_FIELDS = TAG_ADD_FIELDS;
module.exports.VIDEO_SEND_FIELDS = VIDEO_SEND_FIELDS;
module.exports.PDF_SEND_FIELDS = PDF_SEND_FIELDS;
module.exports.IMAGE_SEND_FIELDS = IMAGE_SEND_FIELDS;
