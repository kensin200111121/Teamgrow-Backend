const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const EventSchema = new Schema(
  {
    source: String,
    system: String,
    type: String,
    message: String,
    description: String,
    person: Object,
    property: Object,
    propertySearch: Object,
    campaign: Object,
    pageTitle: String,
    pageUrl: String,
    pageDuration: String,
    pageReferrer: String,
    additional: Object,
    personId: Number,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Event = mongoose.model('event', EventSchema);

module.exports = Event;
