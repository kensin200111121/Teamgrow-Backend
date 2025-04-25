const { default: mongoose } = require('mongoose');

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const users = await db.collection('users').find({ del: false }).toArray();
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const templates = await db
        .collection('email_templates')
        .find({
          user: user._id,
          meta: { $exists: false },
        })
        .toArray();
      await templates.forEach(async (template) => {
        const content = (template.content || '').replace(/<.*?>/gm, '');
        const excerpt = content.substring(0, 80);
        await db
          .collection('email_templates')
          .updateOne({ _id: template._id }, { $set: { meta: { excerpt } } });
      });

      const automations = await db
        .collection('automations')
        .find({
          user: user._id,
          clone_assign: false,
          meta: { $exists: false },
        })
        .toArray();
      await automations.forEach(async (automation) => {
        const meta = {
          has_email_action: false,
          has_text_action: false,
          has_child_automation: false,
          action_count: 0,
          videos: [],
          pdfs: [],
          images: [],
        };
        let videos = [];
        let pdfs = [];
        let images = [];
        if (automation.automations?.length) {
          for (const action of automation.automations) {
            if (action.action?.type === 'email') {
              meta.has_email_action = true;
            } else if (action.action?.type === 'text') {
              meta.has_text_action = true;
            } else if (action.action?.type === 'automation') {
              meta.has_child_automation = true;
            }
            if (Array.isArray(action.action?.videos)) {
              videos = [...videos, ...(action.action?.videos || [])];
            }
            if (Array.isArray(action.action?.pdfs)) {
              pdfs = [...pdfs, ...(action.action?.pdfs || [])];
            }
            if (Array.isArray(action.action?.images)) {
              images = [...images, ...(action.action?.images || [])];
            }
          }
          meta.action_count = automation.automations?.length || 0;
          meta.videos = videos;
          meta.pdfs = pdfs;
          meta.images = images;
        }
        await db
          .collection('automations')
          .updateOne({ _id: automation._id }, { $set: { meta } });
      });

      console.log(
        'user id migrate',
        user._id,
        templates.length,
        automations.length
      );
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
