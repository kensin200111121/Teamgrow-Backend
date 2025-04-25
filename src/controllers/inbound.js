const Garbage = require('../models/garbage');
const CustomField = require('../models/custom_field');
const inboundFields = require('../constants/inbound');
const { inbound_constants } = require('../constants/variable');

const getInboundFields = async (req, res) => {
  const { currentUser } = req;
  const { action } = req.body;

  let fields = [];
  switch (action) {
    case inbound_constants.ADD_CONTACT:
    case inbound_constants.UPDATE_CONTACT: {
      fields = [...inboundFields.CONTACT_FIELDS];
      if (action === inbound_constants.UPDATE_CONTACT) {
        fields = fields.filter((x) => x.key !== 'email');
      }
      const additional_fields = await CustomField.find({
        user: currentUser.id,
        type: 'contact',
      }).catch((ex) => {
        console.log('custom field load failed, ', ex.message);
      });
      for (let i = 0; i < additional_fields.length; i++) {
        fields.push({
          key: 'additional_field.' + additional_fields[i].name,
          label: additional_fields[i].name,
        });
      }
      break;
    }
    case inbound_constants.CREATE_FOLLOWUP:
      fields = [...inboundFields.FOLLOWUP_CREATE_FIELDS];
      break;
    case inbound_constants.ADD_NOTE:
      fields = [...inboundFields.add_note_fields];
      break;
    case inbound_constants.ASSING_AUTOMATION:
      fields = [...inboundFields.AUTOMATION_ASSIGN_FIELDS];
      break;
    case inbound_constants.ADD_TAG:
      fields = [...inboundFields.TAG_ADD_FIELDS];
      break;
    case inbound_constants.SEND_VIDEO:
      fields = [...inboundFields.VIDEO_SEND_FIELDS];
      break;
    case inbound_constants.SEND_PDF:
      fields = [...inboundFields.PDF_SEND_FIELDS];
      break;
    case inbound_constants.SEND_IMAGE:
      fields = [...inboundFields.IMAGE_SEND_FIELDS];
      break;
  }

  return res.send(fields);
};

module.exports = {
  getInboundFields,
};
