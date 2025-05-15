const mongoose = require('mongoose');
const _ = require('lodash');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');

const Contact = require('../models/contact');
const Activity = require('../models/activity');
const TimeLine = require('../models/time_line');
const Garbage = require('../models/garbage');
const FollowUp = require('../models/follow_up');
const Email = require('../models/email');
const Text = require('../models/text');
const PhoneLog = require('../models/phone_log');
const Automation = require('../models/automation');
const AutomationLine = require('../models/automation_line');

const Appointment = require('../models/appointment');
const VideoTracker = require('../models/video_tracker');
const PdfTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const EmailTracker = require('../models/email_tracker');
const Task = require('../models/task');
const CampaignJob = require('../models/campaign_job');
const Note = require('../models/note');
const Deal = require('../models/deal');
const Notification = require('../models/notification');
const Team = require('../models/team');
const Event = require('../models/event');
const CustomField = require('../models/custom_field');

const User = require('../models/user');
const Draft = require('../models/draft');
const Reminder = require('../models/reminder');
const Campaign = require('../models/campaign');
const DealHelper = require('./deal');
const ActivityHelper = require('./activity');

const { phone } = require('phone');
const SphereRelationship = require('../models/sphere_relationship');
const DealStage = require('../models/deal_stage');
const moment = require('moment-timezone');
const { sendErrorToSentry } = require('./utility');
const FormTracker = require('../models/form_tracker');

const Models = {
  activity: Activity, // contacts
  email: Email, // contacts
  text: Text, // contacts
  note: Note, // contact
  follow_up: FollowUp, // contact
  phone_log: PhoneLog, // contact
  automation: AutomationLine,
  deal: Deal, // contacts
  appointment: Appointment, // contacts
  video_tracker: VideoTracker, // contact
  pdf_tracker: PdfTracker, // contact
  image_tracker: ImageTracker, // contact
  email_tracker: EmailTracker,
  form_tracker: FormTracker,
  event: Event, // contactId
  automation_line: AutomationLine, // contact
  user: User,
  team: Team,
  assigner: User,
  video: Video,
  pdf: PDF,
  image: Image,
  deal_stage: DealStage,
  task: Task,
};
const TrackerModels = {
  video: VideoTracker,
  pdf: PdfTracker,
  image: ImageTracker,
  email: EmailTracker,
};

/**
 * Get the group activity list
 * @param {*} (userId:string, contactId:string, isLast?:boolean)
 * @returns
 */
const getLoadGroupActivity = async (
  userId,
  contactId,
  from,
  limit = 80,
  type = null
) => {
  const additionalQuery = from
    ? { _id: { $lt: mongoose.Types.ObjectId(from) } }
    : {};
  if (type) {
    additionalQuery[type + 's'] = { $exists: true };
  }

  const groupQuery = {
    email: '$emails',
    text: '$texts',
    follow_up: '$follow_ups',
    phone_log: '$phone_logs',
    note: '$notes',
    deal: '$deals',
    automation: '$automation_lines',
    appointment: '$appointments',
    event: '$events',
    user: '$users',
    team: '$team',
    single_id: '$single_id',
    assigner: '$assigner',
  };

  const allActivities = await Activity.aggregate([
    {
      $match: {
        contacts: mongoose.Types.ObjectId(contactId),
        ...additionalQuery,
      },
    },
    { $sort: { _id: -1 } },
    { $limit: limit },
    {
      $group: {
        _id: groupQuery,
        activity: { $first: '$$ROOT' },
        time: { $first: '$created_at' },
        videos: { $push: '$videos' },
        pdfs: { $push: '$pdfs' },
        images: { $push: '$images' },
        last: { $last: '$_id' },
      },
    },
  ]).catch((_) => {});

  const lastActivityId = allActivities.reduce((min, item) => {
    return !min || item.activity._id < min ? item.activity._id : min;
  }, null);

  allActivities.forEach((e, index, array) => {
    if (e._id.assigner && Object.keys(e._id).length > 1) {
      if (!e._id.single_id) {
        delete e._id.assigner;
      }
    }

    if (e._id.user && e._id.user.toString() === userId.toString()) {
      array[index]._id.user = e.activity.user;
    }
  });
  const activities = _.groupBy(
    allActivities,
    (e) => Object.keys(e._id).join('') + '_' + Object.values(e._id).join('')
  );

  const groupActivities = Object.values(activities)
    .map((e) => e[0])
    .sort((e1, e2) => {
      return e1.time > e2.time ? -1 : 1;
    });

  const trackerIds = {
    email_trackers: [],
    pdf_trackers: [],
    image_trackers: [],
    video_trackers: [],
    text_trackers: [],
    form_trackers: [],
  };
  const materialIds = {
    videos: [],
    pdfs: [],
    images: [],
  };
  const groupIds = [];
  groupActivities.forEach((e) => {
    if (e.activity.type.includes('_trackers')) {
      trackerIds[e.activity.type].push(e.activity[e.activity.type]);
    }
    const videoIds = _.flattenDeep(e.videos);
    const pdfIds = _.flattenDeep(e.pdfs);
    const imageIds = _.flattenDeep(e.images);
    materialIds.videos = [...materialIds.videos, ...videoIds];
    materialIds.pdfs = [...materialIds.pdfs, ...pdfIds];
    materialIds.images = [...materialIds.images, ...imageIds];
    if (Object.keys(e._id).length) {
      groupIds.push(e._id);
    }
    e.videos = Array.from(new Set(videoIds.map((e) => e + '')));
    e.pdfs = Array.from(new Set(pdfIds.map((e) => e + '')));
    e.images = Array.from(new Set(imageIds.map((e) => e + '')));
  });
  var detailIds = _.groupBy(groupIds, (e) => Object.keys(e)[0]);
  const promises = [];
  const detailDataRequests = {};
  for (const key in trackerIds) {
    const ids = trackerIds[key];
    detailDataRequests[key.slice(0, -1)] = ids;
  }
  for (const key in materialIds) {
    const ids = materialIds[key];
    detailDataRequests[key.slice(0, -1)] = ids;
  }
  for (const key in detailIds) {
    const ids = detailIds[key].map((e) => e[key]);
    detailDataRequests[key] = ids;
  }
  (detailIds['single_id'] || []).map((e) => {
    const data = { ...e };
    delete data['single_id'];
    const key = Object.keys(data)[0];
    if (key && data[key]) {
      if (detailDataRequests[key]?.length) {
        detailDataRequests[key].push(data[key]);
      } else {
        detailDataRequests[key] = [data[key]];
      }
    }
  });

  for (const key in detailDataRequests) {
    const ids = detailDataRequests[key];
    promises.push(getContactLastDetailDatas(key, ids));
  }

  let details = await Promise.all(promises);
  details = details.reduce((result, item) => {
    return {
      ...result,
      ...item,
    };
  }, {});

  // Get the activity creator & action detail creator.
  // And insert them to the details['users']
  let activityUserIds = groupActivities
    .map((e) => e?.activity?.user)
    .filter((e) => !!e);
  for (const key in details) {
    if (details[key]) {
      for (const id in details[key]) {
        const detail = details[key][id];
        if (detail?.user) {
          const user = Array.isArray(detail.user)
            ? detail.user[0]
            : detail.user;
          user && activityUserIds.push(user);
        }
      }
    }
  }
  activityUserIds = new Array(...new Set(activityUserIds.map((e) => e + '')));
  if (activityUserIds.length) {
    await getContactLastDetailDatas('user', activityUserIds).then((data) => {
      details['user'] = { ...(details['user'] || {}), ...(data.user || {}) };
    });
  }

  return {
    data: groupActivities,
    details,
    lastActivityId,
  };
};

/**
 * Get contact details by ids
 * @param {*} type
 * @param {*} ids
 * @returns: Promise ({[type]: { [id]: detail }})
 */

const getContactLastDetailDatas = (type, ids) => {
  return new Promise((res) => {
    const Model = Models[type];
    if (!Model) {
      res();
    }
    let projectField = {};
    if (type === 'user' || type === 'assigner') {
      projectField = {
        picture_profile: 1,
        user_name: 1,
        email: 1,
        cell_phone: 1,
      };
    } else if (type === 'team') {
      projectField = {
        name: 1,
        picture: 1,
      };
    }
    if (type === 'form_tracker') {
      Model.find({ _id: { $in: ids } }, projectField)
        .populate({
          path: 'lead_form',
          select: 'name', // Specify the fields you want to populate
        })
        .lean()
        .then((data) => {
          const result = data.reduce(
            (data, e) => ({ ...data, [e._id]: e }),
            {}
          );
          res({ [type]: result });
        })
        .catch((_) => {
          res();
        });
    } else {
      Model.find({ _id: { $in: ids } }, projectField)
        .lean()
        .then((data) => {
          const result = data.reduce(
            (data, e) => ({ ...data, [e._id]: e }),
            {}
          );
          res({ [type]: result });
        })
        .catch((_) => {
          res();
        });
    }
  });
};

const getActivityDetails = async (contactId, type, id) => {
  let typeKey = type + 's';
  switch (type) {
    case 'single_id':
      typeKey = type;
      break;
    case 'automation':
      typeKey = 'automation_lines';
      break;
    default:
      break;
  }

  const activities = await Activity.find(
    {
      contacts: contactId,
      [typeKey]: id,
    },
    {},
    { sort: { created_at: -1 } }
  )
    .populate([
      {
        path: 'landing_pages',
        select: {
          _id: 1,
          name: 1,
        },
      },
    ])
    .catch(() => {});

  const trackerIds = {
    email_trackers: [],
    pdf_trackers: [],
    form_trackers: [],
    image_trackers: [],
    video_trackers: [],
    text_trackers: [],
  };
  const materialIds = {
    videos: [],
    pdfs: [],
    images: [],
  };
  const dealStageIds = [];
  activities.forEach((e) => {
    if (e.type.includes('_trackers')) {
      trackerIds[e.type].push(e[e.type]);
    }
    if (e.deal_stages) {
      dealStageIds.push(e.deal_stages);
    }
    const videoIds = _.flattenDeep(e.videos);
    const pdfIds = _.flattenDeep(e.pdfs);
    const imageIds = _.flattenDeep(e.images);
    materialIds.videos = [...materialIds.videos, ...videoIds];
    materialIds.pdfs = [...materialIds.pdfs, ...pdfIds];
    materialIds.images = [...materialIds.images, ...imageIds];
  });
  const promises = [];
  for (const key in trackerIds) {
    const ids = trackerIds[key];
    promises.push(getContactLastDetailDatas(key.slice(0, -1), ids));
  }
  for (const key in materialIds) {
    const ids = materialIds[key];
    promises.push(getContactLastDetailDatas(key.slice(0, -1), ids));
  }
  promises.push(getContactLastDetailDatas(type, [id]));
  promises.push(getContactLastDetailDatas('deal_stage', dealStageIds));
  const details = await Promise.all(promises);
  return {
    activities,
    details,
  };
};

