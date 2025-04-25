const mongoose = require('mongoose');

const { ENV_PATH } = require('../src/configs/path');
require('dotenv').config({ path: ENV_PATH });

const { DB_PORT } = require('../src/configs/database');
const Activity = require('../src/models/activity');
const VideoTracker = require('../src/models/video_tracker');
const PdfTracker = require('../src/models/pdf_tracker');
const ImageTracker = require('../src/models/image_tracker');

const TrackerModels = {
  video_trackers: VideoTracker,
  pdf_trackers: PdfTracker,
  image_trackers: ImageTracker,
};

const CHUNK_COUNT = 1000;

mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(async () => {
    console.log('connected to the database successfully');
    const VideoTrackerChunkCount = 100;
    const PdfTrackerChunkCount = 10;
    const ImageTrackerChunkCount = 10;
    let lastActivityId;
    for (let i = 0; i < VideoTrackerChunkCount; i++) {
      const previousLastActivityId = lastActivityId;
      lastActivityId = await migrateTrackers(lastActivityId, 'video_trackers');
      if (previousLastActivityId + '' === lastActivityId + '') {
        console.log('video trackers completed!');
        break;
      }
    }

    lastActivityId = undefined;
    for (let i = 0; i < PdfTrackerChunkCount; i++) {
      const previousLastActivityId = lastActivityId;
      lastActivityId = await migrateTrackers(lastActivityId, 'pdf_trackers');
      if (previousLastActivityId + '' === lastActivityId + '') {
        console.log('pdf_trackers completed!');
        break;
      }
    }

    lastActivityId = undefined;
    for (let i = 0; i < ImageTrackerChunkCount; i++) {
      const previousLastActivityId = lastActivityId;
      lastActivityId = await migrateTrackers(lastActivityId, 'image_trackers');
      if (previousLastActivityId + '' === lastActivityId + '') {
        console.log('image tracker completed!');
        break;
      }
    }

    await migrateContactActivity();
    console.log('normal activity migration completed');

    for (let i = 0; i < VideoTrackerChunkCount; i++) {
      const result = await migrateMaterialActivity('video');
      if (!result) {
        console.log('video activity completed');
        break;
      }
    }

    for (let i = 0; i < PdfTrackerChunkCount; i++) {
      const result = await migrateMaterialActivity('pdf');
      if (!result) {
        console.log('pdf activity completed');
        break;
      }
    }

    for (let i = 0; i < ImageTrackerChunkCount; i++) {
      const result = await migrateMaterialActivity('image');
      if (!result) {
        console.log('image activity completed');
        break;
      }
    }
  })
  .catch((err) => console.error('Could not connect to mongo DB', err));

const convertToSingleValue = (data) => {
  if (data instanceof Array) {
    return data[0];
  } else {
    return data;
  }
};

const migrateTrackers = async (lastActivityId, type = 'video_trackers') => {
  const Tracker = TrackerModels[type];
  const additionalQuery = lastActivityId
    ? { _id: { $gte: lastActivityId } }
    : {};
  // step 1
  const trackerActivities = await Activity.find(
    {
      type,
      emails: { $exists: false },
      texts: { $exists: false },
      single_id: { $exists: false },
      ...additionalQuery,
    },
    {},
    { limit: CHUNK_COUNT }
  )
    .lean()
    .catch(() => {});
  if (!trackerActivities.length) {
    console.log('completed!');
    return;
  }
  console.log('lastActivityId', lastActivityId);
  // step 2
  const trackerIds = [];
  const trackerActivityMaps = {};
  trackerActivities.forEach((e) => {
    const trackerId = convertToSingleValue(e[type]);
    trackerIds.push(trackerId);
    trackerActivityMaps[trackerId] = e._id;
  });
  const trackers = await Tracker.find({ _id: { $in: trackerIds } })
    .lean()
    .catch(() => {});
  console.log('trackers', trackers.length);
  // step 3
  const sentActivityIds = [];
  const sentActivityTrackerMaps = {};
  trackers.forEach((e) => {
    const sentActivityId = convertToSingleValue(e.activity);
    sentActivityIds.push(sentActivityId);
    if (sentActivityTrackerMaps[sentActivityId]) {
      sentActivityTrackerMaps[sentActivityId].push(e._id);
    } else {
      sentActivityTrackerMaps[sentActivityId] = [e._id];
    }
  });
  const sentActivities = await Activity.find({
    _id: { $in: sentActivityIds },
  })
    .lean()
    .catch(() => {});
  // step4
  const uid = Date.now() - 1500000;
  console.log(
    'sent activities',
    sentActivities.length,
    ' are found from ',
    sentActivityIds.length
  );
  for (let i = 0; i < sentActivities.length; i++) {
    const sentActivity = sentActivities[i];
    console.log('sentActivity', sentActivity._id);
    const relatedTrackers = sentActivityTrackerMaps[sentActivity._id];
    const relatedTrackActivities = relatedTrackers.map(
      (e) => trackerActivityMaps[e]
    );
    console.log('related trackers', relatedTrackActivities);
    const updateQuery = {};
    if (convertToSingleValue(sentActivity.emails)) {
      updateQuery['emails'] = sentActivity.emails;
    } else if (convertToSingleValue(sentActivity.texts)) {
      updateQuery['texts'] = sentActivity.texts;
    } else {
      // generate the uid for the original activity
      updateQuery['single_id'] = uid + i + '';
    }
    console.log('updateQuery', updateQuery);
    if (updateQuery['single_id']) {
      await Activity.updateOne(
        { _id: sentActivity._id },
        { $set: updateQuery }
      ).catch(() => {});
    }
    await Activity.updateMany(
      { _id: { $in: relatedTrackActivities } },
      { $set: updateQuery }
    ).catch((err) => {
      console.log('not working for updateMany', err);
    });
  }
  return trackerActivities[trackerActivities.length - 1]?._id || lastActivityId;
};

