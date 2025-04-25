module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    function parseUrlsAndIdsFromString(inputString) {
      // Regular expression to match the hosting site URLs and IDs
      var urlIdRegex =
        /href="(.crmgrow.com\/(image|video|pdf)\/([a-zA-Z0-9]+))"/g;

      var urlIdPairs = [];
      let match = urlIdRegex.exec(inputString);

      // Loop through matches and extract the hosting site URLs and IDs
      while (match !== null) {
        urlIdPairs.push({ url: match[1], id: match[3] });
        match = urlIdRegex.exec(inputString);
      }

      return urlIdPairs;
    }
    const autoIds = await db
      .collection('automations')
      .aggregate(
        [
          { $match: {} },
          { $unwind: '$automations' },
          { $match: { 'automations.action.content': { $regex: '".crmgrow' } } },
          {
            $group: {
              _id: '$_id',
            },
          },
        ],
        { allowDiskUse: true }
      )
      .toArray();

    if (!autoIds.length) {
      return;
    }
    for (let i = 0; i < autoIds.length; i++) {
      const auto = await db
        .collection('automations')
        .findOne({ _id: autoIds[i]._id })
        .catch((e) => {
          console.log('---get automation info error', e?.error);
        });
      if (auto) {
        const automations = auto.automations;
        automations.map((a) => {
          if (a.action?.type !== 'email' && a.action?.type !== 'text') return a;
          let content = a?.action?.content;
          if (!content) {
            return a;
          }
          const pairIdUrl = parseUrlsAndIdsFromString(content);
          // get all href attributes in content html string
          if (pairIdUrl.length > 0) {
            pairIdUrl.forEach((pair) => {
              content = content.replaceAll(pair.url, `{{${pair.id}}}`);
            });
          }
          a.action.content = content;
          return a;
        });
        await db
          .collection('automations')
          .updateOne({ _id: autoIds[i]._id }, { $set: { automations } })
          .catch((e) => {
            console.log('---automation update error', e?.error);
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