/**
 * Get contact details with type and limit, after (FE: load the individual main data tab in contact detail page)
 * @param {*} user: userId
 * @param {*} contactId
 * @param {*} type
 * @param {*} limit
 * @param {*} skip
 * @param {*} after
 * @param {*} sortQuery
 * @returns:  Promise ({[type]: { [id]: detail }})
 */

const getContactDetailData = (
  user,
  contactId,
  type,
  limit,
  after,
  skip,
  sortQuery,
  parentFollowUps = [],
  status = -1
) => {
  return new Promise(async (res) => {
    const Model = type === 'automation' ? Models.automation_line : Models[type];
    if (!Model) {
      res();
    }
    let contactQuery = {};
    let filterFollowUpQuery = { due_date: { $exists: true } };
    let sortFollowUpQuery = { sort: { created_at: -1 } };
    let recurringFollowUpIds = [];
    switch (type) {
      case 'activity':
      case 'email':
      case 'text':
      case 'appointment':
        contactQuery = { contacts: contactId };
        break;
      case 'deal':
        {
          const deal_stages = await DealStage.find({
            user: user._id,
          });
          const _dealIds = deal_stages.flatMap((deal) => deal.deals);
          contactQuery = { contacts: contactId, _id: { $in: _dealIds } };
        }
        break;
      case 'note':
      case 'follow_up':
      case 'phone_log':
      case 'video_tracker':
      case 'pdf_tracker':
      case 'image_tracker':
      case 'automation':
        contactQuery = { contact: mongoose.Types.ObjectId(contactId) };
        break;
      case 'event':
        contactQuery = { contactId };
        break;
      default:
        contactQuery = { contacts: contactId };
        break;
    }

    if (type === 'follow_up' && sortQuery && sortQuery?.timezone) {
      if (sortQuery?.startDate && !sortQuery?.endDate) {
        const startDate = moment(sortQuery.startDate).tz(sortQuery.timezone);
        filterFollowUpQuery = {
          ...filterFollowUpQuery,
          due_date: { $gt: new Date(startDate) },
        };
      } else if (!sortQuery?.startDate && sortQuery?.endDate) {
        const endDate = moment(sortQuery?.endDate).tz(sortQuery.timezone);
        filterFollowUpQuery = {
          ...filterFollowUpQuery,
          due_date: { $lt: new Date(endDate) },
        };
      } else if (sortQuery?.startDate && sortQuery?.endDate) {
        const startDate = moment(sortQuery.startDate).tz(sortQuery.timezone);
        const endDate = moment(sortQuery?.endDate).tz(sortQuery.timezone);

        filterFollowUpQuery = {
          ...filterFollowUpQuery,
          due_date: { $gte: new Date(startDate), $lt: new Date(endDate) },
        };
      }

      if (!sortQuery?.endDate) {
        const recurring_first_follow_ups = await FollowUp.aggregate([
          {
            $match: {
              ...contactQuery,
              ...filterFollowUpQuery,
              set_recurrence: true,
              status: 0,
              parent_follow_up: { $exists: true },
            },
          },
          {
            $sort: { due_date: 1 },
          },
          {
            $group: {
              _id: '$parent_follow_up',
              follow_up: { $first: '$_id' },
            },
          },
        ]);
        recurringFollowUpIds = (recurring_first_follow_ups || []).map(
          (e) => e.follow_up
        );
      }

      if (sortQuery.sort) {
        sortFollowUpQuery = {
          ...sortFollowUpQuery,
          sort: { due_date: sortQuery.sort },
        };
      }
    }

    let query = { ...contactQuery };
    if (type === 'follow_up') {
      query = { ...query, ...filterFollowUpQuery };
    }
    if (after) {
      query = { ...query, _id: { $lte: after } };
    }

    let data;
    if (type === 'follow_up') {
      data = await FollowUp.aggregate([
        {
          $match: {
            $or: [
              // to get all(recurring & non-recurring) followups those are already overdue
              {
                status: { $in: status === -1 ? [1, 2] : [2] },
                ...query,
              },
              // to get non-recurring followups those are still valid
              {
                status: 0,
                ...query,
                parent_follow_up: { $exists: false },
              },
              // to get only 1st recurring followups those are still valid
              {
                _id: { $in: recurringFollowUpIds },
              },
            ],
          },
        },
        { $sort: { status: 1, due_date: 1 } },
        { $skip: skip },
        { $limit: limit },
      ]).catch((_) => {
        res();
      });
    } else {
      if (type === 'deal')
        data = await Model.find(query, {}, sortFollowUpQuery)
          .skip(skip)
          .limit(limit)
          .lean()
          .populate('contacts')
          .populate('deal_stage')
          .populate('primary_contact')
          .catch((_) => {
            res();
          });
      else if (type === 'appointment')
        data = await Model.find(query, {}, sortFollowUpQuery)
          .skip(skip)
          .limit(limit)
          .lean()
          .populate('contacts')
          .catch((_) => {
            res();
          });
      else
        data = await Model.find(query, {}, sortFollowUpQuery)
          .skip(skip)
          .limit(limit)
          .lean()
          .populate({
            path: 'user',
            select: {
              _id: 1,
              user_name: 1,
              picture_profile: 1,
              email: 1,
              cell_phone: 1,
            },
          })
          .catch((_) => {
            res();
          });
    }

    const dataIds = data.map((e) => e._id);
    if (type === 'email' || type === 'text') {
      let activities = await Activity.aggregate([
        {
          $match: {
            contacts: mongoose.Types.ObjectId(contactId),
            [type + 's']: { $in: dataIds },
          },
        },
        { $sort: { _id: -1 } },
        {
          $group: {
            _id: {
              [type]: '$' + type + 's',
            },
            activity: { $first: '$$ROOT' },
            time: { $first: '$updated_at' },
            videos: { $push: '$videos' },
            pdfs: { $push: '$pdfs' },
            images: { $push: '$images' },
            last: { $last: '$_id' },
            status: { $last: '$status' },
          },
        },
      ]).catch((_) => {});
      const trackerIds = {
        email_trackers: [],
        pdf_trackers: [],
        image_trackers: [],
        video_trackers: [],
        text_trackers: [],
      };
      const materialIds = {
        videos: [],
        pdfs: [],
        images: [],
      };
      activities.forEach((e) => {
        if (e.activity.type.includes('_trackers')) {
          trackerIds[e.activity.type].push(e.activity[e.activity.type]);
        }
        const videoIds = _.flattenDeep(e.videos);
        const pdfIds = _.flattenDeep(e.pdfs);
        const imageIds = _.flattenDeep(e.images);
        materialIds.videos = [...materialIds.videos, ...videoIds];
        materialIds.pdfs = [...materialIds.pdfs, ...pdfIds];
        materialIds.images = [...materialIds.images, ...imageIds];
        e.videos = Array.from(new Set(videoIds.map((e) => e + '')));
        e.pdfs = Array.from(new Set(pdfIds.map((e) => e + '')));
        e.images = Array.from(new Set(imageIds.map((e) => e + '')));
      });
      const promises = [];
      for (const key in trackerIds) {
        const ids = trackerIds[key];
        promises.push(getContactLastDetailDatas(key.slice(0, -1), ids));
      }
      for (const key in materialIds) {
        const ids = materialIds[key];
        promises.push(getContactLastDetailDatas(key.slice(0, -1), ids));
      }
      let details = await Promise.all(promises);
      details = details.reduce((result, item) => {
        return {
          ...result,
          ...item,
        };
      }, {});
      activities = activities.reduce((result, item) => {
        return {
          ...result,
          [item._id[type]]: item,
        };
      }, {});
      res({ data, activities, details });
    } else {
      res({ data });
    }
  });
};

/**
 * Get total count contact action
 * @param {*} user: userId
 * @param {*} contactId
 * @param {*} type
 * @returns:  count
 */

