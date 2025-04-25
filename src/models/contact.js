/* eslint-disable prettier/prettier */
const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const { CountryState, Countries } = require('../constants/variable');

const ContactSchema = new Schema(
  {
    first_name: String,
    last_name: { type: String, default: '' },
    email: { type: String, default: '' },
    emails: [
      {
        value: { type: String, default: '' },
        type: { type: String, default: '' },
        isPrimary: { type: Boolean, default: false },
      },
    ],
    user: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    shared_members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    type: String,
    personId: String,
    pending_users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    declined_users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    shared_team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'team' }],
    shared_all_member: { type: Boolean, default: false },
    last_activity: { type: mongoose.Schema.Types.ObjectId, ref: 'activity' },
    address: String,
    addresses: [
      {
        street: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        zip: { type: String, default: '' },
        country: { type: String, default: '' },
        type: { type: String, default: '' },
        isPrimary: { type: Boolean, default: false },
      },
    ],
    city: String,
    state: String,
    zip: String,
    label: { type: mongoose.Schema.Types.ObjectId, ref: 'label' },
    secondary_email: { type: String, default: '' },
    cell_phone: { type: String, default: '' },
    secondary_phone: { type: String, default: '' },
    phones: [
      {
        value: { type: String, default: '' },
        type: { type: String, default: '' },
        isPrimary: { type: Boolean, default: false },
      },
    ],
    country: { type: String, default: '' },
    auto_follow_up: { type: mongoose.Schema.Types.ObjectId, ref: 'follow_up' },
    texted_unsbcription_link: Boolean,
    source: String, // prospect
    brokerage: String,
    tags: {
      type: [
        {
          type: String,
          lowercase: true,
        },
      ],
      default: [],
    },
    recruiting_stage: String,
    website: String,
    additional_field: Object,
    rate: Number,
    automation_off: Date,
    rate_lock: { type: Boolean, default: false },
    favorite: { type: Boolean, default: false },
    temp_rate: Number,
    created_at: Date,
    updated_at: Date,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    original_id: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    original_user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    unsubscribed: {
      email: { type: Boolean, default: false },
      text: { type: Boolean, default: false },
    },
    prospect_id: { type: String },
    message: {
      last_received: { type: mongoose.Schema.Types.ObjectId, ref: 'text' },
      last: { type: mongoose.Schema.Types.ObjectId, ref: 'text' },
    },
    birthday: {
      year: { type: Number },
      month: { type: Number },
      day: { type: Number },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

ContactSchema.pre('save', function (next) {
  const contact = this;

  if (this.isNew) {
    // country
    if (contact.country) {
      let country = '';
      const keys = Object.keys(Countries);
      const values = Object.values(Countries);
      if (keys.indexOf(contact.country.toUpperCase()) === -1) {
        if (values.indexOf(contact.country.toUpperCase()) === -1) {
          country = '';
        } else {
          country = contact.country.toUpperCase();
        }
      } else {
        country = Countries[contact.country.toUpperCase()];
      }
      contact.country = country;
    }
    // country

    if (contact.state) {
      let state = '';
      let country = '';
      for (let i = 0; i < CountryState.length; i++) {
        const keys = Object.keys(CountryState[i]['state']);
        const values = Object.values(CountryState[i]['state']);
        if (values.indexOf(capitalize(contact.state)) === -1) {
          state = '';
          country = '';
        } else {
          state = capitalize(contact.state);
          country = CountryState[i]['name'];
          break;
        }
        if (keys.indexOf(contact.state.toUpperCase()) === -1) {
          state = '';
          country = '';
        } else {
          state = CountryState[i]['state'][contact.state.toUpperCase()];
          country = CountryState[i]['name'];
          break;
        }
      }
      contact.country = country;
      contact.state = state;
    }
    // state

    if (contact.user && !contact.owner) {
      contact.owner = contact.user;
    }
  }

  return next();
});

const LABEL = [
  '',
  'New',
  'Cold',
  'Team',
  'Warm',
  'Hot',
  'Trash',
  'Appt Set',
  'Appt Missed',
  'Lead',
];

const capitalize = (str) => {
  var splitStr = str.toLowerCase().split(' ');
  for (var i = 0; i < splitStr.length; i++) {
    // You do not need to check if i is larger than splitStr length, as your for does that for you
    // Assign it back to the array
    splitStr[i] =
      splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
  }
  // Directly return the joined string
  return splitStr.join(' ');
};

ContactSchema.index({ user: 1, first_name: 1, last_name: 1 });
ContactSchema.index({ user: 1, email: 1 });
ContactSchema.index({ user: 1, cell_phone: 1 });
ContactSchema.index({ shared_members: 1 });
ContactSchema.index({ pending_users: 1 });
ContactSchema.index({ user: 1 });

const Contact = mongoose.model('contact', ContactSchema);

module.exports = Contact;
