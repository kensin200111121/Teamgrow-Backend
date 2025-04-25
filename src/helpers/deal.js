const mongoose = require('mongoose');
const Deal = require('../models/deal');
const DealStage = require('../models/deal_stage');
const Activity = require('../models/activity');
const Note = require('../models/note');
const FollowUp = require('../models/follow_up');
const ActivityHelper = require('./activity');
const Email = require('../models/email');
const Text = require('../models/text');
const Appointment = require('../models/appointment');
const TimeLine = require('../models/time_line');
const AutomationLine = require('../models/automation_line');
const Contact = require('../models/contact');
const { triggerTimeline } = require('../services/time_line');
const {
  updateContacts: updateTimelineContactsMicroApi,
} = require('../services/time_line');

const remove = (user_id, deal_id) => {
  return new Promise(async (resolve, reject) => {
    const deal = await Deal.findOne({
      _id: deal_id,
      user: user_id,
    }).catch((err) => {
      console.log('deal find err', err.message);
    });

    if (!user_id) {
      reject({
        status: false,
        error: 'User found error.',
      });
    }

    if (!deal_id) {
      reject({
        status: false,
        error: 'Deal found error.',
      });
    }

    if (!deal) {
      reject({
        status: false,
        error: 'Permission invalid',
      });
    }

    await Deal.deleteOne({
      _id: deal_id,
      user: user_id,
    });

    if (deal.deal_stage) {
      await DealStage.updateOne(
        {
          _id: deal.deal_stage,
        },
        {
          $pull: {
            deals: { $in: [mongoose.Types.ObjectId(deal_id)] },
          },
        }
      );
    }

    Activity.deleteMany({ user: user_id, deals: deal_id }).catch((err) =>
      console.log('Activity delete error', err.message)
    );

    // remove notes
    const notes = await Note.find({ user: user_id, deal: deal_id });

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      Note.deleteOne({
        _id: note.id,
      }).catch((err) => {
        console.log('deal note delete err', err.message);
      });

      const contact_notes = await Note.find({
        user: user_id,
        shared_note: note.id,
      }).catch((err) => {
        console.log('deal related note find err', err.message);
      });

      const contact_note_ids = [];
      contact_notes.forEach((contact_note) => {
        contact_note_ids.push(contact_note.id);
      });

      Activity.deleteMany({
        user: user_id,
        notes: { $in: contact_note_ids },
        type: 'notes',
      }).catch((err) => {
        console.log('activity remove err', err.message);
      });

      Note.deleteMany({
        shared_note: note.id,
        user: user_id,
      }).catch((err) => {
        console.log('deal note delete err', err.message);
      });

      Activity.deleteOne({
        notes: note.id,
        user: user_id,
        type: 'notes',
      }).catch((err) => {
        console.log('deal not activity remove err', err.message);
      });
    }

    // followup remove
    const followups = FollowUp.find({ user: user_id, deal: deal_id });

    for (let i = 0; i < followups.length; i++) {
      const followup = followups[i];

      FollowUp.deleteOne({
        _id: followup.id,
      }).catch((err) => {
        console.log('remove followup err', err.message);
      });

      Activity.deleteOne({
        user: followup.user,
        follow_ups: followup.id,
        type: 'follow_ups',
      }).catch((err) => {
        console.log('followup find err', err.message);
      });

      const follow_ups = await FollowUp.find({
        shared_follow_up: followup.id,
        user: user_id,
      }).catch((err) => {
        console.log('followup find err', err.message);
      });

      const contact_followup_ids = [];
      follow_ups.forEach((contact_note) => {
        contact_followup_ids.push(contact_note.id);
      });

      Activity.deleteMany({
        user: user_id,
        follow_ups: { $in: contact_followup_ids },
        type: 'follow_ups',
      }).catch((err) => {
        console.log('activity remove err', err.message);
      });

      FollowUp.deleteMany({
        shared_follow_up: followup.id,
        user: user_id,
      }).catch((err) => {
        console.log('remove followup err', err.message);
      });
    }

    // email remove
    const emails = await Email.find({ user: user_id, deal: deal_id });

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];

      Email.deleteOne({
        _id: email.id,
      }).catch((err) => {
        console.log('remove email err', err.message);
      });

      Activity.deleteOne({
        user: email.user,
        emails: email.id,
        type: 'emails',
      }).catch((err) => {
        console.log('email find err', err.message);
      });
    }

    // text remove
    const texts = await Text.find({ user: user_id, deal: deal_id });

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];

      Text.deleteOne({
        _id: text.id,
      }).catch((err) => {
        console.log('remove Text err', err.message);
      });

      Activity.deleteOne({
        user: text.user,
        texts: text.id,
        type: 'texts',
      }).catch((err) => {
        console.log('Text find err', err.message);
      });
    }

    Appointment.deleteMany({ user: user_id, deal: deal_id }).catch((err) => {
      console.log('Appointment find err', err.message);
    });
    TimeLine.deleteMany({ user: user_id, deal: deal_id }).catch((err) => {
      console.log('TimeLine find err', err.message);
    });
    AutomationLine.deleteMany({
      deal: deal_id,
    }).catch((err) => {
      console.log('AutomationLine find err', err.message);
    });
    await ActivityHelper.updateLastActivity(deal.contacts);

    resolve({
      status: true,
    });
  });
};