const getTotalCountContactAction = (user, contactId, type, status) => {
  return new Promise(async (res) => {
    const Model = type === 'automation' ? Models.automation_line : Models[type];
    if (!Model) {
      res();
    }
    let contactQuery = {};
    switch (type) {
      case 'activity':
      case 'email':
      case 'text':
      case 'appointment':
        contactQuery = { contacts: contactId };
        break;
      case 'deal':
        {
          const deal_stages = await DealStage.find({
            user: user._id,
          });
          const _dealIds = deal_stages.flatMap((deal) => deal.deals);
          contactQuery = { contacts: contactId, _id: { $in: _dealIds } };
        }
        break;
      case 'note':
      case 'follow_up':
      case 'phone_log':
      case 'video_tracker':
      case 'pdf_tracker':
      case 'image_tracker':
        contactQuery = {
          contact: mongoose.Types.ObjectId(contactId),
        };
        break;
      case 'automation':
        contactQuery = {
          contact: mongoose.Types.ObjectId(contactId),
          type: { $ne: 'deal' },
          status: 'running',
        };
        break;
      case 'event':
        contactQuery = { contactId };
        break;
      default:
        contactQuery = { contacts: contactId };
        break;
    }

    const query = { ...contactQuery };

    if (type === 'follow_up') {
      const overdueTaskCount = await Model.countDocuments({
        ...query,
        status: { $in: status === -1 ? [1, 2] : [2] },
      }).catch(() => {});
      // recurrence will be only one record
      const data = await Model.aggregate([
        {
          $match: {
            ...query,
            status: 0,
            due_date: { $exists: true },
          },
        },
        {
          $group: {
            _id: {
              $cond: {
                if: '$parent_follow_up',
                then: '$parent_follow_up',
                else: '$_id',
              },
            },
          },
        },
        {
          $count: 'totalAccounts',
        },
      ]).catch((_) => {
        res(0);
      });
      res(
        (overdueTaskCount ?? 0) +
          (data?.length > 0 ? data[0]?.totalAccounts ?? 0 : 0)
      );
    } else if (type === 'automation') {
      let dealCount = 0;
      const _deals = await Deal.find({
        contacts: contactId,
      });
      if (_deals && _deals.length > 0) {
        for (const _deal of _deals) {
          const _deal_automation_lines = await AutomationLine.find({
            deal: _deal._id,
            type: 'deal',
            status: 'running',
            automation: { $ne: null },
          }).select({ _id: 1, title: 1, action_count: 1, status: 1, type: 1 });
          for (const _deal_automation_line of _deal_automation_lines) {
            const deal_timelines = await TimeLine.find({
              automation_line: _deal_automation_line?._id,
              type: 'deal',
              visible: true,
              assigned_contacts: contactId,
              $and: [
                { action: { $ne: null } },
                { 'action.type': { $ne: 'automation' } },
              ],
            });
            if (deal_timelines && deal_timelines.length > 0) {
              dealCount += 1;
            }
          }
        }
      }
      const automation_lines = await Model.find(query)
        .select({ _id: 1 })
        .catch((_) => {
          res(0);
        });
      const automation_line_ids = automation_lines.map((item) => item._id);
      const timelines = await TimeLine.aggregate([
        {
          $match: {
            automation_line: { $in: automation_line_ids },
            visible: true,
            $and: [
              { action: { $ne: null } },
              { 'action.type': { $ne: 'automation' } },
            ],
          },
        },
        { $group: { _id: '$automation_line' } },
      ]).catch((err) => {
        console.log('contact-action-count-err: ', err);
      });
      let count = timelines?.length || 0;
      count += dealCount;
      res(count ?? 0);
    } else {
      const count = await Model.countDocuments(query).catch((_) => {
        res(0);
      });
      res(count ?? 0);
    }
  });
};

/**
 * Check the field option
 * @param {*} contact: Contact document
 * @param {*} option: {and: true|false, fields: [{name: string, exist: boolean}]}
 */
const checkFieldOption = (contact, option) => {
  let field_checks = option.and;
  (option.fields || []).some((field) => {
    let field_check = false;
    if (field.exist) {
      if (contact[field.name]) {
        field_check = true;
      }
    } else {
      if (!contact[field.name]) {
        field_check = false;
      }
    }
    if (option.and && !field_check) {
      field_checks = field_checks && field_check;
      return true;
    }
    if (!option.and && field_check) {
      field_checks = field_checks || field_check;
      return true;
    }
  });
  return field_checks;
};

const calculateContactRate = (contact_id, user_id) => {
  return new Promise((resolve, reject) => {
    Garbage.findOne({ user: user_id })
      .then((_garbage) => {
        const garbage = _garbage || { user: [user_id] };
        Contact.findOne({ user: user_id, _id: contact_id })
          .then((_contact) => {
            if (!_contact) {
              resolve();
            }
            giveRate(garbage, _contact)
              .then((rate) => {
                resolve(rate);
              })
              .catch((err) => {
                resolve(err);
              });
          })
          .catch(() => {});
      })
      .catch(() => {});
  });
};

const giveRate = async (garbage, contact) => {
  // 1. Getting the rate algorithms
  // 2. Check the contact status with option & calculate rate
  // 3. Setting
  const userId = mongoose.Types.ObjectId(garbage.user[0]);
  const rate_options = garbage.rate_options || [
    {
      type: 'field',
      value: {
        and: true,
        fields: [{ name: 'email', exist: true }],
      },
    },
    {
      type: 'field',
      value: {
        and: true,
        fields: [{ name: 'cell_phone', exist: true }],
      },
    },
    {
      type: 'activity',
      value: {
        types: ['emails', 'texts'],
        range: 30,
      },
    },
    {
      type: 'automation',
      value: {
        type: 'current',
        range: 30,
      },
    },
  ];
  let rate = contact.favorite ? 1 : 0;
  for (let i = 0; i < rate_options.length; i++) {
    const rate_option = rate_options[i];
    const option = rate_option.value;
    if (rate_option.type === 'field') {
      if (checkFieldOption(contact, option)) {
        rate++;
      }
    }
    if (rate_option.type === 'activity') {
      // range and types
      const types = option.types;
      const range = option.range;
      const createdAt = new Date(Date.now() - range * 24 * 3600000);
      const count = await Activity.aggregate([
        {
          $match: {
            user: userId,
            created_at: { $gte: createdAt },
            type: { $in: types },
            contacts: contact._id,
          },
        },
        {
          $count: 'count',
        },
      ]).catch((err) => {
        console.log('error', err.message);
      });
      if (count[0] && count[0]['count']) {
        rate++;
      }
    }
    if (rate_option.type === 'automation') {
      // range and format
      const current = await TimeLine.countDocuments({
        user: userId,
        contact: contact._id,
      }).catch((err) => {});
      let range_check = false;
      if (contact.automation_off) {
        const diff = Math.ceil(
          (Date.now() - contact.automation_off.getTime()) / (24 * 3600 * 1000)
        );
        if (diff <= option.range) {
          range_check = true;
        }
      }
      if (option.type === 'current' && current) {
        rate++;
      } else if (option.type === 'current_recent') {
        if (current || range_check) {
          rate++;
        }
      }
    }
  }
  return new Promise((resolve, reject) => {
    Contact.updateOne({ _id: contact._id }, { $set: { rate } })
      .then(() => {
        resolve(rate);
      })
      .catch((err) => {
        reject(err);
      });
  });
};

const giveRateContacts = async (garbage, contactIds = []) => {
  const userId = mongoose.Types.ObjectId(garbage.user[0]);
  const query = { user: userId, rate_lock: { $ne: true } };
  const contacts = contactIds.map((e) => mongoose.Types.ObjectId(e + ''));
  if (contactIds && contactIds.length) {
    query['_id'] = { $in: contacts };
  }
  await Contact.updateMany(query, { $set: { temp_rate: 0 } }).catch(
    (err) => {}
  );
  await Contact.updateMany(
    {
      ...query,
      favorite: true,
    },
    { $inc: { temp_rate: 1 } }
  ).catch((err) => {});

  const rate_options = garbage.rate_options || [
    {
      type: 'field',
      value: {
        and: true,
        fields: [{ name: 'email', exist: true }],
      },
    },
    {
      type: 'field',
      value: {
        and: true,
        fields: [{ name: 'cell_phone', exist: true }],
      },
    },
    {
      type: 'activity',
      value: {
        types: ['emails', 'texts'],
        range: 30,
      },
    },
    {
      type: 'automation',
      value: {
        type: 'current',
        range: 30,
      },
    },
  ];
  for (let i = 0; i < rate_options.length; i++) {
    const rate_option = rate_options[i];
    const option = rate_option.value;
    if (rate_option.type === 'field') {
      const query = { user: userId };
      if (!option.and) {
        query['$or'] = [];
      }
      option.fields.forEach((field) => {
        let subQuery = { $exists: true, $nin: ['', null] };
        if (!field.exist) {
          subQuery = {
            $or: [
              { [field.name]: { $exists: false } },
              { [field.name]: { $in: ['', null] } },
            ],
          };
        }
        if (!option.and) {
          if (!field.exist) {
            query['$or'] = [...(query['$or'] || []), ...subQuery['$or']];
          } else {
            query['$or'].push({ [field.name]: subQuery });
          }
        } else {
          if (!field.exist) {
            query['$and'] = [...(query['$and'] || [])];
            query['$and'].push(subQuery);
          } else {
            query[field.name] = subQuery;
          }
        }
      });
      // Contact Update
      const additionalQuery = { user: userId, rate_lock: { $ne: true } };
      if (contacts && contacts.length) {
        additionalQuery['_id'] = { $in: contacts };
      }
      await Contact.updateMany(
        {
          ...additionalQuery,
          ...query,
        },
        { $inc: { temp_rate: 1 } }
      ).catch((err) => {
        console.log('field rating failed', err.message);
      });
    }
    if (rate_option.type === 'activity') {
      const types = option.types;
      const range = option.range;
      const createdAt = new Date(Date.now() - range * 24 * 3600000);
      const additionalQuery = {};
      if (contacts && contacts.length) {
        additionalQuery['contacts'] = { $in: contacts };
      }
      const activityContacts = await Activity.aggregate([
        {
          $match: {
            user: userId,
            created_at: { $gte: createdAt },
            type: { $in: types },
            ...additionalQuery,
          },
        },
        {
          $group: { _id: '$contacts' },
        },
        {
          $match: { _id: { $ne: null } },
        },
      ]).catch(() => {});
      const contactIds = (activityContacts || []).map((e) => e._id);
      await Contact.updateMany(
        {
          _id: { $in: contactIds },
          rate_lock: { $ne: true },
        },
        { $inc: { temp_rate: 1 } }
      ).catch((err) => {
        console.log('activity rating failed', err.message);
      });
    }
    if (rate_option.type === 'automation') {
      const range = option.range;
      const createdAt = new Date(Date.now() - range * 24 * 3600000);
      const additionalQuery = {};
      if (contacts && contacts.length) {
        additionalQuery['contact'] = { $in: contacts };
      }
      const onAutomationContacts = await TimeLine.aggregate([
        {
          $match: {
            user: userId,
            contact: { $exists: true },
            ...additionalQuery,
          },
        },
        { $group: { _id: '$contact' } },
      ]).catch((err) => {
        console.log(
          'current automation contacts getting failed(rating)',
          err.message
        );
      });
      let contactIds = onAutomationContacts.map((e) => e._id);
      if (option.type === 'current_recent') {
        // Rate check
        const limitQuery = {};
        if (contacts && contacts.length) {
          limitQuery['_id'] = { $in: contacts };
        }
        const recentOffAutomated = await Contact.find({
          user: userId,
          automation_off: { $gte: createdAt },
          ...limitQuery,
        }).catch((err) => {
          console.log(
            'recent off automation contacts getting failed(rating)',
            err.message
          );
        });
        contactIds = [...contactIds, ...recentOffAutomated];
      }
      await Contact.updateMany(
        {
          _id: { $in: contactIds },
          rate_lock: { $ne: true },
        },
        { $inc: { temp_rate: 1 } }
      ).catch((err) => {
        console.log('automation rating failed', err.message);
      });
    }
  }
  await Contact.updateMany(query, [
    {
      $set: { rate: { $subtract: ['$temp_rate', 0] } },
    },
  ]).catch((err) => {
    console.log('update rate is failed', err.message);
  });
};

