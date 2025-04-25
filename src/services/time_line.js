const { automationClient } = require('../constants/clients');

const activeTimeline = (data) =>
  automationClient
    .post({
      uri: `/timeline/active/${data.timeline_id}`,
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('active next api error', err));

const removeTimeline = (data) =>
  automationClient
    .post({
      uri: `/timeline/remove`,
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('remove-timeline api error', err));

const setTrigger = (data) =>
  automationClient
    .post({
      uri: `/timeline/set-trigger`,
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('set-trigger api error', err));

const triggerTimeline = (data) =>
  automationClient
    .post({
      uri: `/timeline/trigger`,
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('trigger-timeline api error', err));

const processTimeline = (data) =>
  automationClient
    .post({
      uri: `/automation-line/process`,
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('process-timeline api error', err));

const updateContacts = async (data) => {
  return automationClient
    .post({
      uri: '/timeline/update-contacts',
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('update contact api error', err));
};

module.exports = {
  activeTimeline,
  removeTimeline,
  setTrigger,
  triggerTimeline,
  processTimeline,
  updateContacts,
};
