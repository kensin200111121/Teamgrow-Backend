const get_automation = {
  id: '66f2d62602937c67a28e093a',
  count: 30,
  skip: 0,
};
const wrong_req = {
  id: 'wwww',
  count: 30,
  skip: 0,
};
const library_req = {
  search: '',
  folder: '',
  team_id: '',
};
const create_req = {
  title: 'test-automation',
  type: 'any',
  automations: [
    {
      parent: 'a_10000',
      id: 'a_be5b3bb2-ceb6-4015-a0fe-6205a61d51e0',
      period: 0,
      status: 'active',
      action: {
        type: 'text',
        content: 'wwww\n\n{{image:62275ff783b55f260c60dc32}}',
        subject: '',
        videos: [],
        pdfs: [],
        images: ['62275ff783b55f260c60dc32'],
        is_root: true,
      },
    },
    {
      parent: 'a_be5b3bb2-ceb6-4015-a0fe-6205a61d51e0',
      id: 'a_d332e237-b47c-4cb8-8c0c-fc9a41f38085',
      period: 0,
      status: 'pending',
      action: {
        type: 'email',
        content:
          '<div>{contact_phone}</div><div><br></div><div>{test}</div><div><br></div><div><br></div>',
        subject: 'dfdf',
        videos: [],
        pdfs: [],
        images: [],
        attachments: [],
      },
    },
  ],
  label: 'contact',
  is_sharable: true,
};
const update_req = {
  title: 'testUI email',
  automations: [
    {
      parent: 'a_10000',
      id: 'a_240d9193-4d1f-4e0b-b01c-3fe1bce1bbc1',
      period: '0.17',
      status: 'active',
      action: {
        type: 'email',
        content:
          '<div><strong>qa</strong></div><div><a class="material-object" data-type="video" href="{{66a203be6679c87f7764de02}}" contenteditable="false">﻿<span contenteditable="false"><img src="https://teamgrow.s3.us-east-2.amazonaws.com/preview124/6/8d5d9fd0-4a5a-11ef-a07c-e381543e900c" alt="Preview image went something wrong. Please click here" width="320" height="176"></span>﻿</a></div><div><br></div><div><br></div>',
        subject: 'QA',
        videos: ['66a203be6679c87f7764de02'],
        pdfs: [],
        images: [],
        is_root: true,
      },
    },
    {
      parent: 'a_240d9193-4d1f-4e0b-b01c-3fe1bce1bbc1',
      id: 'a_6bb0cdd1-3891-46b5-b16d-35ba29beddd6',
      period: 0,
      condition: { case: 'watched_material', answer: true, percent: 30 },
      status: 'pending',
      action: {
        type: 'email',
        content:
          '<div>QA</div><div><br></div><div><strong>x test</strong></div><div><a class="material-object" data-type="pdf" href="{{64abbb026b7c5f11f34f9ad6}}" contenteditable="false">﻿<span contenteditable="false"><img src="https://teamgrow.s3.us-east-2.amazonaws.com/preview123/6123/6/64c574dc-0b65-4f5c-8e0b-a49bd21e6e69.jpeg" alt="Preview image went something wrong. Please click here" width="320" height="176"></span>﻿</a></div><div><br></div><div><br></div>',
        subject: 'QA',
        videos: [],
        pdfs: ['64abbb026b7c5f11f34f9ad6'],
        images: [],
      },
      watched_materials: ['66a203be6679c87f7764de02'],
    },
    {
      parent: 'a_6bb0cdd1-3891-46b5-b16d-35ba29beddd6',
      id: 'a_956018cf-3bcf-45d0-8456-4aa9a26b51b0',
      period: 0,
      condition: { case: 'watched_material', answer: true },
      status: 'pending',
      action: {
        type: 'email',
        content:
          '<div><strong>test</strong></div><div><a class="material-object" data-type="image" href="{{649e83397824d52129da8d6c}}" contenteditable="false">﻿<span contenteditable="false"><img src="https://teamgrow.s3.us-east-2.amazonaws.com/preview123/5123/5/b05056ca-71f6-4052-a4bc-7b96a15d36a7.jpeg" alt="Preview image went something wrong. Please click here" width="320" height="176"></span>﻿</a></div><div><br></div><div><br></div><div><br></div>',
        subject: 'QA',
        videos: [],
        pdfs: [],
        images: ['649e83397824d52129da8d6c'],
      },
      watched_materials: ['64abbb026b7c5f11f34f9ad6'],
    },
    {
      parent: 'a_956018cf-3bcf-45d0-8456-4aa9a26b51b0',
      id: 'a_11863273-cc95-467c-90f9-151c7d742f13',
      period: 0,
      condition: { case: 'watched_material', answer: true },
      status: 'pending',
      action: {
        type: 'email',
        content: '<div>QA</div>',
        subject: 'QA',
        videos: [],
        pdfs: [],
        images: [],
      },
      watched_materials: ['649e83397824d52129da8d6c'],
    },
  ],
  label: 'contact',
  type: 'any',
  is_sharable: true,
};
const download_req = {
  id: '66f2d62602937c67a28e093a',
  ids: ['66f2d62602937c67a28e093a'],
  videoIds: [],
  imageIds: [],
  pdfIds: [],
  stageInfo: null,
  is_sharable: false,
  original_id: null,
};
const updateDefault_req = {
  automation: {
    type: 'any',
    del: false,
    title: 'Example 1',
  },
  id: '5f1723d4190bc529a6b7a24c',
};
const remove_folder_req = {
  _id: '62a6bdf21d54300470676b0c',
  mode: '',
  target: '',
};
module.exports = {
  get_automation,
  wrong_req,
  library_req,
  create_req,
  update_req,
  download_req,
  updateDefault_req,
  remove_folder_req,
};
