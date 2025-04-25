module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const users = await db
      .collection('users')
      .find({
        del: false,
      })
      .toArray();
    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      // get root-folder
      const root_folder = await db
        .collection('folders')
        .findOne({
          user: user._id,
          rootFolder: true,
          del: false,
        })
        .catch((err) => console.log('root folder ', err));
      if (root_folder == null) continue;
      // get sub-folders
      const sub_folders = await db
        .collection('folders')
        .find({
          user: user._id,
          type: 'automation',
          del: false,
        })
        .toArray();

      let automationIds = [...root_folder.automations];
      for (let index = 0; index < sub_folders.length; index++) {
        const sub_folder = sub_folders[index];
        automationIds = [...automationIds, ...sub_folder.automations];
      }

      // automation-filter
      const automation_query = {
        _id: { $nin: automationIds },
        user: user._id,
        clone_assign: { $ne: true },
        del: { $ne: true },
      };
      const automationList = await db
        .collection('automations')
        .find(automation_query)
        .toArray();

      if (automationList.length) {
        const autoIds = automationList.map((e) => e._id);
        const nwAutomations = [...root_folder.automations, ...autoIds];
        await db
          .collection('folders')
          .updateOne(
            { _id: root_folder._id },
            { $set: { automations: nwAutomations } }
          )
          .catch((err) => console.log('updating root-folder: ', err));
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
