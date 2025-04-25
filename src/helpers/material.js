const fs = require('fs');
const mongoose = require('mongoose');
const {
  S3Client,
  DeleteObjectsCommand,
  ListObjectsCommand,
} = require('@aws-sdk/client-s3');
const api = require('../configs/api');
const Folder = require('../models/folder');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Garbage = require('../models/garbage');
const Team = require('../models/team');
const LeadForm = require('../models/lead_form');

const { PACKAGE } = require('../constants/package');
const { removeFile } = require('./fileUpload');
const {
  lead_caputure_countries,
  lead_capture_regions,
} = require('../constants/variable');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const removeMaterials = async (user) => {
  const videos = await Video.find({
    user,
    del: false,
  }).catch((err) => {
    console.log('video find err', err.message);
  });

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];

    Team.updateOne(
      { videos: video.id },
      {
        $pull: { videos: { $in: [video.id] } },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });

    Video.updateOne({ _id: video.id }, { $set: { del: true } })
      .then(async () => {
        let hasSameVideo = false;
        if (video['bucket']) {
          const sameVideos = await Video.find({
            del: false,
            key: video['key'],
          }).catch((err) => {
            console.log('same video getting error');
          });
          if (sameVideos && sameVideos.length) {
            hasSameVideo = true;
          }
        } else {
          const sameVideos = await Video.find({
            del: false,
            url: video['url'],
          }).catch((err) => {
            console.log('same video getting error');
          });
          if (sameVideos && sameVideos.length) {
            hasSameVideo = true;
          }
        }
        if (!hasSameVideo) {
          if (video['bucket']) {
            removeFile(
              'transcoded/' + video['key'] + '.mp4',
              function (err, data) {
                console.log('transcoded video removing error', err);
              },
              video['bucket']
            );
            emptyBucket(
              video['bucket'],
              'streamd/' + video['key'] + '/',
              (err) => {
                if (err) {
                  console.log('Removing files error in bucket');
                }
              }
            );
          } else {
            const url = video['url'];
            if (url.indexOf('teamgrow.s3') > 0) {
              removeFile(url.slice(44), function (err, data) {
                console.log('err', err);
              });
            } else {
              try {
                const file_path = video.path;
                if (file_path) {
                  fs.unlinkSync(file_path);
                }
              } catch (err) {
                console.log('err', err);
              }
            }
          }
        }
      })
      .catch((err) => {
        console.log('video update err', err.message);
      });
  }
  const pdfs = await PDF.find({
    user,
    del: false,
  }).catch((err) => {
    console.log('pdf find err', err.message);
  });

  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    Team.updateOne(
      { pdfs: pdf.id },
      {
        $pull: { pdfs: { $in: [pdf.id] } },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });

    PDF.updateOne({ _id: pdf.id }, { $set: { del: true } })
      .then(async () => {
        let hasSamePdf = false;
        const samePdfs = await PDF.find({
          del: false,
          url: pdf['url'],
        }).catch((err) => {
          console.log('same pdf getting error');
        });
        if (samePdfs && samePdfs.length) {
          hasSamePdf = true;
        }
        if (!hasSamePdf) {
          removeFile(pdf['key'], function (err, data) {
            console.log('err', err);
          });
        }
      })
      .catch((err) => {
        console.log('pdf update err', err.message);
      });
  }

  const images = await Image.find({
    user,
    del: false,
  }).catch((err) => {
    console.log('image find err', err.message);
  });

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    Team.updateOne(
      { images: image.id },
      {
        $pull: { images: { $in: [image.id] } },
      }
    ).catch((err) => {
      console.log('err', err.message);
    });

    Image.updateOne({ _id: image.id }, { $set: { del: true } })
      .then(async () => {
        /* Remove Image from s3 if it is not duplicated. */
        if (0 && image.key) {
          const keys = image.key;
          for (let key_index = 0; key_index < keys.length; key_index++) {
            const key = keys[key_index];
            let hasSameImage = false;
            const sameImages = await Image.find({
              del: false,
              key: { $in: [key] },
            }).catch((err) => {
              console.log('same image getting error');
            });
            if (sameImages && sameImages.length) {
              hasSameImage = true;
            }
            if (!hasSameImage) {
              removeFile(image['key'], function (err, data) {
                console.log('err', err);
              });
            }
          }
        }
      })
      .catch((err) => {
        console.log('image update err', err.message);
      });
  }
};
const createVideo = async (ids, user) => {
  const videosList = [];
  for (let i = 0; i < ids.length; i++) {
    const videoId = ids[i];
    const data = await Video.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(videoId) },
      },
      { $project: { _id: 0, role: 0, created_at: 0, updated_at: 0 } },
    ]).catch((err) => {
      console.log('err', err);
    });
    const query = {
      ...data[0],
      user: user.id,
    };
    const check_number = await Video.find(query).count();
    if (check_number === 0) {
      if (data[0].capture_form) {
        if (typeof data[0].capture_form === 'string') {
          const capture_form = {};
          capture_form[data[0]['capture_form']] = 0;
          data[0]['capture_form'] = capture_form;
        } else if (Array.isArray(data[0]['capture_form'])) {
          const capture_form = {};
          data[0]['capture_form'].forEach((e) => {
            capture_form[e] = 0;
          });
          data[0]['capture_form'] = capture_form;
        }
      }
      const video = new Video({
        ...data[0],
        user: user.id,
      });
      const tempVideo = await video.save();
      const item = { origin: ids[i], new: tempVideo._id };
      videosList.push(item);
    } else {
      const video = await Video.findOne(query);
      const item = { origin: ids[i], new: video._id };
      videosList.push(item);
    }
  }
  return videosList;
};
const createImage = async (ids, user) => {
  const imagesList = [];
  for (let i = 0; i < ids.length; i++) {
    const imageId = ids[i];
    const data = await Image.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(imageId) },
      },
      { $project: { _id: 0, role: 0, created_at: 0, updated_at: 0 } },
    ]).catch((err) => {
      console.log('err', err);
    });
    const query = {
      ...data[0],
      user: user.id,
    };
    const check_number = await Image.find(query).count();
    if (check_number === 0) {
      if (data[0].capture_form) {
        if (typeof data[0].capture_form === 'string') {
          const capture_form = {};
          capture_form[data[0]['capture_form']] = 0;
          data[0]['capture_form'] = capture_form;
        } else if (Array.isArray(data[0].capture_form)) {
          const capture_form = {};
          data[0].capture_form.forEach((e) => {
            capture_form[e] = 0;
          });
          data[0].capture_form = capture_form;
        }
      }
      const image = new Image({
        ...data[0],
        user: user.id,
      });
      const tempImage = await image.save();
      const item = { origin: ids[i], new: tempImage._id };
      imagesList.push(item);
    } else {
      const image = await Image.findOne(query);
      const item = { origin: ids[i], new: image._id };
      imagesList.push(item);
    }
  }
  return imagesList;
};
const createPdf = async (ids, user) => {
  const pdfsList = [];
  for (let i = 0; i < ids.length; i++) {
    const pdfId = ids[i];
    const data = await PDF.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(pdfId) },
      },
      { $project: { _id: 0, role: 0, created_at: 0, updated_at: 0 } },
    ]).catch((err) => {
      console.log('err', err);
    });
    const query = {
      ...data[0],
      user: user.id,
    };
    const check_number = await PDF.find(query).count();
    if (check_number === 0) {
      if (data[0].capture_form) {
        if (typeof data[0].capture_form === 'string') {
          const capture_form = {};
          capture_form[data[0]['capture_form']] = 0;
          data[0]['capture_form'] = capture_form;
        } else if (Array.isArray(data[0].capture_form)) {
          const capture_form = {};
          data[0].capture_form.forEach((e) => {
            capture_form[e] = 0;
          });
          data[0].capture_form = capture_form;
        }
      }
      const pdf = new PDF({
        ...data[0],
        user: user.id,
      });
      const tempPdf = await pdf.save();
      const item = { origin: ids[i], new: tempPdf._id };
      pdfsList.push(item);
    } else {
      const pdf = await PDF.findOne(query);
      const item = { origin: ids[i], new: pdf._id };
      pdfsList.push(item);
    }
  }
  return pdfsList;
};