/**
 * Return the contacts that have the specified field informations
 * @param {*} user: user object
 * @param {*} options: [{and: boolean, fields: [{name: string, exist: boolean}]}, {and: boolean, fields: [{field_name: string, exist: boolean}]}]
 */
const groupByFields = (user, options) => {
  const result = [...options];
  const promises = [];
  result.forEach(async (option) => {
    const query = { user: user._id };
    if (!option.and) {
      query['$or'] = [];
    }
    option.fields.forEach((field) => {
      let subQuery = { $exists: true, $nin: ['', null] };
      if (!field.exist) {
        subQuery = {
          $or: [
            { [field.name]: { $exists: false } },
            { [field.name]: { $in: ['', null] } },
          ],
        };
      }
      if (!option.and) {
        if (!field.exist) {
          query['$or'] = [...(query['$or'] || []), ...subQuery['$or']];
        } else {
          query['$or'].push({ [field.name]: subQuery });
        }
      } else {
        if (!field.exist) {
          query['$and'] = [...(query['$and'] || [])];
          query['$and'].push(subQuery);
        } else {
          query[field.name] = subQuery;
        }
      }
    });
    const promise = new Promise((resolve, reject) => {
      Contact.countDocuments(query)
        .then((count) => {
          option['count'] = count;
          resolve();
        })
        .catch((err) => {
          console.log('contact count checking is failed', err);
          reject();
        });
    });
    promises.push(promise);
  });
  return new Promise((resolve) => {
    Promise.all(promises).then(() => {
      resolve(result);
    });
  });
};

/**
 * Return the contact count that have specified type activities in range
 * @param {*} user
 * @param {*} types: [[], []]
 * @param {*} ranges
 */
const groupByActivities = (user, types) => {
  const result = [];
  const promises = [];
  types.forEach(({ activities, id, range }) => {
    const promise = new Promise((resolve, reject) => {
      const createdAt = new Date(Date.now() - range * 24 * 3600000);
      Activity.aggregate([
        {
          $match: {
            user: user._id,
            created_at: { $gte: createdAt },
            type: { $in: activities },
          },
        },
        {
          $group: { _id: { contact: '$contacts' } },
        },
        {
          $lookup: {
            from: 'contacts',
            localField: '_id.contact',
            foreignField: '_id',
            as: 'contacts',
          },
        },
        { $unwind: '$contacts' },
        {
          $replaceRoot: {
            newRoot: '$contacts',
          },
        },
        {
          $match: {
            user: user._id,
          },
        },
        {
          $count: 'count',
        },
      ])
        .then((data) => {
          result.push({
            result: data,
            types: activities,
            id,
            range,
          });
          resolve();
        })
        .catch((err) => {
          result.push({
            error: err.message,
            types: activities,
            id,
            range,
          });
          reject();
        });
    });

    promises.push(promise);
  });

  return new Promise((resolve, reject) => {
    Promise.all(promises)
      .then(() => {
        resolve(result);
      })
      .catch(() => {
        reject([]);
      });
  });
};

/**
 * Return the unique contact ids in deals
 * @param {*} user
 * @param {*} type
 */
const getUniqueContactsByDeal = async (contactIds, userId) => {
  let uniqueContactIds = [];
  if (contactIds.length) {
    uniqueContactIds = [...contactIds];
  }
  const onAutomationDeals = await TimeLine.aggregate([
    { $match: { user: userId, deal: { $exists: true } } },
    { $group: { _id: '$deal' } },
  ]).catch((err) => {});
  if (onAutomationDeals.length > 0) {
    const dealIds = onAutomationDeals.map((item) => item._id);
    const _deals = await Deal.find({ _id: { $in: dealIds } });
    let dealContactIds = [];
    for (const deal of _deals) {
      if (deal.contacts && deal.contacts.length) {
        const contactIds = deal.contacts
          .filter((item) => item !== null)
          .map((item) => item.toString());
        dealContactIds = [...dealContactIds, ...contactIds];
      }
    }
    for (const dealContactId of dealContactIds) {
      if (uniqueContactIds.indexOf(dealContactId) < 0) {
        uniqueContactIds.push(dealContactId);
      }
    }
  }
  return uniqueContactIds;
};

/**
 * Return the contacts with the task, appointment
 * @param {*} user
 * @param {*} type
 */
const groupByTasks = (user, type) => {};

const getConditionsByAnalytics = (options) => {
  const HealthOptions = [
    'missing_email',
    'missing_phone',
    'missing_email_phone',
  ];
  const ActivityOptions = ['recent_communicated', 'recent_video_tracked'];
  const AutomationOptions = [
    'on_automation',
    'never_automated',
    'recent_off_automation',
  ];
  const RateOptions = [
    'one_star',
    'two_star',
    'three_star',
    'four_star',
    'five_star',
    'zero_star',
  ];
  const OPTION_DETAILS = {
    missing_email: {
      and: true,
      fields: [
        {
          name: 'email',
          exist: false,
        },
        {
          name: 'cell_phone',
          exist: true,
        },
      ],
    },
    missing_phone: {
      and: true,
      fields: [
        {
          name: 'cell_phone',
          exist: false,
        },
        {
          name: 'email',
          exist: true,
        },
      ],
    },
    missing_email_phone: {
      and: true,
      fields: [
        {
          name: 'email',
          exist: false,
        },
        {
          name: 'cell_phone',
          exist: false,
        },
      ],
    },
    recent_communicated: { types: ['emails', 'texts'] },
    recent_video_tracked: { types: ['video_trackers'] },
    on_automation: { type: 'never_automated' },
    recent_off_automation: { type: 'never_automated' },
    never_automated: { type: 'never_automated' },
    one_star: { count: 1 },
    two_star: { count: 2 },
    three_star: { count: 3 },
    four_star: { count: 4 },
    five_star: { count: 5 },
    zero_star: { count: 0 },
  };
  const fieldOption = options.filter((e) => HealthOptions.includes(e.id))[0];
  const rateOption = options.filter((e) => RateOptions.includes(e.id))[0];
  const automationOption = options.filter((e) =>
    AutomationOptions.includes(e.id)
  )[0];
  const activityOption = options.filter((e) =>
    ActivityOptions.includes(e.id)
  )[0];

  const query = {};
  if (fieldOption) {
    const option = OPTION_DETAILS[fieldOption.id];
    if (!option.and) {
      query['$or'] = [];
    }
    option.fields.forEach((field) => {
      let subQuery = { $exists: true, $nin: ['', null] };
      if (!field.exist) {
        subQuery = {
          $or: [
            { [field.name]: { $exists: false } },
            { [field.name]: { $in: ['', null] } },
          ],
        };
      }
      if (!option.and) {
        if (!field.exist) {
          query['$or'] = [...(query['$or'] || []), ...subQuery['$or']];
        } else {
          query['$or'].push({ [field.name]: subQuery });
        }
      } else {
        if (!field.exist) {
          query['$and'] = [...(query['$and'] || [])];
          query['$and'].push(subQuery);
        } else {
          query[field.name] = subQuery;
        }
      }
    });
  }
  if (rateOption) {
    const option = OPTION_DETAILS[rateOption.id];
    if (option.count !== 0) {
      query['rate'] = option.count;
    } else {
      query['rate'] = { $nin: [1, 2, 3, 4, 5] };
    }
  }

  let activityCondition = {};
  if (activityOption) {
    const option = OPTION_DETAILS[activityOption.id];
    const range = activityOption.range || 30;
    const createdAt = new Date(Date.now() - range * 24 * 3600000);
    activityCondition = {
      type: { $in: option.types },
      created_at: { $gte: createdAt },
    };
  }

  return {
    fieldQuery: query,
    activityCondition,
    automationOption,
  };
};

