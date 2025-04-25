const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const templateIssueItems = await db
      .collection('garbages')
      .find({ template_tokens: { $exists: true, $ne: [] } })
      .toArray();
    console.log('count', templateIssueItems.length);
    // .find({ template_tokens: { $elemMatch: { $type: 'string' } } });
    for (let index = 0; index < templateIssueItems.length; index++) {
      const _item = templateIssueItems[index];
      const { template_tokens } = _item;
      const nwItems = [];
      // const nwItems = template_tokens.filter((_token) => !!_token?.id);
      template_tokens.forEach((element) => {
        if (typeof element === 'object') {
          if (!element.id) {
            element.id = uuidv4();
          }
          nwItems.push(element);
        }
      });
      console.log('update items', nwItems.length);
      await db
        .collection('garbages')
        .updateOne(
          {
            _id: _item._id,
          },
          {
            $set: { template_tokens: nwItems },
          }
        )
        .catch((err) => {
          console.log('err', err.message);
        });
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