const downloadVideos = async (ids, user, is_sharable = true) => {
  const materials = await Video.find({ _id: { $in: ids } });
  const downloaded = await Video.find({
    original_id: { $in: ids },
    user,
    del: false,
  });
  const downloadedDic = {};
  downloaded.forEach((e) => {
    downloadedDic[e.original_id] = e._id;
  });
  const newIds = [];
  for (let i = 0; i < materials.length; i++) {
    const e = materials[i];
    if (!downloadedDic[e._id]) {
      // Download the material
      const video = { ...e._doc };
      if (video.capture_form) {
        if (typeof video.capture_form === 'string') {
          const capture_form = {};
          capture_form[video.capture_form] = 0;
          video.capture_form = capture_form;
        } else if (Array.isArray(video.capture_form)) {
          const capture_form = {};
          video.capture_form.forEach((form) => {
            capture_form[form] = 0;
          });
          video.capture_form = capture_form;
        }
      }
      const newOne = new Video({
        ...video,
        user,
        original_id: e._id,
        role: '',
        is_sharable,
        is_download: is_sharable,
        capture_form: '',
        enabled_capture: false,
        has_shared: false,
        shared_video: undefined,
        created_at: undefined,
        updated_at: undefined,
        _id: undefined,
      });
      const _newOne = await newOne.save();
      newIds.push(_newOne._id);
      downloadedDic[e._id] = _newOne._id;
    }
  }
  await Folder.updateOne(
    { user, rootFolder: true },
    {
      $addToSet: { videos: { $each: newIds } },
    }
  );

  return downloadedDic;
};

