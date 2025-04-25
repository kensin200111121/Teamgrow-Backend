module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const teams = await db
      .collection('teams')
      .find({}, { _id: 1, name: 1 })
      .toArray();
    for (let i = 0; i < teams.length; i++) {
      const root_folder = await db.collection('folders').findOne({
        team: teams[i]['_id'],
        role: 'team',
        del: false,
      });

      if (root_folder) {
        const meta = {
          folders: [],
          videos: [],
          pdfs: [],
          images: [],
        };
        const video_query = {
          _id: { $in: root_folder.videos },
          del: false,
        };
        const pdf_query = {
          _id: { $in: root_folder.pdfs },
          del: false,
        };
        const image_query = {
          _id: { $in: root_folder.images },
          del: false,
        };
        const folder_query = {
          _id: { $in: root_folder.folders },
          type: 'material',
          del: false,
        };

        const videos = await db.collection('videos').find(video_query);
        const videoIds = videos.map((e) => e._id);
        const pdfs = await db.collection('pdfs').find(pdf_query);
        const pdfIds = pdfs.map((e) => e._id);
        const images = await db.collection('images').find(image_query);
        const ImageIds = images.map((e) => e._id);
        const folders = await db.collection('folders').find(folder_query);
        const folderIds = folders.map((e) => e._id);
        meta.videos = videoIds;
        meta.pdfs = pdfIds;
        meta.images = ImageIds;
        meta.folders = folderIds;
        await db
          .collection('teams')
          .updateOne({ _id: teams[i]['_id'] }, { $set: { meta } });
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