const migrateContactActivity = async () => {
  await Activity.updateMany(
    {
      type: 'contacts',
      single_id: { $exists: false },
    },
    [{ $set: { single_id: '$_id' } }]
  ).catch(() => {});

  await Activity.updateMany(
    {
      type: 'text_trackers',
      single_id: { $exists: false },
    },
    [{ $set: { single_id: '$_id' } }]
  ).catch(() => {});

  await Activity.updateMany(
    {
      type: 'sms_trackers',
      single_id: { $exists: false },
    },
    [{ $set: { single_id: '$_id', type: 'text_trackers' } }]
  ).catch(() => {});

  await Activity.updateMany(
    {
      type: 'emails',
      emails: { $exists: false },
    },
    [{ $set: { single_id: '$_id' } }]
  ).catch(() => {});

  await Activity.updateMany(
    {
      type: 'users',
      assigned_id: { $exists: true },
      assigner: { $exists: false },
      content: 'updated assignee',
    },
    [{ $set: { assigner: '$assigned_id' } }]
  ).catch(() => {});
};

const migrateMaterialActivity = async (type) => {
  // find the activities
  const activities = await Activity.find(
    {
      type: type + 's',
      emails: { $exists: false },
      texts: { $exists: false },
      single_id: { $exists: false },
    },
    {},
    { limit: CHUNK_COUNT }
  ).catch(() => {});
  if (!activities.length) {
    return false;
  }
  // find the trackers
  const activityIds = activities.map((e) => e._id);
  const trackers = await TrackerModels[type + '_trackers']
    .find({ activity: { $in: activityIds } })
    .catch(() => {});
  const sentActivityTrackerMaps = {};
  const trackerIds = [];
  trackers.forEach((e) => {
    trackerIds.push(e._id);
    const sentActivityId = convertToSingleValue(e.activity);
    if (sentActivityTrackerMaps[sentActivityId]) {
      sentActivityTrackerMaps[sentActivityId].push(e._id);
    } else {
      sentActivityTrackerMaps[sentActivityId] = [e._id];
    }
  });
  // find the tracker activities
  const trackerActivityMaps = {};
  const trackerActivities = await Activity.find({
    [type + '_trackers']: { $in: trackerIds },
  }).catch(() => {});
  trackerActivities.forEach((e) => {
    const trackerId = convertToSingleValue(e[type + '_trackers']);
    trackerActivityMaps[trackerId] = e._id;
  });

  for (let i = 0; i < activities.length; i++) {
    const sentActivity = activities[i];
    const relatedTrackers = sentActivityTrackerMaps[sentActivity._id] || [];
    const relatedTrackActivities = relatedTrackers.map(
      (e) => trackerActivityMaps[e]
    );
    const updateQuery = {};
    updateQuery['single_id'] = sentActivity._id;
    await Activity.updateMany(
      { _id: { $in: [...relatedTrackActivities, sentActivity._id] } },
      { $set: updateQuery }
    ).catch((err) => {
      console.log('not working for updateMany', err);
    });
  }
  return true;
};

// - find the tracker activity
// - find the tracker from these activities
// - find the send activity from these trackers
// - If that activity has "emails" or "texts" field, update the tracker activity with these fields.
//   else, update the related tracker activity with "activities" field

// - There are some single activities like "Share/Route/Update Assignee/Resubscribe text|email/Unsubscribe text|email"
//   Add the uid field to these activities

// contacts -> single id
// text_trackers, sms_trackers -> unsubscribed & resubscribed sms
// type: emails, emails: {$exists: false} -> resubscribed and Lead Cpature - watched landing page -> unsubscribed email has "emails"
// type: users, assigned_id -> assigned_id to assigner
// email_trackers, emails: exists: false -> doesn't have emails (need to ignore)
// material_trackers, materials (material send, lead capture ....) single id assign migration code
