/**
 * @description
 * replace "https://dev-material.crmgrow.com/image/635aabadaf856f722bc01bc0" format content string
 * to "{{image:635aabadaf856f722bc01bc0}}" format on email_template and automations
 */
module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});

    function parseDataFromString(inputString) {
      // Regular expression to match the ID, hosting URL, and media type
      var dataRegex =
        /(https:\/\/[^\/]+.crmgrow.com\/(image|video|pdf)\/([a-zA-Z0-9]+))/g;

      var parsedData = [];
      let match = dataRegex.exec(inputString);

      // Loop through matches and extract the ID, hosting URL, and media type
      while (match !== null) {
        var url = match[1]; // Extract the hosting URL
        var mediaType = match[2]; // Extract the media type
        var id = match[3]; // Extract the ID
        parsedData.push({ url, mediaType, id });
        match = dataRegex.exec(inputString);
      }
      return parsedData;
    }

    const replaceContentHref = async () => {
      const templates = await db
        .collection('email_templates')
        .find({
          type: 'text',
          content: {
            $regex:
              /https:\/\/.*crmgrow.com\/(image|video|pdf)\/([a-zA-Z0-9]+)/,
          },
        })
        .toArray();
      console.log('template count', templates.length);

      for (const template of templates) {
        let content = template.content;
        const templateId = template._id;
        const pairList = parseDataFromString(content);

        if (pairList.length > 0) {
          for (const pair of pairList) {
            if (content.includes(pair.url)) {
              content = content.replaceAll(
                pair.url,
                `{{${pair.mediaType}:${pair.id}}}`
              );
            }
          }

          console.log('generating content', template._id, pairList);
          if (content !== template.content) {
            console.log('updating content', template._id);
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
        const autos = automation.automations;
        const autoId = automation._id;
        autos.forEach((auto) => {
          if (auto.action?.type === 'text') {
            let content = auto.action?.content;
            const pairList = parseDataFromString(content);
            if (pairList.length > 0) {
              pairList.forEach((pair) => {
                content = content.replaceAll(
                  pair.url,
                  `{{${pair.mediaType}:${pair.id}}}`
                );
              });
            }
            auto.action.content = content;
          }
        });
        console.log('updating content', automation._id);
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
          const pairList = parseDataFromString(content);
          console.log('generating content', teamLineId, pairList);
          if (pairList.length > 0) {
            pairList.forEach((pair) => {
              content = content.replaceAll(
                pair.url,
                `{{${pair.mediaType}:${pair.id}}}`
              );
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
