/**
 * Author: Jian and LiWei
 * This file will backup the old contact json data again avoding the _id and email confliction on the specified user account.
 */
const mongoose = require('mongoose');
const Contact = require('../src/models/contact');
const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../src/configs/database');

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => {
    console.log('connected');
    importContact();
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const importContact = async () => {
  let added = 0;
  for (let i = 0; i < old_contacts.length; i++) {
    const sameIdContact = await Contact.findOne({
      _id: mongoose.Types.ObjectId(old_contacts[i]._id),
    }).catch(() => {});
    if (sameIdContact) {
      console.log('already exists with id: ' + old_contacts[i]._id);
      continue;
    }
    if (old_contacts[i].email) {
      const sameEmailContact = await Contact.findOne({
        email: old_contacts[i].email,
        user: old_contacts[i].user,
      }).catch(() => {});
      if (sameEmailContact) {
        console.log('already exists with email: ' + old_contacts[i].email);
        continue;
      }
    }
    const contact = new Contact(old_contacts[i]);
    await contact
      .save()
      .then((data) => {
        console.log('data', data);
      })
      .catch((err) => {
        console.log('adding is failed', err);
      });
    console.log('added correctly');
    added++;
  }
  console.log('import finished', added);
};

const ObjectId = (str) => str;
const ISODate = (str) => new Date(str);
const old_contacts = [
  {
    _id: ObjectId('6081918cd7ca740cfa306788'),
    last_name: 'Martin',
    email: 'thomasmartin99@msn.com',
    user: [ObjectId('6080c498f3edf8668a9ffb74')],
    shared_members: [],
    seconary_email: '',
    cell_phone: '+14079213645',
    secondary_phone: '',
    country: 'US',
    tags: ['30DayColdAttraction', 'Automation Stop'],
    first_name: 'Tom',
    recruiting_stage: 'Initial Contact Made',
    created_at: ISODate('2021-04-22T15:09:00.685Z'),
    updated_at: ISODate('2024-04-10T11:43:01.043Z'),
    __v: 0,
    last_activity: ObjectId('66167b45024a3bf33a90eb95'),
    texted_unsbcription_link: true,
    label: ObjectId('609841c215761b12b96736a2'),
    temp_rate: 3,
    rate: 3,
    updatedAt: ISODate('2023-01-19T18:47:34.452Z'),
    text_notification: {
      material: false,
      text_replied: false,
      email: false,
      link_clicked: false,
      follow_up: false,
      lead_capture: false,
      unsubscription: false,
      resubscription: false,
      reminder_scheduler: false,
    },
    automation_off: ISODate('2024-04-04T16:24:11.457Z'),
  },
  {
    _id: ObjectId('6081b1c12316fa0db6554d6e'),
    last_name: 'Fiscina',
    email: 'mtfproperties@gmail.com',
    user: [ObjectId('6080c498f3edf8668a9ffb74')],
    shared_members: [],
    seconary_email: '',
    cell_phone: '+13863148001',
    secondary_phone: '',
    country: 'US',
    tags: ['30DayColdAttraction', 'Automation Stop'],
    first_name: 'Mike',
    source: 'Sphere',
    brokerage: 'Re/Max',
    recruiting_stage: 'Initial Contact Made',
    state: 'Florida',
    created_at: ISODate('2021-04-22T17:26:25.805Z'),
    updated_at: ISODate('2024-04-12T12:23:21.964Z'),
    __v: 0,
    last_activity: ObjectId('661927b9f55666f91e598b5a'),
    temp_rate: 3,
    rate: 3,
    updatedAt: ISODate('2023-01-19T18:47:33.632Z'),
    texted_unsbcription_link: true,
    text_notification: {
      material: false,
      text_replied: false,
      email: false,
      link_clicked: false,
      follow_up: false,
      lead_capture: false,
      unsubscription: false,
      resubscription: false,
      reminder_scheduler: false,
    },
    automation_off: ISODate('2024-04-04T16:24:11.477Z'),
  },
];
