const request = require('request-promise');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const { PACKAGE } = require('../constants/package');
const { agentFilterLog } = require('./activity');
const { sendErrorToSentry } = require('./utility');

const getAgents = async (url, user) => {
  request({
    method: 'GET',
    uri: url,
    headers: {
      'Content-Type': 'application/json',
    },
    json: true,
  })
    .then((data) => {
      if (data?.length) {
        for (let i = 0; i < data.length; i++) {
          const contact = new Contact({
            first_name: data[i].fname,
            last_name: data[i].lname,
            cell_phone: data[i].phone ? `+1${data[i].phone}` : '',
            zip: data[i].zip,
            state: data[i].state,
            city: data[i].city,
            address: data[i].street,
            brokerage: data[i].brokerage,
            tags: ['AVM'],
            type: 'avm',
            user: [user],
          });
          contact
            .save()
            .then((_contact) => {
              const content = agentFilterLog('added');
              const activity = new Activity({
                content,
                contacts: _contact.id,
                user,
                type: 'contacts',
              });
              activity.single_id = activity._id;
              activity
                .save()
                .then((_activity) => {
                  Contact.updateOne(
                    { _id: _contact.id },
                    {
                      $set: { last_activity: _activity.id },
                    }
                  ).catch((err) => {
                    console.log('err', err);
                  });
                })
                .catch((err) => {
                  console.log('err', err);
                });
            })
            .catch(() => {
              console.log('agent contact creation is failed');
            });
        }
      } else {
        sendErrorToSentry({ _id: user }, new Error('Empty AVM result'));
      }
    })
    .catch((err) => {
      sendErrorToSentry({ _id: user }, err);
      console.log('get agents is failed', err);
    });
};

module.exports = {
  getAgents,
};
