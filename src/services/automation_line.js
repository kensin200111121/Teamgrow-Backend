const { automationClient } = require('../constants/clients');

const disableNext = (data) =>
  automationClient
    .post({
      uri: `/automation-line/disable-next/${data.timeline_id}`,
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('disable next api error', err));

const removeAutomationLine = (data) =>
  automationClient
    .post({
      uri: `/automation-line/remove`,
      body: {
        ...data,
      },
    })
    .catch((err) => console.log('remove-automation-line api error', err));

module.exports = {
  disableNext,
  removeAutomationLine,
};
