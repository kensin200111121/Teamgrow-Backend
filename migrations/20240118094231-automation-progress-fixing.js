module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});

    const groupedTimelinesByLines = await db
      .collection('time_lines')
      .aggregate([
        {
          $group: {
            _id: '$automation_line',
            statuses: { $push: '$status' },
            progress_count: {
              $sum: {
                $cond: {
                  if: { $eq: ['$status', 'progress'] },
                  then: 1,
                  else: 0,
                },
              },
            },
            pending_count: {
              $sum: {
                $cond: {
                  if: { $eq: ['$status', 'pending'] },
                  then: 1,
                  else: 0,
                },
              },
            },
            active_count: {
              $sum: {
                $cond: { if: { $eq: ['$status', 'active'] }, then: 1, else: 0 },
              },
            },
            checking_count: {
              $sum: {
                $cond: {
                  if: { $eq: ['$status', 'checking'] },
                  then: 1,
                  else: 0,
                },
              },
            },
            pending_checking_count: {
              $sum: {
                $cond: {
                  if: { $in: ['$status', ['pending', 'checking']] },
                  then: 1,
                  else: 0,
                },
              },
            },
          },
        },
        { $match: { progress_count: { $gte: 1 } } },
      ])
      .toArray();

    for (let i = 0; i < groupedTimelinesByLines.length; i++) {
      const line = groupedTimelinesByLines[i];
      const automationLineId = line._id;

      console.log('checking ', i, ' ', automationLineId);

      if (!automationLineId) {
        continue;
      }

      if (line.active_count) {
        console.log('set as error');
        // convert the progress to error
        await db
          .collection('time_lines')
          .updateMany(
            { automation_line: automationLineId, status: 'progress' },
            { $set: { status: 'error' } }
          );
      } else if (line.pending_count) {
        if (line.progress_count > 1) {
          continue;
        }
        console.log('set as active');
        // convert the progress to active again and set the due_date again
        const progressLine = await db
          .collection('time_lines')
          .findOne({ automation_line: automationLineId, status: 'progress' })
          .catch(() => {});
        const due_date = progressLine.due_date;
        const day = Math.ceil(
          (Date.now() - due_date.getTime()) / (24 * 3600 * 1000)
        );
        const new_due_date = new Date(
          due_date.getTime() + 24 * 3600 * 1000 * day
        );
        await db
          .collection('time_lines')
          .updateOne(
            { _id: progressLine._id },
            { $set: { status: 'active', due_date: new_due_date } }
          );
      } else if (!line.checking_count) {
        console.log('remove as completed');
        // remove the timelines and automation_line complete setting
        await db
          .collection('automation_lines')
          .updateOne(
            { _id: automationLineId },
            { $set: { status: 'completed' } }
          );
        await db.collection('time_lines').deleteMany({
          automation_line: automationLineId,
        });
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
