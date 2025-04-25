/**
 * @description
 * replace 'href="https://dev-material.crmgrow.com/image/635aabadaf856f722bc01bc0"' format content string
 * to href="{{635aabadaf856f722bc01bc0}}"' format on email_template and automations
 */

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});

    function parseUrlsAndIdsFromString(inputString) {
      // Regular expression to match the hosting site URLs and IDs
      var urlIdRegex =
        /href="(https:\/\/[^\/]+.crmgrow.com\/(image|video|pdf)\/([a-zA-Z0-9]+))"/g;

      var urlIdPairs = [];
      let match = urlIdRegex.exec(inputString);

      // Loop through matches and extract the hosting site URLs and IDs
      while (match !== null) {
        urlIdPairs.push({ url: match[1], id: match[3] });
        match = urlIdRegex.exec(inputString);
      }

      return urlIdPairs;
    }

    const replaceContentHref = async () => {
      const templates = await db
        .collection('email_templates')
        .find({
          type: 'email',
          content: {
            $regex:
              /https:\/\/.*crmgrow.com\/(image|video|pdf)\/([a-zA-Z0-9]+)/,
          },
        })
        .toArray();

      console.log('templates count', templates.length);

      for (const template of templates) {
        let content = template.content;
        const templateId = template._id;
        const pairIdUrl = parseUrlsAndIdsFromString(content);

        console.log('template content generating', templateId, pairIdUrl);
        if (pairIdUrl.length > 0) {
          for (const pair of pairIdUrl) {
            if (content.includes(pair.url)) {
              content = content.replaceAll(pair.url, `{{${pair.id}}}`);
            }
          }
          if (content !== template.content) {
            console.log('template content updating', templateId);
            // update only changed content value
            await db
              .collection('email_templates')
              .updateOne({ _id: templateId }, { $set: { content } })
              .then(console.log('template update successful'))
              .catch((e) => console.log('template update error', e.message));
          }
        }
      }
    };

    const replaceContentHrefOnAutoMation = async () => {
      const automations = await db
        .collection('automations')
        .find({
          automations: {
            $elemMatch: {
              'action.content': {
                $regex:
                  /https:\/\/.*crmgrow.com\/(image|video|pdf)\/([a-zA-Z0-9]+)/,
              },
            },
          },
        })
        .toArray();
      console.log('automations count', automations.length);
      for (const automation of automations) {
        console.log('content generating', automation._id);
        const autos = automation.automations;
        const autoId = automation._id;
        autos.forEach((auto) => {
          if (auto.action?.type === 'email') {
            let content = auto.action?.content;
            const pairIdUrl = parseUrlsAndIdsFromString(content);
            // get all href attributes in content html string
            if (pairIdUrl.length > 0) {
              pairIdUrl.forEach((pair) => {
                content = content.replaceAll(pair.url, `{{${pair.id}}}`);
              });
            }
            auto.action.content = content;
          }
        });
        await db
          .collection('automations')
          .updateOne({ _id: autoId }, { $set: { automations: autos } })
          .then(console.log('automation update successful'))
          .catch((e) => console.log('automation update error', e.message));
      }
    };

    const replaceContentHrefOnTimeLine = async () => {
      const timelines = await db
        .collection('time_lines')
        .find({
          'action.content': {
            $regex:
              /https:\/\/.*crmgrow.com\/(image|video|pdf)\/([a-zA-Z0-9]+)/,
          },
        })
        .toArray();
      console.log('timelines count', timelines.length);
      for (const timeline of timelines) {
        const teamLineId = timeline._id;
        const action = timeline.action;

        if (action?.type === 'text') {
          let content = action?.content;
          const pairIdUrl = parseUrlsAndIdsFromString(content);
          console.log('generating content', teamLineId, pairIdUrl);
          if (pairIdUrl.length > 0) {
            pairIdUrl.forEach((pair) => {
              content = content.replaceAll(pair.url, `{{${pair.id}}}`);
            });
          }
          action.content = content;
          console.log('updating content', timeline._id);
          await db
            .collection('timelines')
            .updateOne({ _id: teamLineId }, { $set: { action } })
            .then(console.log('timeline update successful'))
            .catch((e) => console.log('timeline update error', e.message));
        }
      }
    };

    const processArray = async () => {
      await replaceContentHref();
      await replaceContentHrefOnAutoMation();
      await replaceContentHrefOnTimeLine();
    };

    await processArray();
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