const getContactsByAnalytics = async (user, options) => {
  const HealthOptions = [
    'missing_email',
    'missing_phone',
    'missing_email_phone',
  ];
  const ActivityOptions = ['recent_communicated', 'recent_video_tracked'];
  const AutomationOptions = [
    'on_automation',
    'never_automated',
    'recent_off_automation',
  ];
  const RateOptions = [
    'one_star',
    'two_star',
    'three_star',
    'four_star',
    'five_star',
    'zero_star',
  ];

  const OPTION_DETAILS = {
    missing_email: {
      and: true,
      fields: [
        {
          name: 'email',
          exist: false,
        },
        {
          name: 'cell_phone',
          exist: true,
        },
      ],
    },
    missing_phone: {
      and: true,
      fields: [
        {
          name: 'cell_phone',
          exist: false,
        },
        {
          name: 'email',
          exist: true,
        },
      ],
    },
    missing_email_phone: {
      and: true,
      fields: [
        {
          name: 'email',
          exist: false,
        },
        {
          name: 'cell_phone',
          exist: false,
        },
      ],
    },
    recent_communicated: { types: ['emails', 'texts'] },
    recent_video_tracked: { types: ['video_trackers'] },
    on_automation: { type: 'never_automated' },
    recent_off_automation: { type: 'never_automated' },
    never_automated: { type: 'never_automated' },
    one_star: { count: 1 },
    two_star: { count: 2 },
    three_star: { count: 3 },
    four_star: { count: 4 },
    five_star: { count: 5 },
    zero_star: { count: 0 },
  };
  const automationOption = options.filter((e) =>
    AutomationOptions.includes(e.id)
  )[0];
  const fieldOption = options.filter((e) => HealthOptions.includes(e.id))[0];
  const rateOption = options.filter((e) => RateOptions.includes(e.id))[0];
  const activityOption = options.filter((e) =>
    ActivityOptions.includes(e.id)
  )[0];
  let contactIds = [];
  let query = { user: user._id };
  if (automationOption) {
    const onAutomationContacts = await TimeLine.aggregate([
      { $match: { user: user._id, contact: { $exists: true } } },
      { $group: { _id: '$contact' } },
    ]).catch((err) => {});
    const onAutomationContactIds = onAutomationContacts.map((e) => e._id);
    if (automationOption.type === 'on_automation') {
      contactIds = onAutomationContactIds;
      if (!contactIds.length) {
        return [];
      }
    } else if (automationOption.type === 'recent_off_automation') {
      const range = automationOption.range || 30;
      const latestAutomation = new Date(Date.now() - range * 24 * 3600000);
      query = {
        _id: { $nin: onAutomationContactIds },
        automation_off: { $gte: latestAutomation },
      };
    } else {
      query = {
        _id: { $nin: onAutomationContactIds },
        automation_off: { $exists: false },
      };
    }
  }
  if (fieldOption) {
    const option = OPTION_DETAILS[fieldOption.id];
    if (!option.and) {
      query['$or'] = [];
    }
    option.fields.forEach((field) => {
      let subQuery = { $exists: true, $nin: ['', null] };
      if (!field.exist) {
        subQuery = {
          $or: [
            { [field.name]: { $exists: false } },
            { [field.name]: { $in: ['', null] } },
          ],
        };
      }
      if (!option.and) {
        if (!field.exist) {
          query['$or'] = [...(query['$or'] || []), ...subQuery['$or']];
        } else {
          query['$or'].push({ [field.name]: subQuery });
        }
      } else {
        if (!field.exist) {
          query['$and'] = [...(query['$and'] || [])];
          query['$and'].push(subQuery);
        } else {
          query[field.name] = subQuery;
        }
      }
    });
  }
  if (rateOption) {
    const option = OPTION_DETAILS[rateOption.id];
    query['rate'] = option.count;
  }
  if (Object.keys(query).length > 1) {
    if (contactIds.length) {
      query['_id'] = { $in: contactIds };
    }
    const contacts = await Contact.find(query)
      .select('_id')
      .catch((err) => {});
    contactIds = contacts.map((e) => e._id);
    if (!contactIds.length) {
      return [];
    }
  }

  if (activityOption) {
    const option = OPTION_DETAILS[activityOption.id];
    const range = activityOption.range || 30;
    const createdAt = new Date(Date.now() - range * 24 * 3600000);
    const additionalQuery = {};
    if (contactIds.length) {
      additionalQuery['contacts'] = { $in: contactIds };
    }
    const contacts = await Activity.aggregate([
      {
        $match: {
          user: user._id,
          created_at: { $gte: createdAt },
          type: { $in: option.types },
          ...additionalQuery,
        },
      },
      {
        $group: { _id: '$contacts' },
      },
      {
        $match: { _id: { $ne: null } },
      },
    ]).catch((err) => {});
    contactIds = contacts.map((e) => e._id);
  }
  return contactIds;
};

/**
 *
 * @param {*} contact: Contact document
 * @param {*} sourceUser: source user id
 * @param {*} targetUser: target user id
 */
const transferContact = async (
  contact,
  sourceUser,
  targetUser,
  runByAutomation = false,
  isInternal = false
) => {
  return new Promise(async (resolve, reject) => {
    const pendingContact = await Contact.findOne({
      _id: contact._id,
    }).catch((err) => {
      console.log('pending contacts not found', err);
    });

    let isPending = false;
    if (pendingContact.type && pendingContact.pending_users?.length) {
      isPending = true;
    }
    const active_followup = await FollowUp.findOne({
      contact: contact._id,
      due_date: { $exists: true, $gte: new Date() },
      status: 0,
    });
    let isRunningAutomation = false;
    if (!runByAutomation) {
      const active_timeline = await TimeLine.findOne({
        contact: contact._id,
      });
      if (active_timeline) isRunningAutomation = true;
    }

    const active_task = await Task.findOne({
      status: { $in: ['active', 'draft'] },
      contacts: contact._id,
    });
    const active_deal = await Deal.findOne({
      contacts: contact._id,
    });
    const active_campaign = await CampaignJob.findOne({
      status: 'active',
      contacts: contact._id,
    });

    if (
      isPending ||
      active_followup ||
      isRunningAutomation ||
      active_task ||
      active_deal ||
      active_campaign
    ) {
      const reasons = [];
      if (isPending && pendingContact) {
        reasons.push('active_pending');
      }
      if (active_followup) {
        reasons.push('active_followup');
      }
      if (isRunningAutomation) {
        reasons.push('active_automation');
      }
      if (active_deal) {
        reasons.push('active_deal');
      }
      if (active_task) {
        reasons.push('active_task');
      }
      if (active_campaign) {
        reasons.push('active_campaign');
      }
      resolve({
        status: false,
        data: {
          contact,
          reasons,
          error: 'Running job',
        },
      });
    } else {
      const activity_content = runByAutomation
        ? ActivityHelper.automationLog('routed contact(transfered)')
        : 'routed contact(transfered)';
      const activity = new Activity({
        user: targetUser,
        contacts: contact._id,
        content: activity_content,
        users: sourceUser,
        type: 'users',
      });
      await activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });

      const email = contact.email;
      const cell_phone = contact.cell_phone;

      let exists;

      if (email) {
        exists = await Contact.findOne({
          email,
          user: targetUser,
        });
      }

      if (!exists && cell_phone) {
        exists = await Contact.findOne({
          cell_phone,
          user: targetUser,
        });
      }

      if (!exists && isInternal) {
        Contact.updateOne(
          {
            _id: contact._id,
          },
          {
            $set: { user: targetUser, last_activity: activity._id },
          }
        )
          .then(() => {
            resolve({
              status: true,
              data: {
                contact,
              },
            });
          })
          .catch((err) => {
            console.log('contact update err', err.message);
            resolve({
              status: false,
              data: {
                contact,
                error: err.message || err,
              },
            });
          });
        return;
      }

      await Contact.updateOne(
        {
          _id: contact._id,
        },
        {
          $set: { type: 'transfer', pending_users: [targetUser] },
          $addToSet: { tags: 'transferred' },
        }
      )
        .then(() => {
          resolve({
            status: true,
            data: {
              contact,
            },
          });
        })
        .catch((err) => {
          console.log('contact update err', err.message);
          resolve({
            status: false,
            data: {
              contact,
              error: err.message || err,
            },
          });
        });
    }
  });
};

const shareContact = (
  contactId,
  sourceUser,
  targetUsers,
  teamId,
  mode,
  runByAutomation = false
) => {
  return new Promise(async (resolve) => {
    const contact = await Contact.findOne({
      _id: contactId,
    }).catch((err) => {
      console.log('contact not found', err);
    });
    let isPending = false;
    if (
      contact &&
      contact.type &&
      contact.pending_users?.length &&
      !contact.shared_all_member &&
      mode !== 'all_member'
    ) {
      isPending = true;
    }
    if (isPending) {
      const reasons = [];
      if (contact) {
        reasons.push('active_pending');
      }
      resolve({
        status: false,
        data: {
          contact,
          reasons,
          error: 'Running job',
        },
      });
    } else {
      const activity_content = 'shared contact';
      let activity;
      let shared_all_member = false;
      if (mode === 'all_member') {
        shared_all_member = true;
        activity = await Activity.findOneAndUpdate(
          {
            user: sourceUser,
            contacts: contactId,
            type: 'team',
            team: teamId,
          },
          {
            user: sourceUser,
            contacts: contactId,
            content: runByAutomation
              ? ActivityHelper.automationLog(activity_content)
              : activity_content,
            type: 'team',
            team: teamId,
          },
          {
            new: true,
            upsert: true,
          }
        );
      } else {
        activity = new Activity({
          user: sourceUser,
          contacts: contactId,
          content: runByAutomation
            ? ActivityHelper.automationLog(activity_content)
            : activity_content,
          users: targetUsers[0]._id,
          type: 'users',
        });
        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });
      }
      Contact.updateOne(
        {
          _id: contactId,
        },
        {
          $set: {
            shared_team: teamId,
            shared_all_member,
            last_activity: activity._id,
            type: 'share',
          },
          $addToSet: {
            shared_members: { $each: targetUsers },
          },
        }
      )
        .then(async () => {
          contact['shared_all_member'] = shared_all_member;
          const myJSON = JSON.stringify(contact);
          const _contact = JSON.parse(myJSON);
          const tUsers = _.map(targetUsers, (tUser) => {
            return {
              user_name: tUser.user_name,
              picture_profile: tUser.picture_profile,
              email: tUser.email,
              cell_phone: tUser.cell_phone,
              _id: tUser._id,
            };
          });
          _contact.shared_members.push(tUsers);
          resolve({
            status: true,
            data: {
              contact: _contact,
            },
          });
        })
        .catch((err) => {
          console.log('contact update err', err.message);
          resolve({
            status: false,
            data: {
              contact,
              error: err.message || err,
            },
          });
        });
    }
  });
};

/**
 *
 * @param {*} contact
 * @param {*} sourceUser
 * @param {*} targetUser
 */