const downloadPdfs = async (ids, user, is_sharable = true) => {
  const materials = await PDF.find({ _id: { $in: ids } });
  const downloaded = await PDF.find({
    original_id: { $in: ids },
    user,
    del: false,
  });
  const downloadedDic = {};
  downloaded.forEach((e) => {
    downloadedDic[e.original_id] = e._id;
  });
  const newIds = [];
  for (let i = 0; i < materials.length; i++) {
    const e = materials[i];
    if (!downloadedDic[e._id]) {
      const pdf = { ...e._doc };
      if (pdf.capture_form) {
        if (typeof pdf.capture_form === 'string') {
          const capture_form = {};
          capture_form[pdf['capture_form']] = 0;
          pdf['capture_form'] = capture_form;
        } else if (Array.isArray(pdf.capture_form)) {
          const capture_form = {};
          pdf.capture_form.forEach((form) => {
            capture_form[form] = 0;
          });
          pdf.capture_form = capture_form;
        }
      }
      // Download the material
      const newOne = new PDF({
        ...pdf,
        user,
        original_id: e._id,
        role: '',
        capture_form: '',
        is_sharable,
        is_download: is_sharable,
        enabled_capture: false,
        has_shared: false,
        shared_pdf: undefined,
        created_at: undefined,
        updated_at: undefined,
        _id: undefined,
      });
      const _newOne = await newOne.save();
      newIds.push(_newOne._id);
      downloadedDic[e._id] = _newOne._id;
    }
  }
  await Folder.updateOne(
    { user, rootFolder: true },
    {
      $addToSet: { pdfs: { $each: newIds } },
    }
  );

  return downloadedDic;
};

const downloadImages = async (ids, user, is_sharable = true) => {
  const materials = await Image.find({ _id: { $in: ids } });
  const downloaded = await Image.find({
    original_id: { $in: ids },
    user,
    del: false,
  });
  const downloadedDic = {};
  downloaded.forEach((e) => {
    downloadedDic[e.original_id] = e._id;
  });
  const newIds = [];
  for (let i = 0; i < materials.length; i++) {
    const e = materials[i];
    if (!downloadedDic[e._id]) {
      const image = { ...e._doc };
      if (image.capture_form) {
        if (typeof image.capture_form === 'string') {
          const capture_form = {};
          capture_form[image['capture_form']] = 0;
          image['capture_form'] = capture_form;
        } else if (Array.isArray(image.capture_form)) {
          const capture_form = {};
          image.capture_form.forEach((e) => {
            capture_form[e] = 0;
          });
          image.capture_form = capture_form;
        }
      }
      // Download the material
      const newOne = new Image({
        ...image,
        user,
        original_id: e._id,
        role: '',
        is_sharable,
        is_download: is_sharable,
        capture_form: '',
        enabled_capture: false,
        has_shared: false,
        shared_image: undefined,
        created_at: undefined,
        updated_at: undefined,
        _id: undefined,
      });
      const _newOne = await newOne.save();
      newIds.push(_newOne._id);
      downloadedDic[e._id] = _newOne._id;
    }
  }
  await Folder.updateOne(
    { user, rootFolder: true },
    {
      $addToSet: { images: { $each: newIds } },
    }
  );

  return downloadedDic;
};

const checkMaterialCount = async (user, res) => {
  let count = 0;
  let max_upload_count = 0;

  if (!user.material_info['is_enabled']) {
    return res.status(412).send({
      status: false,
      error: 'Disable create video',
    });
  }

  if (user.material_info['is_limit']) {
    const userVideoCount = await Video.countDocuments({
      user: user.id,
      del: false,
    });
    const userPDFCount = await PDF.countDocuments({
      user: user.id,
      del: false,
    });
    const userImageCount = await Image.countDocuments({
      user: user.id,
      del: false,
    });
    count = userVideoCount + userPDFCount + userImageCount;
    max_upload_count =
      user.material_info.upload_max_count ||
      PACKAGE.PRO.material_info.upload_max_count;
  }

  if (user.material_info['is_limit'] && max_upload_count <= count) {
    return res.status(412).send({
      status: false,
      error: 'Exceed upload max materials',
    });
  }
};

const emptyBucket = (bucketName, folder, callback) => {
  var params = {
    Bucket: bucketName,
    Prefix: folder,
  };

  const listObjectCommand = new ListObjectsCommand(params);
  s3.send(listObjectCommand, (err, data) => {
    if (err) return callback(err);

    if (data.Contents.length === 0) callback();

    const delParams = { Bucket: bucketName, Delete: { Objects: [] } };

    data.Contents.forEach((content) => {
      delParams.Delete.Objects.push({ Key: content.Key });
    });
    const deleteObjectsCommand = new DeleteObjectsCommand(delParams);
    s3.send(deleteObjectsCommand, function (err, data) {
      if (err) return callback(err);
      else callback();
    });
  });
};

module.exports = {
  createVideo,
  createImage,
  createPdf,
  downloadVideos,
  downloadPdfs,
  downloadImages,
  removeMaterials,
  checkMaterialCount,
  emptyBucket,
};