const removeContacts = (
  currentUser,
  deal_id,
  contacts,
  deal_stages,
  deleteAllDealData = true
) => {
  return new Promise(async (resolve, reject) => {
    await Activity.deleteMany({
      contacts: { $in: contacts },
      deals: deal_id,
      type: 'deals',
    });

    const activity_content = 'removed deal';
    for (let i = 0; i < contacts.length; i++) {
      const activity = new Activity({
        content: activity_content,
        contacts: contacts[i],
        user: currentUser.id,
        type: 'deals',
        deals: deal_id,
        deal_stages,
      });

      activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });
    }

    // delete Note
    const notesToUpdate = await Note.find(
      {
        deal: deal_id,
        assigned_contacts: { $in: contacts },
      },
      { _id: 1 }
    );

    const notesIdsToUpdate = [];
    if (notesToUpdate.length > 0) {
      for (let i = 0; i < notesToUpdate.length; i++) {
        notesIdsToUpdate.push(notesToUpdate[i]._id);
      }
      await Note.updateMany(
        {
          deal: deal_id,
          assigned_contacts: { $in: contacts },
        },
        { $pull: { assigned_contacts: { $in: contacts } } }
      ).catch((err) => {
        console.log('updating note err: ', err);
      });

      if (deleteAllDealData) {
        const contactNotes = await Note.find({
          contact: { $in: contacts },
          shared_note: { $in: notesIdsToUpdate },
        });
        const contactNoteIds = [];
        for (let i = 0; i < contactNotes.length; i++) {
          contactNoteIds.push(contactNotes[i]._id);
        }
        await Activity.deleteMany({
          contacts: { $in: contacts },
          notes: { $in: contactNoteIds },
        }).catch((err) => {
          console.log('activity remove err', err.message);
        });

        await Note.deleteMany({
          contact: { $in: contacts },
          shared_note: { $in: notesIdsToUpdate },
        }).catch((err) => {
          console.log('deleteMany note err: ', err);
        });
      }
    }

    // delete followup
    const followupsToUpdate = await FollowUp.find(
      {
        deal: deal_id,
        assigned_contacts: { $in: contacts },
      },
      { _id: 1 }
    );

    const followupIdsToUpdate = [];
    if (followupsToUpdate.length > 0) {
      for (let i = 0; i < followupsToUpdate.length; i++) {
        followupIdsToUpdate.push(followupsToUpdate[i]._id);
      }
      await FollowUp.updateMany(
        {
          deal: deal_id,
          assigned_contacts: { $in: contacts },
        },
        { $pull: { assigned_contacts: { $in: contacts } } }
      ).catch((err) => {
        console.log('updating followUp err: ', err);
      });

      if (deleteAllDealData) {
        const contactFollowUps = await FollowUp.find({
          contact: { $in: contacts },
          shared_follow_up: { $in: notesIdsToUpdate },
        });
        const contactFollowUpIds = [];
        for (let i = 0; i < contactFollowUps.length; i++) {
          contactFollowUpIds.push(contactFollowUps[i]._id);
        }
        await Activity.deleteMany({
          contacts: { $in: contacts },
          follow_ups: { $in: contactFollowUpIds },
        }).catch((err) => {
          console.log('activity remove err', err.message);
        });
        await FollowUp.deleteMany({
          contact: { $in: contacts },
          shared_follow_up: { $in: followupIdsToUpdate },
        }).catch((err) => {
          console.log('deleteMany followUp err: ', err);
        });
      }
    }

    // delete email
    const emailsToUpdate = await Email.find(
      {
        deal: deal_id,
        assigned_contacts: { $in: contacts },
      },
      { _id: 1 }
    );

    const emailIdsToUpdate = [];
    if (emailsToUpdate.length > 0) {
      for (let i = 0; i < emailsToUpdate.length; i++) {
        emailIdsToUpdate.push(emailsToUpdate[i]._id);
      }
      await Email.updateMany(
        {
          deal: deal_id,
          assigned_contacts: { $in: contacts },
        },
        { $pull: { assigned_contacts: { $in: contacts } } }
      ).catch((err) => {
        console.log('updating email err: ', err);
      });
    }

    // delete text
    const textsToUpdate = await Text.find(
      {
        deal: deal_id,
        assigned_contacts: { $in: contacts },
      },
      { _id: 1 }
    );

    const textIdsToUpdate = [];
    if (textsToUpdate.length > 0) {
      for (let i = 0; i < textsToUpdate.length; i++) {
        textIdsToUpdate.push(textsToUpdate[i]._id);
      }

      await Text.updateMany(
        {
          deal: deal_id,
          assigned_contacts: { $in: contacts },
        },
        { $pull: { assigned_contacts: { $in: contacts } } }
      ).catch((err) => {
        console.log('updating Text err: ', err);
      });
    }

    // delete apponintment

    const appointmentsToUpdate = await Appointment.find(
      {
        deal: deal_id,
        contacts: { $in: contacts },
      },
      { _id: 1 }
    );

    const appointmentIdsToUpdate = [];
    if (appointmentsToUpdate.length > 0) {
      const contactDetails = await Contact.find(
        {
          _id: { $in: contacts },
        },
        { email: 1 }
      );

      const contactEmails = [];
      for (let i = 0; i < contactDetails.length; i++) {
        contactEmails.push(contactDetails[i].email);
      }

      for (let i = 0; i < appointmentsToUpdate.length; i++) {
        appointmentIdsToUpdate.push(appointmentsToUpdate[i]._id);
      }

      if (deleteAllDealData) {
        await Activity.deleteMany({
          contacts: { $in: contacts },
          appointments: { $in: appointmentIdsToUpdate },
        }).catch((err) => {
          console.log('activity remove err', err.message);
        });

        await Appointment.updateMany(
          {
            deal: deal_id,
            contacts: { $in: contacts },
          },
          {
            $pull: {
              guests: { $in: contactEmails },
              contacts: { $in: contacts },
            },
          }
        ).catch((err) => {
          console.log('updating Text err: ', err);
        });
      }
    }
    await updateTimelineContactsMicroApi({
      deal_id,
      userId: currentUser.id,
      contacts,
      action: 'remove',
    });

    resolve({
      status: true,
    });
  });
};