const cloneContact = (
  contact,
  sourceUser,
  targetUser,
  isInternal = false,
  runByAutomation = false
) => {
  return new Promise(async (resolve, reject) => {
    let exists;

    const email = contact.email;
    const cell_phone = contact.cell_phone;

    if (email) {
      exists = await Contact.findOne({
        email,
        user: targetUser,
      });
    }

    if (!exists && cell_phone) {
      exists = await Contact.findOne({
        cell_phone,
        user: targetUser,
      });
    }

    const copied_contact = new Contact({
      ...contact._doc,
      _id: undefined,
      type: 'clone',
      pending_users: exists || !isInternal ? [targetUser] : [],
      original_id: contact._id,
      original_user: sourceUser,
      user: exists || !isInternal ? undefined : targetUser,
    });
    copied_contact
      .save()
      .then(async (cloned_contact) => {
        const activity_content = runByAutomation
          ? ActivityHelper.automationLog('routed contact(cloned)')
          : 'routed contact(cloned)';
        const activity = new Activity({
          user: sourceUser,
          contacts: contact._id,
          content: activity_content,
          users: targetUser,
          type: 'users',
        });
        activity
          .save()
          .then(async (newActivity) => {
            await Contact.updateOne(
              { _id: contact._id },
              {
                $set: { last_activity: newActivity._id },
                $addToSet: { tags: 'cloned' },
              }
            );
          })
          .catch((err) => {
            console.log('activity save err', err.message);
          });

        const activity1 = new Activity({
          user: targetUser,
          contacts: cloned_contact._id,
          content: activity_content,
          users: sourceUser,
          type: 'users',
        });
        await activity1.save().catch((err) => {
          console.log('activity save err', err.message);
        });
        Contact.updateOne(
          { _id: cloned_contact._id },
          {
            $set: { last_activity: activity1._id },
            $addToSet: { tags: 'cloned' },
          }
        );
        const followups = await FollowUp.find({
          contact: contact._id,
          $or: [{ due_date: { $lte: new Date() } }, { status: { $ne: 0 } }],
        });
        const notes = await Note.find({ contact: contact._id });
        const followupDic = {};
        const noteDic = {};
        followups.forEach((e) => {
          const newFollowup = new FollowUp({
            ...e._doc,
            user: targetUser,
            contact: cloned_contact._id,
            _id: undefined,
          });
          followupDic[e._id] = newFollowup._id;
          newFollowup.save({ timestamps: false }).catch(() => {});
        });
        notes.forEach((e) => {
          const newNote = new Note({
            ...e._doc,
            user: targetUser,
            contact: cloned_contact._id,
            _id: undefined,
          });
          noteDic[e._id] = newNote._id;
          newNote.save({ timestamps: false }).catch(() => {});
        });
        const activities = await Activity.find({
          contacts: contact._id,
          type: {
            $in: [
              'follow_ups',
              'notes',
              'emails',
              'texts',
              'videos',
              'pdfs',
              'images',
              'video_trackers',
              'pdf_trackers',
              'image_trackers',
              'email_trackers',
              'text_trackers',
              'contacts',
            ],
          },
        });
        activities.forEach((e) => {
          const relatedMap = {};
          if (e.type === 'follow_ups') {
            if (!followupDic[e.follow_ups]) {
              return;
            }
            relatedMap['follow_ups'] = followupDic[e.follow_ups];
          } else if (e.type === 'notes') {
            relatedMap['notes'] = noteDic[e.notes];
          }
          const newActivity = new Activity({
            ...e._doc,
            user: targetUser,
            contacts: cloned_contact._id,
            _id: undefined,
            ...relatedMap,
          });
          newActivity.save({ timestamps: false }).catch(() => {
            console.log('new activity clone is failed');
          });
        });
        resolve({
          status: true,
          data: {
            contact,
          },
        });
      })
      .catch((err) => {
        console.log('contact update err', err.message);
        resolve({
          status: false,
          data: {
            contact,
            error: err.message || err,
          },
        });
      });
  });
};

const shareContactsToOrganization = async (currentUser, contactId) => {
  return new Promise(async (resolve, reject) => {
    if (!currentUser || !currentUser?.organization) {
      resolve({
        status: false,
        error: 'Don’t have organization',
      });
    } else {
      const team = await Team.findOne({
        $or: [{ members: currentUser.id }, { owner: currentUser.id }],
        is_internal: true,
      }).catch((err) => {
        console.log('teams found error', err.message);
      });
      if (team) {
        await generateSharePromise({
          currentUser,
          contactId,
          users: [],
          type: undefined,
          mode: 'all_member',
          team: team._id,
          shareTeam: team,
          runByAutomation: false,
        })
          .then((res) => {
            resolve(res);
          })
          .catch((err) => {
            console.log('share contacts to organization err', err.message);
            resolve({
              status: false,
              error: err.message || err,
            });
          });
      } else {
        resolve({
          status: false,
          error: 'Invalid permission',
        });
      }
    }
  });
};
const generateSharePromise = (param) => {
  const {
    currentUser,
    contactId,
    users,
    type,
    mode,
    team,
    shareTeam,
    runByAutomation,
  } = param;
  const promise = new Promise(async (resolve, reject) => {
    const contact = await Contact.findOne({
      _id: contactId,
      user: currentUser.id,
    })
      .populate([
        {
          path: 'user',
          select: {
            user_name: 1,
            picture_profile: 1,
            email: 1,
            cell_phone: 1,
          },
        },
        {
          path: 'shared_team',
          select: {
            _id: 1,
          },
        },
      ])
      .catch((err) => {
        console.log('contact find err', err.message);
      });

    if (!contact) {
      const _contact = await Contact.findOne({
        _id: contactId,
      }).catch((err) => {
        console.log('contact find err', err.message);
      });
      resolve({
        status: false,
        data: {
          contact: _contact,
          error: 'Invalid permission',
        },
      });
    } else {
      let criteria;
      let content;

      // Share the contact
      const sharedTeams = contact.shared_team.map((e) => e._id + '');
      if (sharedTeams.length && !sharedTeams.includes(team)) {
        const sharedTeam = await Team.findOne({
          _id: team,
        }).catch((err) => {
          console.log('team not found', err.message);
        });
        resolve({
          status: false,
          data: {
            contact,
            error:
              'This contact is shared with Team ' +
              sharedTeam.name +
              '. You can not share this other team.',
          },
        });
      } else {
        const targetUserIds = users?.map((e) => e._id);
        shareContact(
          contact._id,
          currentUser.id,
          targetUserIds,
          team,
          mode,
          runByAutomation
        ).then((res) => {
          resolve(res);
        });
        criteria = 'share_contact';
        content = `${currentUser.user_name} has shared the contact in CRMGrow`;

        if (criteria && content) {
          _.forEach(users, (user) => {
            const notification = new Notification({
              creator: currentUser._id,
              user: user._id,
              criteria,
              contact: [contact],
              team: shareTeam ? shareTeam._id : '',
              content,
            });

            // Notification
            notification.save().catch((err) => {
              console.log('notification save err', err.message);
            });
          });
        }
      }
    }
  });
  return promise;
};

