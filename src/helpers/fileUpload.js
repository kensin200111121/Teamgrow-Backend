const uuid = require('uuid');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const api = require('../configs/api');
const { streamToBuffer } = require('./utility');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

exports.uploadBase64Image = async (base64, dest = '') => {
  const base64Data = new Buffer.from(
    base64.replace(/^data:image\/\w+;base64,/, ''),
    'base64'
  );
  const fileType = base64.split(';')[0].split('/')[1];
  const fileName = uuid.v4();
  const today = new Date();
  const year = today.getYear();
  const month = today.getMonth();
  const key = `${
    dest ? dest + year + '/' + month + '/' : ''
  }${fileName}.${fileType}`;
  const location = `https://${api.AWS.AWS_S3_BUCKET_NAME}.s3.${api.AWS.AWS_S3_REGION}.amazonaws.com/${key}`;
  var fileParam = {
    Bucket: api.AWS.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: base64Data,
    ContentEncoding: 'base64',
    ACL: 'public-read',
    ContentType: `image/${fileType}`,
  };
  try {
    await s3.send(new PutObjectCommand(fileParam));
    return location;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

exports.uploadFile = async (data, fileType, dest = '') => {
  const fileName = uuid.v4();
  const today = new Date();
  const year = today.getYear();
  const month = today.getMonth();
  let _fileType = fileType;
  if (fileType.includes('/')) {
    _fileType = fileType.split('/')[1];
  }
  const key = `${
    dest ? dest + year + '/' + month + '/' : ''
  }${fileName}.${_fileType}`;
  const location = `https://${api.AWS.AWS_S3_BUCKET_NAME}.s3.${api.AWS.AWS_S3_REGION}.amazonaws.com/${key}`;
  var fileParam = {
    Bucket: api.AWS.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: data,
    ACL: 'public-read',
    ContentType: fileType,
  };
  try {
    await s3.send(new PutObjectCommand(fileParam));
    return location;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

exports.removeFile = async (Key, cb, Bucket = api.AWS.AWS_S3_BUCKET_NAME) => {
  const param = {
    Bucket,
    Key,
  };
  const deleteObjectCommand = new DeleteObjectCommand(param);
  s3.send(deleteObjectCommand, function (err, data) {
    cb(err, data);
  });
};

exports.downloadFile = async (originalFile) => {
  return new Promise((resolve, reject) => {
    const param = {
      Bucket: api.AWS.AWS_S3_BUCKET_NAME,
      Key: originalFile,
    };

    const command = new GetObjectCommand(param);

    s3.send(command, async (err, data) => {
      if (err) {
        reject(err);
      } else {
        console.log('Successfully dowloaded data from  bucket');
        const content = await streamToBuffer(data.Body);
        resolve(content);
      }
    });
  });
};
