module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const videos = await db
      .collection('videos')
      .find({ capture_form: { $exists: true }, del: false })
      .toArray();
    const pdfs = await db
      .collection('pdfs')
      .find({ capture_form: { $exists: true }, del: false })
      .toArray();
    const images = await db
      .collection('images')
      .find({ capture_form: { $exists: true }, del: false })
      .toArray();
    videos.forEach(async (video) => {
      const capture_form = {};
      if (!video.capture_form) {
        return;
      }
      if (typeof video.capture_form === 'string') {
        const form = await db
          .collection('lead_forms')
          .findOne({ form_id: video.capture_form });
        if (form) {
          capture_form[form._id] = 0;
        }
      } else if (
        typeof video.capture_form === 'object' &&
        Object.keys(video.capture_form).length
      ) {
        const forms = await db
          .collection('lead_forms')
          .find({ form_id: { $in: Object.keys(video.capture_form) } });
        forms.forEach((form) => {
          capture_form[form._id] = video.capture_form[form.form_id];
        });
      }
      if (!Object.keys(capture_form).length) {
        return;
      }
      console.log('updated this video lead form', video._id, capture_form);
      await db
        .collection('videos')
        .updateOne({ _id: video._id }, { $set: { capture_form } });
    });
    pdfs.forEach(async (pdf) => {
      const capture_form = {};
      if (!pdf.capture_form) {
        return;
      }
      if (typeof pdf.capture_form === 'string') {
        const form = await db
          .collection('lead_forms')
          .findOne({ form_id: pdf.capture_form });
        if (form) {
          capture_form[form._id] = 0;
        }
      } else if (
        typeof pdf.capture_form === 'object' &&
        Object.keys(pdf.capture_form).length
      ) {
        const forms = await db
          .collection('lead_forms')
          .find({ form_id: { $in: Object.keys(pdf.capture_form) } });
        forms.forEach((form) => {
          capture_form[form._id] = pdf.capture_form[form.form_id];
        });
      }
      if (!Object.keys(capture_form).length) {
        return;
      }
      console.log('updated this pdf lead form', pdf._id, capture_form);
      await db
        .collection('pdfs')
        .updateOne({ _id: pdf._id }, { $set: { capture_form } });
    });
    images.forEach(async (image) => {
      const capture_form = {};
      if (!image.capture_form) {
        return;
      }
      if (typeof image.capture_form === 'string') {
        const form = await db
          .collection('lead_forms')
          .findOne({ form_id: image.capture_form });
        if (form) {
          capture_form[form._id] = 0;
        }
      } else if (
        typeof image.capture_form === 'object' &&
        Object.keys(image.capture_form).length
      ) {
        const forms = await db
          .collection('lead_forms')
          .find({ form_id: { $in: Object.keys(image.capture_form) } });
        forms.forEach((form) => {
          capture_form[form._id] = image.capture_form[form.form_id];
        });
      }
      if (!Object.keys(capture_form).length) {
        return;
      }
      console.log('updated this image lead form', image._id, capture_form);
      await db
        .collection('images')
        .updateOne({ _id: image._id }, { $set: { capture_form } });
    });
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