const generateCloneAndTransferContactPromise = (param) => {
  const {
    currentUser,
    contactId,
    userId,
    type,
    runByAutomation = false,
    isInternal = false,
  } = param;
  const promise = new Promise(async (resolve, reject) => {
    const contact = await Contact.findOne({
      _id: contactId,
      user: currentUser.id,
    })
      .populate([
        {
          path: 'user',
          select: {
            user_name: 1,
            picture_profile: 1,
            email: 1,
            cell_phone: 1,
          },
        },
        {
          path: 'shared_team',
          select: {
            _id: 1,
          },
        },
      ])
      .catch((err) => {
        console.log('contact find err', err.message);
      });

    if (!contact) {
      const _contact = await Contact.findOne({
        _id: contactId,
      }).catch((err) => {
        console.log('contact find err', err.message);
      });
      resolve({
        status: false,
        data: {
          contact: _contact,
          error: 'Invalid permission, you are not owner of the contact',
        },
      });
    } else {
      let criteria = '';
      let content = '';
      if (type === 1) {
        // Transfer Contact to other users
        transferContact(
          contact,
          currentUser.id,
          userId,
          runByAutomation,
          isInternal
        ).then((res) => {
          resolve(res);
        });
      } else if (type === 3) {
        // Clone the contact
        cloneContact(
          contact,
          currentUser.id,
          userId,
          isInternal,
          runByAutomation
        ).then((res) => {
          resolve(res);
        });
        criteria = 'clone_contact';
        content = `${currentUser.user_name} has cloned the contact in CRMGrow`;
      }
      if (criteria && content) {
        const notification = new Notification({
          creator: currentUser._id,
          user: userId,
          criteria,
          contact: [contact],
          content,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
    }
  });
  return promise;
};

const acceptCloneRequest = async (contactIds, userId, customFields) => {
  const originalContacts = [];
  const contactMatchInfo = {};
  await Contact.find({
    _id: { $in: contactIds },
    pending_users: userId,
    type: 'clone',
  })
    .then(async (contacts) => {
      for (const contact of contacts) {
        originalContacts.push(mongoose.Types.ObjectId(contact.original_id));
        contactMatchInfo[contact.original_id] = contact._id;
      }
    })
    .catch((err) => {
      console.log('no contact err', err.message);
    });

  const matchCustomFieldInfo = {};
  await Contact.find({ _id: { $in: originalContacts } })
    .then(async (contacts) => {
      for (const contact of contacts) {
        const { additionalInfo } = matchCoustomField(
          contact,
          customFields,
          userId
        );
        matchCustomFieldInfo[contactMatchInfo[contact._id]] = additionalInfo;

        const notification = new Notification({
          creator: userId,
          user: contact.user,
          contact: contact._id,
          criteria: 'accept_clone_contact',
          content: `accepted the contact clone in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
    })
    .catch((err) => {
      console.log('no contact err', err.message);
    });

  for (const contact of contactIds) {
    await Contact.updateOne(
      { _id: contact, pending_users: userId },
      {
        $set: { user: userId, additional_field: matchCustomFieldInfo[contact] },
        $unset: {
          type: true,
          pending_users: true,
        },
      }
    );
  }
};

const declineCloneRequest = async (contactIds, userId) => {
  const originalContactIds = [];
  let originalContacts = [];

  await Contact.find({
    _id: { $in: contactIds },
    pending_users: userId,
    type: 'clone',
  })
    .then((contacts) => {
      for (const contact of contacts) {
        originalContactIds.push(contact.original_id);
      }
    })
    .catch((err) => {
      console.log('no contact err', err.message);
    });

  await Contact.find({ _id: { $in: originalContactIds } })
    .then((contacts) => {
      originalContacts = contacts;
      for (const contact of contacts) {
        const activity_content = 'declined routed contact(cloned)';
        const activity = new Activity({
          user: contact.user,
          contacts: contact._id,
          content: activity_content,
          users: userId,
          type: 'users',
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });
        Contact.updateOne(
          { _id: contact._id },
          { $set: { last_activity: activity._id } }
        ).then(() => {
          console.log('updated');
        });

        const notification = new Notification({
          creator: userId,
          user: contact?.user,
          contact: contact._id,
          criteria: 'decline_clone_contact',
          content: `declined the contact clone in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
    })
    .catch((err) => {
      console.log('no contact err', err.message);
    });

  await Contact.deleteMany({
    _id: { $in: contactIds },
    pending_users: userId,
    type: 'clone',
  })
    .then(async () => {
      Activity.deleteMany({
        contacts: { $in: contactIds },
        user: userId,
      }).catch(() => {
        console.log('activity delete');
      });
      FollowUp.deleteMany({ contact: { $in: contactIds }, user: userId }).catch(
        () => {
          console.log('followup delete');
        }
      );
      PhoneLog.deleteMany({ contact: { $in: contactIds }, user: userId }).catch(
        () => {
          console.log('phone log delete');
        }
      );
      Note.deleteMany({ contact: { $in: contactIds }, user: userId }).catch(
        () => {
          console.log('note delete');
        }
      );
      for (const contact of originalContacts) {
        const clonedContacts = await Contact.findOne({
          original_id: contact._id,
        });
        if (!clonedContacts)
          Contact.updateOne(
            { _id: contact._id },
            {
              $pull: { tags: 'cloned' },
            }
          ).then(() => {
            console.log('updated');
          });
      }
    })
    .catch((err) => {
      console.log('decline clone err', err.message);
    });
};

const acceptTransferRequest = async (contactIds, userId, customFields) => {
  await Contact.find({
    _id: { $in: contactIds },
    pending_users: userId,
    type: 'transfer',
  })
    .then(async (contacts) => {
      for (const contact of contacts) {
        const query = {
          $set: { user: userId },
          $unset: { pending_users: true, type: true },
        };
        if (customFields.length) {
          const { additionalInfo } = matchCoustomField(
            contact,
            customFields,
            userId
          );
          query['$set']['additional_field'] = additionalInfo;
        }

        await Contact.updateOne({ _id: contact._id }, { ...query }).then(() => {
          console.log('updated');
        });

        const activity_content = 'accepted routed contact(transfered)';
        const activity = new Activity({
          user: userId,
          contacts: contact._id,
          content: activity_content,
          users: contact.user,
          type: 'users',
        });
        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });
        Contact.updateOne(
          { _id: contact._id },
          { $set: { last_activity: activity._id } }
        ).then(() => {
          console.log('updated');
        });

        Activity.updateMany(
          { contacts: contact._id },
          { $set: { user: userId } },
          { timestamps: false }
        ).catch(() => {
          console.log('activity save');
        });
        FollowUp.updateMany(
          { contact: contact._id },
          { $set: { user: userId } },
          { timestamps: false }
        ).catch(() => {
          console.log('followup save');
        });
        PhoneLog.updateMany(
          { contact: contact._id },
          { $set: { user: userId } },
          { timestamps: false }
        ).catch(() => {
          console.log('phone log save');
        });
        Note.updateMany(
          { contact: contact._id },
          { $set: { user: userId } },
          { timestamps: false }
        ).catch(() => {
          console.log('note save');
        });

        const notification = new Notification({
          creator: userId,
          user: contact.user,
          contact: contact._id,
          criteria: 'accept_transfer_contact',
          content: `accepted the contact transfer in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
    })
    .catch((err) => {
      console.log('no contact err', err.message);
    });
};

const declineTransferRequest = async (contactIds, userId) => {
  await Contact.find({
    _id: { $in: contactIds },
    pending_users: userId,
    type: 'transfer',
  })
    .then((contacts) => {
      for (const contact of contacts) {
        Contact.updateOne(
          { _id: contact._id },
          {
            $unset: { pending_users: true, type: true },
          }
        ).then(() => {
          console.log('updated');
        });

        const notification = new Notification({
          creator: userId,
          user: contact?.user,
          contact: contact._id,
          criteria: 'decline_transfer_contact',
          content: `declined the contact transfer in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
    })
    .catch((err) => {
      console.log('no contact err', err.message);
    });
};

const acceptAvmRequest = async (contactIds, userId) => {
  await Contact.updateMany(
    { _id: { $in: contactIds }, pending_users: userId, type: 'avm' },
    {
      $unset: { pending_users: true, type: true },
      $set: { user: userId },
    }
  );
  for (const contactId of contactIds) {
    const currentUser = await User.findOne({ _id: userId }).catch((err) =>
      console.log('user not found', err.message)
    );
    if (currentUser) {
      await shareContactsToOrganization(currentUser, contactId).catch((err) =>
        console.log('share contacts to organization err', err.message)
      );
    }
  }
};

const declineAvmRequest = async (contactIds, userId) => {
  await Contact.deleteMany({
    _id: { $in: contactIds },
    pending_users: userId,
    type: 'avm',
  })
    .then(() => {
      Activity.deleteMany({
        contacts: { $in: contactIds },
        user: userId,
      }).catch(() => {
        console.log('activity delete');
      });
    })
    .catch((err) => {
      console.log('decline clone err', err.message);
    });
};

const pushAddtionalFields = async (contact, sourceUser, targetUser) => {
  const additional_fields = contact.additional_field;
  const source_additionalFields = await CustomField.find({
    user: sourceUser,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field load failed, ', ex.message);
  });
  const target_additionalFields = await CustomField.find({
    user: targetUser._id,
    kind: 'contact',
  }).catch((ex) => {
    console.log('custom field load failed, ', ex.message);
  });
  const target_additional_fields = [...target_additionalFields];
  let new_id = target_additional_fields.length + 1;
  if (additional_fields) {
    Object.keys(additional_fields).forEach((key) => {
      const index = source_additionalFields.findIndex((e) => e.name === key);
      const targetIndex = target_additional_fields.findIndex(
        (e) => e.name === key
      );
      if (index !== -1 && targetIndex === -1) {
        const org_field = source_additionalFields[index];
        const { _id, ...rest } = org_field;
        rest['order'] = new_id;
        new_id += 1;
        const new_field = new CustomField({
          ...rest,
          user: targetUser._id,
          kind: 'contact',
        });
        new_field.save().catch((err) => {
          console.log('custom field save err', err.message);
        });
      }
    });
  }
};

const matchCoustomField = (contact, customFields, userId) => {
  // match custom field
  const additionalInfo = {};
  Object.keys(contact.additional_field).forEach((key) => {
    additionalInfo[key] = contact.additional_field[key];
    const index = customFields.findIndex((e) => e.name === key);
    if (index !== -1) {
      if (customFields[index].type === 'global') {
        Contact.findOne({ _id: contact._id }).then(async (originContact) => {
          const originCustomFields = await CustomField.find({
            user: originContact.user,
            kind: 'contact',
          }).catch((err) => {
            console.log('origin custom fields not found', err);
          });

          const fieldIndex = originCustomFields.findIndex(
            (e) => e.name === key
          );
          if (fieldIndex !== -1) {
            const userCustomFields = await CustomField.find({
              user: userId,
              kind: 'contact',
            }).catch((err) => {
              console.log('origin custom fields not found', err);
            });

            const { _id, order, ...rest } = originCustomFields[fieldIndex];
            const newField = new CustomField({
              ...rest,
              order: userCustomFields.length + 1,
              user: userId,
              kind: 'contact',
            });
            await newField.save().catch((err) => {
              console.log('user custom field save failed', err);
            });
          }
        });
      } else if (!customFields[index].type) {
        delete additionalInfo[key];
        additionalInfo[customFields[index].match_field] =
          contact.additional_field[key];
      }
    }
  });
  return { additionalInfo };
};

const checkDuplicateContact = async (contact, currentUser) => {
  let duplicatedContacts = [];
  const query = {
    user: currentUser.id,
  };
  const fieldCheckQuery = [];
  if (contact['email']) {
    fieldCheckQuery.push({
      email: { $regex: `.*${contact['email']}.*`, $options: 'i' },
    });
  }
  if (contact['cell_phone']) {
    const cell_phone = phone(contact['cell_phone'])?.phoneNumber;
    if (cell_phone) {
      fieldCheckQuery.push({
        cell_phone,
      });
    }
  }
  if (fieldCheckQuery.length) {
    query['$or'] = fieldCheckQuery;
  } else {
    return duplicatedContacts;
  }
  if (contact._id) {
    query['_id'] = { $ne: contact._id };
  } else if (contact?.mergedIds?.length) {
    query['_id'] = { $nin: contact.mergedIds };
  }
  duplicatedContacts = await Contact.find(query).catch((err) => {
    console.log('contacts finding is failed', err);
  });
  return duplicatedContacts;
};

const acceptDuplicateContacts = async (contactData, userId) => {
  const ownContact = await Contact.find({
    _id: { $in: contactData.mergedIds },
    user: userId,
    'pending_users.0': { $exists: false },
  });
  if (ownContact.length) {
    const mergedIds = contactData.mergedIds.filter(
      (e) => e !== ownContact[0]._id + ''
    );
    await Contact.updateOne({ _id: ownContact[0]._id }, { ...contactData })
      .then(async () => {
        await Contact.deleteMany({
          _id: { $in: mergedIds },
          user: userId,
        }).catch((err) => {
          console.log('merged contacts delete', err);
        });
        if (contactData.activity_merge === 'all') {
          await Activity.updateMany(
            { contacts: { $in: mergedIds } },
            { $set: { user: userId, contacts: ownContact[0]._id } },
            { timestamps: false }
          ).catch((err) => {
            console.log('activity save', err);
          });
        }
      })
      .catch((err) => {
        console.log('update own contact with merged data', err);
      });
  } else {
    const mergedContact = new Contact({
      ...contactData,
      user: userId,
      owner: userId,
    });
    const mergedIds = contactData.mergedIds;
    await mergedContact
      .save()
      .then(async (_contact) => {
        await Contact.deleteMany({ _id: { $in: mergedIds } }).catch((err) => {
          console.log('merged contacts delete', err);
        });
        if (contactData.activity_merge === 'all') {
          await Activity.updateMany(
            { contacts: { $in: mergedIds } },
            { $set: { user: userId, contacts: _contact._id } },
            { timestamps: false }
          ).catch(() => {
            console.log('activity save');
          });
        } else if (contactData.activity_merge !== 'remove') {
          await Activity.updateMany(
            { contacts: contactData.activity_merge },
            { $set: { user: userId, contacts: _contact._id } },
            { timestamps: false }
          ).catch(() => {
            console.log('activity save');
          });
        }
      })
      .catch((err) => {
        console.log('create new contact with merged data', err);
      });
  }
};

const updateSphereRelationship = async (contactIds, action) => {
  if (!contactIds?.length) {
    return;
  }
  const current = new Date();
  // const updateQuery = { [action + 'ed_at']: current };
  await SphereRelationship.update(
    {
      contact_id: { $in: contactIds },
    },
    {
      $set: { contacted_at: current },
      $unset: {
        should_contact: true,
        type: true,
        business_score: true,
      },
    }
  );
};

const removeSharedContacts = async (user_id, ids) => {
  await Contact.updateMany(
    { shared_members: user_id, _id: { $in: ids } },
    {
      $pull: {
        shared_members: { $in: [user_id] },
      },
    }
  ).catch((err) => {
    console.log('contact stop share err');
  });
};

const removeContacts = async (user_id, _ids, sharedContactIds = []) => {
  const ids = _ids.filter((item) => !!item);

  await Contact.deleteMany({ _id: { $in: ids } });
  Activity.deleteMany({ contacts: { $in: ids } }).catch((err) =>
    console.log('activity delete error', err.message)
  );
  Draft.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('draft delete error.', err.message)
  );
  Note.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('Note delete error', err.message)
  );
  FollowUp.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('Followup delete error.', err.message)
  );
  Reminder.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('Reminder delete error.', err.message)
  );
  TimeLine.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('TimeLine delete error.', err.message)
  );
  Notification.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('TimeLine delete error', err.message)
  );
  PhoneLog.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('PhoneLog delete error', err.message)
  );
  EmailTracker.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('EmailTracker delete error', err.message)
  );
  ImageTracker.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('ImageTracker delete error', err.message)
  );
  PdfTracker.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('PDFTracker delete error', err.message)
  );
  VideoTracker.deleteMany({ contact: { $in: ids } }).catch((err) =>
    console.log('VideoTracker delete error', err.message)
  );
  SphereRelationship.deleteMany({ contact_id: { $in: ids } }).catch((err) =>
    console.log('SphereRelationship delete error', err.message)
  );
  // remove contact from record
  Appointment.updateMany(
    { contacts: { $elemMatch: { $in: ids } }, user: user_id },
    { $pull: { contacts: { $in: ids } } }
  ).catch((err) => console.log('Appointment delete error', err.message));
  CampaignJob.updateMany(
    { contacts: { $elemMatch: { $in: ids } }, user: user_id },
    { $pull: { contacts: { $in: ids } } }
  ).catch((err) => console.log('CampaignJob update error', err.message));
  Campaign.updateMany(
    { contacts: { $elemMatch: { $in: ids } }, user: user_id },
    { $pull: { contacts: { $in: ids } } }
  ).catch((err) => console.log('Campaign update error', err.message));

  const deals = await Deal.find({
    $and: [
      {
        $or: [{ primary_contact: { $in: ids } }, { contacts: { $in: ids } }],
      },
      { user: user_id },
    ],
  });

  const allContacts = [...ids, ...sharedContactIds].map((it) => it?.toString());
  for (let i = 0; i < deals.length; i++) {
    const primary_contact = deals[i].primary_contact;
    const deal_contacts = deals[i].contacts || [];
    let deal_contact_ids = deal_contacts.map((it) => it.toString());
    allContacts.forEach((item) => {
      deal_contact_ids = deal_contact_ids.filter((it) => it !== item);
    });
    if (deal_contact_ids.length === 0) {
      DealHelper.remove(user_id, deals[i].id);
    } else {
      let primaryContactQuery = {};
      if (primary_contact && allContacts.includes(primary_contact.toString())) {
        primaryContactQuery = { primary_contact: deal_contact_ids[0] };
      }
      Deal.updateOne(
        { _id: deals[i].id },
        {
          $set: {
            ...primaryContactQuery,
            contacts: deal_contact_ids,
          },
        }
      ).catch((err) => {
        console.log('deal update err', err.message);
      });
    }
  }

  Email.updateMany(
    { contacts: { $elemMatch: { $in: ids } }, user: user_id },
    { $pull: { contacts: { $in: ids } } }
  ).catch((err) => console.log('Email update error', err.message));
  Task.updateMany(
    { contacts: { $elemMatch: { $in: ids } }, user: user_id },
    { $pull: { contacts: { $in: ids } } }
  ).catch((err) => console.log('Task update error', err.message));
  Team.updateMany(
    { contacts: { $elemMatch: { $in: ids } }, user: user_id },
    { $pull: { contacts: { $in: ids } } }
  ).catch((err) => console.log('Team update error', err.message));
  Text.updateMany(
    { contacts: { $elemMatch: { $in: ids } }, user: user_id },
    { $pull: { contacts: { $in: ids } } }
  ).catch((err) => console.log('Text update error', err.message));
  CampaignJob.deleteMany({
    contacts: { $size: 0 },
    user: user_id,
  }).catch((err) => console.log('CampaignJob delete error', err.message));
  Campaign.deleteMany({
    contacts: { $size: 0 },
    user: user_id,
  }).catch((err) => console.log('Campaign delete error', err.message));
  Email.deleteMany({
    contacts: { $size: 0 },
    user: user_id,
    deal: { $exists: false },
  }).catch((err) => console.log('Email delete error', err.message));
  Task.deleteMany({
    contacts: { $size: 0 },
    user: user_id,
  }).catch((err) => console.log('Task delete error', err.message));
  Text.deleteMany({
    contacts: { $size: 0 },
    user: user_id,
    deal: { $exists: false },
  }).catch((err) => console.log('Text delete error', err.message));
  // remove the emails
  Email.deleteMany({
    'contacts.0': { $exists: false },
    contacts: { $in: ids },
  }).catch((err) => console.log('Email delete error', err.message));
  AutomationLine.deleteMany({
    contact: { $in: ids },
  }).catch((err) => console.log('Automationline delete error', err.message));
};

