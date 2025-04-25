module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const node_env = process.env.NODE_ENV;
    console.log('----node env', node_env);
    let searchStr = '';
    let replaceStr = '';
    switch (node_env) {
      case 'production':
        searchStr = 'https://ecsbe.crmgrow.com';
        replaceStr = 'https://material.crmgrow.com';
        break;
      case 'staging':
        searchStr = 'https://stg-api.crmgrow.com';
        replaceStr = 'https://stg-material.crmgrow.com';
        break;
      default:
        searchStr = 'https://dev-api.crmgrow.com';
        replaceStr = 'https://dev-material.crmgrow.com';
        break;
    }
    const templates = await db
      .collection('email_templates')
      .find({ content: { $regex: searchStr } })
      .toArray();
    const subStr = ['/video', '/pdf', '/image'];

    for (let i = 0; i < templates.length; i++) {
      let content = templates[i].content;
      const templateId = templates[i]._id;
      for (let j = 0; j < subStr.length; j++) {
        try {
          content = content.replace(
            searchStr + subStr[j],
            replaceStr + subStr[j]
          );
        } catch (err) {
          console.log('error:', err.message);
        }
      }

      await db
        .collection('email_templates')
        .updateOne({ _id: templateId }, { $set: { content } })
        .then(console.log('template update successful'))
        .catch((e) => console.log('template update error', e.message));
    }
    templates.forEach((e) => {});

    const automations = await db
      .collection('automations')
      .find({
        automations: {
          $elemMatch: {
            'action.content': { $regex: searchStr },
          },
        },
      })
      .toArray();
    for (let i = 0; i < automations.length; i++) {
      const autos = automations[i].automations;
      const autoId = automations[i]._id;
      const new_autos = autos.map((a) => {
        let content = a.action?.content;
        if (content) {
          for (let j = 0; j < subStr.length; j++) {
            try {
              content = content.replace(
                searchStr + subStr[j],
                replaceStr + subStr[j]
              );
              a.action.content = content;
            } catch (err) {
              console.log('replace error:', err.message);
            }
          }
        }
        return a;
      });
      await db
        .collection('automations')
        .updateOne({ _id: autoId }, { $set: { automations: new_autos } })
        .then(console.log('automation update successful'))
        .catch((e) => console.log('automation update error', e.message));
    }
    automations.forEach((e) => {});
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
