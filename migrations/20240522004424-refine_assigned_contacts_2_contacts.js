module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    // const oldEmails = await db
    //   .collection('emails')
    //   .aggregate([
    //     { $match: { deal: { $eq: null }, shared_email: { $ne: null } } },
    //     {
    //       $lookup: {
    //         from: 'emails',
    //         localField: 'shared_email',
    //         foreignField: '_id',
    //         as: 'shared_email',
    //       },
    //     },
    //     {
    //       $unwind: '$shared_email',
    //     },
    //   ])
    //   .toArray();

    // const removeEmailIds = [];
    // for (const email of oldEmails) {
    //   if (email.shared_email && email.shared_email.deal) {
    //     removeEmailIds.push(email.shared_email._id);
    //     await db.collection('emails').updateOne(
    //       { _id: email._id },
    //       {
    //         $set: {
    //           deal: email.shared_email.deal,
    //           email_tracker: email.shared_email.email_tracker,
    //           video_tracker: email.shared_email.video_tracker,
    //           pdf_tracker: email.shared_email.pdf_tracker,
    //           image_tracker: email.shared_email.image_tracker,
    //         },
    //       }
    //     );
    //     await db.collection('activities').updateOne(
    //       {
    //         type: 'emails',
    //         emails: email.shared_email._id,
    //         deals: email.deal,
    //       },
    //       { $set: { emails: email._id } }
    //     );
    //   }
    // }

    // const removeTextIds = [];
    // const oldTexts = await db
    //   .collection('text')
    //   .aggregate([
    //     { $match: { deal: { $eq: null }, shared_text: { $ne: null } } },
    //     {
    //       $lookup: {
    //         from: 'texts',
    //         localField: 'shared_text',
    //         foreignField: '_id',
    //         as: 'shared_text',
    //       },
    //     },
    //     {
    //       $unwind: '$shared_text',
    //     },
    //   ])
    //   .toArray();
    // for (const text of oldTexts) {
    //   if (text.shared_text && text.shared_text.deal) {
    //     removeTextIds.push(text.shared_text._id);
    //     await db.collection('emails').updateOne(
    //       { _id: text._id },
    //       {
    //         $set: {
    //           deal: text.shared_text.deal,
    //           email_tracker: text.shared_email.email_tracker,
    //           video_tracker: text.shared_email.video_tracker,
    //           pdf_tracker: text.shared_email.pdf_tracker,
    //           image_tracker: text.shared_email.image_tracker,
    //         },
    //       }
    //     );
    //     await db
    //       .collection('activity')
    //       .updateOne(
    //         { type: 'texts', texts: text.shared_text._id, deals: text.deal },
    //         { $set: { texts: text._id } }
    //       );
    //   }
    // }

    // await db.collection('emails').deleteMany({ _id: { $in: removeEmailIds } });
    // await db.collection('texts').deleteMany({ _id: { $in: removeTextIds } });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