/**
 * Check if the activity is anonymous activity & update with the contact Id
 * If activity is connected with tracker, update the tracker with contact id as well.
 * @param {*} activity: Activity Object
 * @param {*} contactId: Contact Id(mongoose id)
 * @returns
 */
const updateAnonymousActivityWithContact = (activity, contactId) => {
  if (!activity || activity.contacts) {
    return;
  }
  activity.contacts = contactId;
  activity
    .save()
    .then(() => {})
    .catch(() => {});

  if (
    ['video_trackers', 'pdf_trackers', 'image_trackers'].includes(activity.type)
  ) {
    const type = activity.type.replace('_trackers', '');
    const id = activity[activity.type];
    if (type && id && TrackerModels[type]) {
      TrackerModels[type]
        .updateOne({ _id: id }, { $set: { contact: contactId } })
        .then(() => {})
        .catch(() => {});
    }
  }
};

/**
 * Merge the primary value and list value.
 * @param {*} primaryFieldValue: primary value
 * @param {*} listFieldValue: info array [{value: string, isPrimary: true | false, type: ''}]
 * @returns {list, primary}
 */
const mergePrimaryInformation = (primaryFieldValue, listFieldValue) => {
  let primary = primaryFieldValue || '';
  const list = listFieldValue || [];
  if (primary) {
    if (list.length > 0) {
      const primaryInfo = list.find((e) => e.isPrimary);
      if (primaryInfo) {
        if (primaryInfo.value !== primary) {
          primaryInfo.isPrimary = false;
          list.push({
            value: primary,
            isPrimary: true,
            type: '',
          });
        }
      } else {
        list.push({
          value: primary,
          isPrimary: true,
          type: '',
        });
      }
    } else {
      list.push({
        value: primary,
        isPrimary: true,
        type: '',
      });
    }
  } else if (list?.length) {
    const primaryInfo = list.find((e) => e.isPrimary);
    if (primaryInfo?.value) {
      primary = primaryInfo.value;
    }
  }

  return { primary, list };
};

const mergePrimaryEmailAndEmails = (data) => {
  const { email, emails } = data;

  const { list: newEmails, primary: newEmail } = mergePrimaryInformation(
    email,
    emails
  );

  return { ...data, email: newEmail, emails: newEmails };
};

const mergePrimaryPhoneAndPhones = (data) => {
  const { cell_phone, phones } = data;

  const { list: newPhones, primary: newPhone } = mergePrimaryInformation(
    cell_phone,
    phones
  );

  return { ...data, cell_phone: newPhone, phones: newPhones };
};

const mergePrimaryAddressAndAddresses = (data) => {
  const { address, state, city, zip, country, addresses } = data;
  const newAddress = {
    address,
    state,
    city,
    zip,
    country,
  };
  const newAddresses = addresses || [];
  if (address || state || city || zip || country) {
    if (newAddresses.length > 0) {
      const primary = newAddresses.find((e) => e.isPrimary);
      if (primary) {
        if (
          !(
            primary.street === address &&
            primary.state === state &&
            primary.city === city &&
            primary.zip === zip &&
            primary.country === country
          )
        ) {
          primary.isPrimary = false;
          newAddresses.push({
            street: address,
            state,
            city,
            zip,
            country,
            isPrimary: true,
          });
        }
      } else {
        newAddresses.push({
          street: address,
          state,
          city,
          zip,
          country,
          isPrimary: true,
        });
      }
    } else {
      newAddresses.push({
        street: address,
        state,
        city,
        zip,
        country,
        isPrimary: true,
      });
    }
  } else if (newAddresses?.length) {
    const primary = newAddresses.find((e) => e.isPrimary);
    if (primary) {
      newAddress.address = primary.street;
      newAddress.city = primary.city;
      newAddress.country = primary.country;
      newAddress.state = primary.state;
      newAddress.zip = primary.zip;
    }
  }

  return { ...data, ...newAddress, addresses: newAddresses };
};

module.exports = {
  groupByFields,
  groupByActivities,
  giveRate,
  giveRateContacts,
  getContactsByAnalytics,
  getConditionsByAnalytics,
  getUniqueContactsByDeal,
  calculateContactRate,
  transferContact,
  shareContact,
  cloneContact,
  shareContactsToOrganization,
  generateSharePromise,
  generateCloneAndTransferContactPromise,
  acceptCloneRequest,
  declineCloneRequest,
  acceptTransferRequest,
  declineTransferRequest,
  acceptAvmRequest,
  declineAvmRequest,
  pushAddtionalFields,
  checkDuplicateContact,
  acceptDuplicateContacts,
  updateSphereRelationship,
  getActivityDetails,
  getContactDetailData,
  removeContacts,
  removeSharedContacts,
  getLoadGroupActivity,
  getTotalCountContactAction,
  updateAnonymousActivityWithContact,
  mergePrimaryEmailAndEmails,
  mergePrimaryPhoneAndPhones,
  mergePrimaryAddressAndAddresses,
};
