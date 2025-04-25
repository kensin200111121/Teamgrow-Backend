const User = require('../src/helpers/user');

module.exports = {
  async up(db, client) {
    const delUsers = await db.collection('users').find({ del: true }).toArray();
    // delUsers.forEach(async (user) =>
    for (let i = 0; i < delUsers.length; i++) {
      const user = delUsers[i];
      await db.collection('contacts').deleteMany({ user: user._id });
      await db.collection('activities').deleteMany({ user: user._id });
      await db.collection('appointments').deleteMany({ user: user._id });
      await db.collection('tags').deleteMany({ user: user._id });
      await db.collection('texts').deleteMany({ user: user._id });
      await db.collection('notifications').deleteMany({ user: user._id });
      await db.collection('deals').deleteMany({ user: user._id });
      await db.collection('teams').deleteMany({ owner: user._id });
      await db.collection('ext_activities').deleteMany({ user: user._id });
      const teams = await db.collection('teams').find({ members: user._id });
      for (let i = 0; i < teams.length; i++) {
        User.removeSharedItems(teams[i]._id, user._id);
      }
      await db.collection('event_types').deleteMany({ user: user._id });
      await db.collection('emails').deleteMany({ user: user._id });
      await db.collection('email_trackers').deleteMany({ user: user._id });
      await db.collection('video_trackers').deleteMany({ user: user._id });
      await db.collection('pdf_trackers').deleteMany({ user: user._id });
      await db.collection('image_trackers').deleteMany({ user: user._id });
      await db.collection('campaigns').deleteMany({ user: user._id });
      await db.collection('automations').deleteMany({ user: user._id });
      await db.collection('automation_lines').deleteMany({ user: user._id });
      await db.collection('deal_stages').deleteMany({ user: user._id });
      await db.collection('drafts').deleteMany({ user: user._id });
      await db.collection('email_templates').deleteMany({ user: user._id });
      await db.collection('filters').deleteMany({ user: user._id });
      await db.collection('folders').deleteMany({ user: user._id });
      await db.collection('follow_ups').deleteMany({ user: user._id });
      await db.collection('guests').deleteMany({ user: user._id });
      await db.collection('labels').deleteMany({ user: user._id });
      await db.collection('phone_logs').deleteMany({ user: user._id });
      await db.collection('pipe_lines').deleteMany({ user: user._id });
      await db.collection('tasks').deleteMany({ user: user._id });
      await db.collection('time_lines').deleteMany({ user: user._id });
      await db.collection('notes').deleteMany({ user: user._id });
      await db.collection('images').deleteMany({ user: user._id });
      await db.collection('videos').deleteMany({ user: user._id });
      await db.collection('pdfs').deleteMany({ user: user._id });

      if (user.payment) {
        if (user.is_primary)
          await User.cancelCustomer(user.payment).catch(() => {
            console.log('cancel payment err');
          });
        else {
          const payment = await db
            .collection('payments')
            .findOne({
              _id: user.payment,
            })
            .catch(() => {
              console.log('invalid payment.');
            });
          if (payment)
            await User.cancelSubscription({
              subscription: payment.subscription,
              shouldDeletePayment: false,
            }).catch((error) => {
              console.log('invalid subscription.');
            });
        }
        await db.collection('payments').deleteOne({ _id: user.payment });
      }
    }
    // );
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
