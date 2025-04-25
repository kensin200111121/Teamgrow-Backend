module.exports = {
  async up(db, client) {
    const templates = await db
      .collection('email_templates')
      .find({
        role: 'admin',
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

    const admin_automations = await db
      .collection('automations')
      .find({
        role: 'admin',
        clone_assign: false,
        meta: { $exists: false },
      })
      .toArray();

    const download_automations = await db
      .collection('automations')
      .find({
        original_id: { $exists: true },
        'meta.action_count': { $exists: false },
        'automations.0': { $exists: true },
        clone_assign: false,
      })
      .toArray();
    const automations = [...admin_automations, ...download_automations];
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
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