const removeOnlyDeal = (currentUser, id) => {
  return new Promise(async (resolve, reject) => {
    if (!currentUser) {
      reject({
        status: false,
        error: 'User found error.',
      });
    }

    if (!id) {
      reject({
        status: false,
        error: 'Deal found error.',
      });
    }

    const deal = await Deal.findOne({
      _id: id,
      user: currentUser.id,
    }).catch((err) => {
      console.log('deal find err', err.message);
    });

    if (!deal) {
      reject({
        status: false,
        error: 'Permission invalid',
      });
    }

    Deal.deleteOne({
      _id: id,
      user: currentUser.id,
    }).catch((err) => {
      console.log('remove deal', err.message);
    });

    DealStage.updateOne(
      {
        _id: deal.deal_stage,
      },
      {
        $pull: {
          deals: { $in: [mongoose.Types.ObjectId(id)] },
        },
      }
    ).catch((err) => {
      console.log('remove deal', err.message);
    });

    await Activity.deleteMany({ user: currentUser.id, deals: id });

    // remove notes
    const notes = await Note.find({ user: currentUser.id, deal: id });

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      Note.deleteOne({
        _id: note.id,
      }).catch((err) => {
        console.log('deal note delete err', err.message);
      });

      Activity.deleteOne({
        user: note.user,
        notes: note.id,
        type: 'notes',
      }).catch((err) => {
        console.log('deal note activity remove err', err.message);
      });
    }

    // followup remove
    const followups = await FollowUp.find({ user: currentUser.id, deal: id });

    for (let i = 0; i < followups.length; i++) {
      const followup = followups[i];

      FollowUp.deleteOne({
        _id: followup.id,
      }).catch((err) => {
        console.log('remove followup err', err.message);
      });

      Activity.deleteOne({
        user: followup.user,
        follow_ups: followup.id,
        type: 'follow_ups',
      }).catch((err) => {
        console.log('followup find err', err.message);
      });
    }

    // email remove
    const emails = await Email.find({ user: currentUser.id, deal: id });

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];

      Email.deleteOne({
        _id: email.id,
      }).catch((err) => {
        console.log('remove email err', err.message);
      });

      // Activity.deleteOne({
      //   emails: email.id,
      //   type: 'emails',
      // }).catch((err) => {
      //   console.log('email find err', err.message);
      // });
    }

    // text remove
    const texts = await Text.find({ user: currentUser.id, deal: id });

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];

      Text.deleteOne({
        _id: text.id,
      }).catch((err) => {
        console.log('remove Text err', err.message);
      });

      // Activity.deleteOne({
      //   texts: text.id,
      //   type: 'texts',
      // }).catch((err) => {
      //   console.log('Text find err', err.message);
      // });
    }

    TimeLine.deleteMany({ deal: id }).catch((err) => {
      console.log('TimeLine find err', err.message);
    });
    AutomationLine.deleteMany({
      deal: id,
    }).catch((err) => {
      console.log('AutomationLine find err', err.message);
    });
    await ActivityHelper.updateLastActivity(deal.contacts);

    resolve({
      status: true,
    });
  });
};

const checkCompleteDealFollowup = async (user_id, followup_id) => {
  const count = await FollowUp.countDocuments({
    shared_follow_up: followup_id,
    status: { $in: [0, 2] },
  });

  if (count === 0) {
    // all followup of Deal is completed
    FollowUp.updateOne({ _id: followup_id }, { $set: { status: 1 } }).catch(
      (error) => {
        console.log('failed updateOne deal_followup` status:', error);
      }
    );
    const deal_followup = await FollowUp.findOne({
      _id: followup_id,
    }).catch((error) => console.log('can`t find the deal`s followup:', error));

    if (deal_followup) {
      const activity = new Activity({
        content: 'completed task',
        type: 'follow_ups',
        follow_ups: followup_id,
        deals: deal_followup.deal,
        user: user_id,
      });

      activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });
    }

    triggerTimeline({
      userId: user_id,
      type: 'task',
      created_followup: deal_followup._id,
    });
  }
};
module.exports = {
  remove,
  removeOnlyDeal,
  removeContacts,
  checkCompleteDealFollowup,
};
