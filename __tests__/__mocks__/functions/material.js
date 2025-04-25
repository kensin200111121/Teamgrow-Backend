const { original_folders } = require('../data/folder');
const {
  original_videos,
  original_pdfs,
  original_images,
} = require('../data/material');

const filteredVideosByIds = (query) => {
  const queryData = query.getQuery();
  const queryParam = queryData?._id?.$in || [];

  if (queryParam.length && typeof queryParam[0] === 'string') {
    return original_videos.filter((e) => queryParam.includes(`${e._id}`));
  } else if (queryParam.length && typeof queryParam[0] !== 'string') {
    return original_videos.filter((e) =>
      queryParam.some((v) => v.equals(e._id))
    );
  } else {
    return [];
  }
};

const filteredPdfsByIds = (query) => {
  const queryData = query.getQuery();
  return original_pdfs.filter((e) => queryData?._id?.$in.includes(`${e._id}`));
};

const filteredImagesByIds = (query) => {
  const queryData = query.getQuery();
  return original_images.filter((e) =>
    queryData?._id?.$in.includes(`${e._id}`)
  );
};

const filteredDownloadedVideo = (query) => {
  const queryData = query.getQuery();
  return original_videos.find(
    (e) =>
      `${e.original_id}` === `${queryData?.original_id}` &&
      e.original_version === queryData?.original_version &&
      e.version === queryData?.version &&
      e.del === queryData.del &&
      `${e.user}` === `${queryData.user}`
  );
};

const findFolder = (query) => {
  const queryData = query.getQuery();
  let folder = null;
  if (queryData?.team && typeof queryData?.team === 'string') {
    folder = original_folders.find(
      (e) => `${e.team}` === queryData.team && !e?.original_id
    );
  } else if (queryData?.videos) {
    folder = original_folders.find(
      (e) => e.videos.some((v) => v.equals(queryData?.videos)) && !e?.team
    );
  } else if (queryData?.images) {
    folder = original_folders.find((e) => {
      e.images.some((v) => v.equals(queryData?.images)) && !e?.team;
    });
  } else if (queryData?.pdfs) {
    folder = original_folders.find((e) => {
      e.pdfs.some((v) => v.equals(queryData?.pdfs)) && !e?.team;
    });
  } else if (queryData?.templates) {
    folder = original_folders.find((e) => {
      e.templates.some((v) => v.equals(queryData?.templates)) && !e?.team;
    });
  } else if (queryData?.automations) {
    folder = original_folders.find((e) => {
      e.automations.some((v) => v.equals(queryData?.automations)) && !e?.team;
    });
  }
  return folder;
};

module.exports = {
  filteredVideosByIds,
  filteredPdfsByIds,
  filteredImagesByIds,
  filteredDownloadedVideo,
  findFolder,
};
