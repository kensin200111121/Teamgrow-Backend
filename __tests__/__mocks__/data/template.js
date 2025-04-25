const mongoose = require('mongoose');

const correct_template_req = [
  {
    _id: '7234567890abcdef01234567',
    type: 'email',
  },
  {
    _id: '4234567890abcdef01234567',
    type: 'folder',
  },
];

const incorrect_template_req = [
  {
    _id: '7234567890abcdef01234569',
    type: 'email',
  },
  {
    _id: '4234567890abcdef01234567',
    type: 'folder',
  },
];

const original_templates = [
  {
    _id: mongoose.Types.ObjectId('7234567890abcdef01234567'),
    user: mongoose.Types.ObjectId('661962f2275d29b66852394a'),
    title: 'aaaccc',
    subject: 'test',
    content:
      '<div>test bulk mail content</div><div><br></div><div><strong>Official_Material</strong></div><div><a class="material-object" data-type="video" href="{{66fdf8bf244ee7e8d766bc74}}" contenteditable="false">\ufeff<span contenteditable="false"><img src="https://teamgrow.s3.us-east-2.amazonaws.com/preview124/9/16004260-812a-11ef-91d1-8f610de6042c" alt="Preview image went something wrong. Please click here" width="320" height="176"></span>\ufeff</a></div><div><br></div><div><br></div>',
    video_ids: [mongoose.Types.ObjectId('1234567890abcdef01234567')],
    pdf_ids: [],
    image_ids: [],
    token_ids: [],
    type: 'email',
    default: false,
    is_sharable: true,
    del: false,
    attachments: [],
    meta: {
      excerpt: 'test bulk mail contentOfficial_Material\ufeff\ufeff',
    },
    version: 0,
    original_version: 0,
    created_at: new Date('2024-10-10T03:51:43.117Z'),
    updated_at: new Date('2024-10-15T14:28:20.13Z'),
    __v: 0,
  },
  {
    _id: mongoose.Types.ObjectId('7234567890abcdef01234569'),
    user: mongoose.Types.ObjectId('661962f2275d29b66852394a'),
    title: 'xzzxx',
    subject: 'aabbvv',
    content:
      '<div>test bulk mail content</div><div><br></div><div><strong>Official_Material</strong></div><div><a class="material-object" data-type="video" href="{{66fdf8bf244ee7e8d766bc74}}" contenteditable="false">\ufeff<span contenteditable="false"><img src="https://teamgrow.s3.us-east-2.amazonaws.com/preview124/9/16004260-812a-11ef-91d1-8f610de6042c" alt="Preview image went something wrong. Please click here" width="320" height="176"></span>\ufeff</a></div><div><br></div><div><br></div>',
    video_ids: [],
    pdf_ids: [],
    image_ids: [],
    token_ids: [],
    type: 'text',
    default: false,
    is_sharable: true,
    del: false,
    attachments: [],
    meta: {
      excerpt: 'test bulk mail contentOfficial_Material\ufeff\ufeff',
    },
    version: 0,
    original_version: 0,
    created_at: new Date('2024-10-10T03:51:43.117Z'),
    updated_at: new Date('2024-10-15T14:28:20.13Z'),
    __v: 0,
  },
];

module.exports = {
  correct_template_req,
  original_templates,
  incorrect_template_req,
};
