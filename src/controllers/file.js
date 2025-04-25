const path = require('path');
const mime = require('mime-types');
const fs = require('fs');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { FILES_PATH } = require('../configs/path');
const api = require('../configs/api');

let sharp;
try {
  // eslint-disable-next-line global-require
  sharp = require('sharp');
} catch (err) {
  console.log('sharp import is failed.');
}

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: api.AWS.AWS_S3_REGION,
});

const File = require('../models/file');
const Garbage = require('../models/garbage');
const { uploadBase64Image, removeFile } = require('../helpers/fileUpload');
const urls = require('../constants/urls');

const create = async (req, res) => {
  if (req.file) {
    const file_name = req.file.filename;
    const today = new Date();
    const year = today.getYear();
    const month = today.getMonth();
    const key = 'profile' + year + '/' + month + '/' + file_name + '-resize';
    const location = `https://${api.AWS.AWS_S3_BUCKET_NAME}.s3.${api.AWS.AWS_S3_REGION}.amazonaws.com/${key}`;
    if (fs.existsSync(FILES_PATH + file_name)) {
      sharp &&
        sharp(FILES_PATH + file_name)
          .resize(100, 100)
          .toBuffer()
          .then(async (data) => {
            console.log('data', data);
            const params = {
              Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
              Key: key,
              Body: data,
              ACL: 'public-read',
            };

            await s3.send(new PutObjectCommand(params));
          });

      fs.readFile(FILES_PATH + req.file.filename, async (err, data) => {
        if (err) {
          console.log('file read err', err);
          return res.status(400).send({
            status: false,
            error: 'file read error',
          });
        } else {
          console.log('File read was successful', data);
          const params = {
            Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
            Key: key,
            Body: data,
            ACL: 'public-read',
          };
          try {
            await s3.send(new PutObjectCommand(params));
            return res.send({
              status: true,
              data: {
                url: location,
              },
            });
          } catch (error) {
            return res.status(400).send({
              status: false,
              error: 'file upload s3 error',
            });
          }
        }
      });
    }
  }
};

const get = (req, res) => {
  const filePath = FILES_PATH + req.params.name;

  if (fs.existsSync(filePath)) {
    if (req.query.resize) {
      const readStream = fs.createReadStream(filePath);
      if (!sharp) {
        return res.status(404).send({
          status: false,
          error: 'Image engine is not working',
        });
      }
      let transform = sharp();
      transform = transform.resize(100, 100);
      return readStream.pipe(transform).pipe(res);
    } else {
      const contentType = mime.contentType(path.extname(req.params.name));
      res.set('Content-Type', contentType);
      return res.sendFile(filePath);
    }
  } else {
    res.status(404).send({
      status: false,
      error: 'File does not exist',
    });
  }
};

const remove = async (req, res) => {
  const { currentUser } = req;
  try {
    const file = File.findOne({ user: currentUser.id, name: req.params.id });

    if (file) {
      fs.unlinkSync(FILES_PATH + req.params.id);
      res.send({
        status: true,
        data: {
          file_name: req.params.id,
        },
      });
    } else {
      res.status(404).send({
        status: false,
        error: 'file_not_found',
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).send({
      status: false,
      error: 'internal_server_error',
    });
  }
};

const upload = async (req, res) => {
  if (req.file) {
    const file_name = req.file.filename;
    const today = new Date();
    const year = today.getYear();
    const month = today.getMonth();
    const key = 'profile' + year + '/' + month + '/' + file_name + '-resize';
    const location = `https://${api.AWS.AWS_S3_BUCKET_NAME}.s3.${api.AWS.AWS_S3_REGION}.amazonaws.com/${key}`;

    if (fs.existsSync(FILES_PATH + file_name)) {
      sharp(FILES_PATH + file_name)
        .resize(100, 100)
        .toBuffer()
        .then(async (data) => {
          const params = {
            Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
            Key: key,
            Body: data,
            ACL: 'public-read',
          };

          try {
            await s3.send(new PutObjectCommand(params));
          } catch (error) {
            return res.status(400).json({
              status: false,
              error: 'file upload s3 error',
            });
          }
        })
        .catch((err) => {
          console.log('resize file generate error', err);
          return res.status(400).send({
            status: false,
            error: 'resize file error',
          });
        });
    }

    if (fs.existsSync(FILES_PATH + file_name)) {
      fs.readFile(FILES_PATH + req.file.filename, async (err, data) => {
        if (err) {
          console.log('file read err', err);
          return res.status(400).send({
            status: false,
            error: 'file read error',
          });
        } else {
          console.log('File read was successful', data);
          const params = {
            Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
            Key: key,
            Body: data,
            ACL: 'public-read',
          };
          try {
            await s3.send(new PutObjectCommand(params));
            return res.send({
              status: true,
              url: location,
            });
          } catch (error) {
            return res.status(400).send({
              status: false,
              error: 'file upload s3 error',
            });
          }
        }
      });
    }
  }
};

const uploadBase64 = async (req, res) => {
  const { currentUser } = req;
  const { data } = req.body;

  const garbage = await Garbage.findOne({ user: currentUser._id }).catch(
    (err) => {
      console.log('Error', err);
    }
  );

  if (garbage) {
    if (garbage['logo']) {
      await removeFile(garbage['logo'], (err, data) => {
        console.log(err);
      });
    }
    const logo = await uploadBase64Image(data);
    garbage['logo'] = logo;

    Garbage.updateOne({ user: currentUser._id }, { $set: { logo } }).then(
      (data) => {
        return res.send({
          status: true,
          data: logo,
        });
      }
    );
  } else {
    const logo = await uploadBase64Image(data);

    const newGarbage = new Garbage({
      user: currentUser._id,
      logo,
    });
    newGarbage.save().then((data) => {
      return res.send({
        status: true,
        data: logo,
      });
    });
  }
};

const loadAll = async (req, res) => {
  File.find({}).then((data) => {
    return res.send({
      data,
    });
  });
};

const streamToBuffer = async (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const getFileFromS3 = async (req, res) => {
  var params = { Bucket: api.AWS.AWS_S3_BUCKET_NAME };
  params['Key'] = req.query.file;

  const getObjectCommand = new GetObjectCommand(params);

  try {
    const data = await s3.send(getObjectCommand);
    const content = await streamToBuffer(data.Body);
    res.attachment(params.Key); // Set Filename
    res.send(content); // Send File Buffer
  } catch (err) {
    // Handle the error or throw
    res.status(200);
    res.end('Error Fetching File');
  }
};

module.exports = {
  create,
  get,
  upload,
  remove,
  uploadBase64,
  loadAll,
  getFileFromS3,
};
