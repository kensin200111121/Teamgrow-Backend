var SERVER = 'https://ecsbe.crmgrow.com';
var RECORD = 'https://crmgrow-record2.s3-us-east-2.amazonaws.com';
var recordUrl = 'https://crmgrow-record2.s3-us-east-2.amazonaws.com/index.html';
var recordPopup;
var materials = [];
var selectedTemplate;
let Block = Quill.import('blots/block');
const Embed = Quill.import('blots/embed');
Block.tagName = 'DIV';
Quill.register(Block, true);

const quillOptions = {
  modules: {
    toolbar: [
      [{ font: [] }],
      [{ size: ['small', false, 'large', 'huge'] }], // custom dropdown
      ['bold', 'italic', 'underline'],
      [{ list: 'bullet' }],
      ['image'],
    ],
  },
  placeholder: 'Enter email content...',
  theme: 'snow',
};

class MaterialBlot extends Embed {
  static tagName = 'a';
  static className = 'material-object';
  static blotName = 'materialLink';
  static create(data) {
    if (!data || !data._id || !data.preview) {
      return;
    }
    const node = super.create();
    const type = data.type || data.material_type || 'video';
    node.setAttribute('data-type', type);
    const url = `{{${data?._id}}}`;
    node.setAttribute('href', url);
    node.setAttribute('contenteditable', false);
    const img = document.createElement('img');
    img.setAttribute('src', data.preview);
    img.alt = 'Preview image went something wrong. Please click here';
    img.width = 320;
    img.height = 176;
    node.appendChild(img);
    return node;
  }
  static value(domNode) {
    const type = domNode.getAttribute('data-type') || 'video';
    const href = domNode.getAttribute('href');
    const _id = href.replace(/{{|}}/g, '');
    let preview = '';
    const previewImg = domNode.querySelector('img');
    if (previewImg) {
      preview = previewImg.src;
    }
    return {
      _id,
      preview,
      material_type: type,
    };
  }
}
Quill.register(MaterialBlot, true);

$(document).ready(function () {
  let templateContent = new Quill('#description-editor', quillOptions);
  templateContent.setText('');
  const materialButton =
    '<span class="ql-formats">' +
    '<button type="button" class="ql-material">' +
    '<svg width="24" height="24" viewBox="0 0 24 24">' +
    '<path class="ql-fill" d="M9.5 7.5V16.5L16.5 12L9.5 7.5Z"/>' +
    '<path class="ql-fill" d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 18.01H4V5.99H20V18.01Z"/>' +
    '</svg>' +
    '</button>' +
    '</span>';
  const recordingButton =
    '<span class="ql-formats">' +
    '<button type="button" class="ql-recording">' +
    '<svg width="24" height="24" viewBox="0 0 24 24">' +
    '<path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20Z"/>' +
    '<path d="M12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17Z" fill="#EB5757"/>' +
    '</svg>' +
    '</button>' +
    '</span>';
  if ($('.ql-toolbar .ql-material').length == 0) {
    $('.ql-toolbar').append(materialButton);
  }
  if ($('.ql-toolbar .ql-recording').length == 0) {
    $('.ql-toolbar').append(recordingButton);
  }
  const url = new URL(location.href);
  var token = url.searchParams.get('token');
  var type = url.searchParams.get('type');
  var user = url.searchParams.get('user');
  var templateId = url.searchParams.get('template');
  if (token) {
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.href);
  }
  if (type) {
    url.searchParams.delete('type');
    window.history.replaceState({}, '', url.href);
  }
  if (user) {
    url.searchParams.delete('user');
    window.history.replaceState({}, '', url.href);
  }
  if (templateId) {
    url.searchParams.delete('template');
    window.history.replaceState({}, '', url.href);
    $.ajax({
      type: 'GET',
      url: 'api/template/' + templateId,
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      success: function (data) {
        selectedTemplate = data.data;
        if (type == 'edit') {
          $('#title').val(selectedTemplate.title);
          $('#subject').val(selectedTemplate.subject);
        }
        const delta = templateContent.clipboard.convert(
          selectedTemplate.content
        );
        templateContent.setContents(delta, 'silent');
      },
      error: function (data) {
        if (data.status == 400) {
          const response = data.responseJSON;
          if (response && response['error']) {
            alert(response['error']);
          } else {
            alert('Internal Server Error');
          }
        } else {
          alert('Internal Server Error');
        }
      },
    });
  }
  $.ajax({
    type: 'GET',
    url: 'api/material/load-own',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    success: function (data) {
      materials = data.data;
    },
    error: function (data) {
      if (data.status == 400) {
        const response = data.responseJSON;
        if (response && response['error']) {
          alert(response['error']);
        } else {
          alert('Internal Server Error');
        }
      } else {
        alert('Internal Server Error');
      }
    },
  });

  const insertMaterial = (material, noTitle) => {
    templateContent.focus();

    const range = templateContent.getSelection();
    const length = templateContent.getLength();
    const content = templateContent.root.innerHTML;

    let selection;
    if (!(content || '').trim()) {
      selection = range.index;
      if (!noTitle) {
        templateContent.insertText(
          selection,
          material.title + '\n',
          'bold',
          'user'
        );
        selection += material.title.length + 1;
      }
      templateContent.insertEmbed(
        selection,
        `materialLink`,
        {
          _id: material._id,
          preview: material.preview || material.thumbnail,
          type: material.material_type,
        },
        'user'
      );
      selection += 1;
      templateContent.setSelection(selection, 0, 'user');

      templateContent.insertText(selection, '\n\n\n', {}, 'user');
      templateContent.setSelection(selection + 3, 0, 'user');
    } else {
      if (range && range.index) {
        selection = range.index;
        templateContent.insertText(selection, '\n', {}, 'user');
        selection += 1;
        if (!noTitle) {
          templateContent.insertText(
            selection,
            material.title + '\n',
            'bold',
            'user'
          );
          selection += material.title.length + 1;
        }
        templateContent.insertEmbed(
          selection,
          `materialLink`,
          {
            _id: material._id,
            preview: material.preview || material.thumbnail,
            type: material.material_type,
          },
          'user'
        );
        selection += 1;
        templateContent.setSelection(selection, 0, 'user');
      } else {
        selection = length;
        templateContent.insertText(selection, '\n', {}, 'user');
        selection += 1;
        if (!noTitle) {
          templateContent.insertText(length, material.title, 'bold', 'user');
          selection += material.title.length + 1;
        }
        templateContent.insertEmbed(
          selection,
          `materialLink`,
          {
            _id: material._id,
            preview: material.preview || material.thumbnail,
            type: material.material_type,
          },
          'user'
        );
        selection += 1;
        templateContent.setSelection(selection, 0, 'user');
      }

      templateContent.insertText(selection, '\n\n', {}, 'user');
      templateContent.setSelection(selection + 2, 0, 'user');
    }
  };

  $('.ql-recording').click(function () {
    const w = 750;
    const h = 450;
    const dualScreenLeft =
      window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    const dualScreenTop =
      window.screenTop !== undefined ? window.screenTop : window.screenY;

    const width = window.innerWidth
      ? window.innerWidth
      : document.documentElement.clientWidth
      ? document.documentElement.clientWidth
      : screen.width;
    const height = window.innerHeight
      ? window.innerHeight
      : document.documentElement.clientHeight
      ? document.documentElement.clientHeight
      : screen.height;

    const systemZoom = width / window.screen.availWidth;
    const left = (width - w) / 2 / systemZoom + dualScreenLeft;
    const top = (height - h) / 2 / systemZoom + dualScreenTop;
    const option = `width=${w}, height=${h}, top=${top}, left=${left}`;
    const ref = window.location.href;
    if (!recordPopup || recordPopup.closed) {
      recordPopup = window.open(
        recordUrl +
          '?token=' +
          token +
          '&method=website&userId=' +
          user +
          '&prev=' +
          encodeURIComponent(ref),
        'record',
        option
      );
      window.addEventListener('message', (e) => {
        if (e && e.data && e.origin == RECORD) {
          templateContent.focus();
          const length = templateContent.getLength();
          let materialPreview = '';
          if (e.data.material_type == 'video') {
            materialPreview = e.data.thumbnail;
          } else {
            materialPreview = e.data.preview;
          }
          templateContent.insertEmbed(length - 1, 'image', materialPreview);
          templateContent.insertText(length - 1, e.data.title);
          return;
        }
      });
    } else {
      recordPopup.focus();
    }
  });
  $('.ql-material').click(function () {
    $('#material').modal({ backdrop: 'static', keyboard: false });
  });
  $('.material-insert').click(function () {
    const id = $(this).parent().parent()[0].id;
    const index = materials.findIndex((e) => e._id == id);
    let material;
    if (index !== -1) {
      material = materials[index];
    }
    if (material) {
      insertMaterial(material, false);
    }
    $('#material').modal('hide');
  });
  $('.cancel').click(function () {
    window.close();
  });
  $('.create').click(function () {
    const title = $('#title').val().trim();
    const subject = $('#subject').val().trim();
    const content = templateContent.root.innerHTML;
    const { video_ids, pdf_ids, image_ids } = getMaterials(templateContent);
    let isCreate = true;
    if (title == '') {
      $('.invalid-feedback.title').css('display', 'block');
      isCreate = false;
    } else {
      $('.invalid-feedback.title').css('display', 'none');
    }
    if (subject == '') {
      $('.invalid-feedback.subject').css('display', 'block');
      isCreate = false;
    } else {
      $('.invalid-feedback.subject').css('display', 'none');
    }
    if (!isCreate) {
      return;
    }
    $(this).addClass('loading');
    const data = {
      type: 'email',
      title: title,
      subject: subject,
      content: content,
      video_ids,
      pdf_ids,
      image_ids,
    };
    $.ajax({
      type: 'POST',
      url: 'api/template/create',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      data: JSON.stringify(data),
      success: function (data) {
        $(this).removeClass('loading');
        window.close();
      },
      error: function (data) {
        if (data.status == 400) {
          const response = data;
          if (response && response['error']) {
            alert(response['error']);
          } else {
            alert('Internal Server Error');
          }
        } else {
          alert('Internal Server Error');
        }
      },
    });
  });
  $('.update').click(function () {
    const title = $('#title').val().trim();
    const subject = $('#subject').val().trim();
    const content = templateContent.root.innerHTML;
    const { video_ids, pdf_ids, image_ids } = getMaterials(templateContent);
    let isCreate = true;
    if (title == '') {
      $('.invalid-feedback.title').css('display', 'block');
      isCreate = false;
    } else {
      $('.invalid-feedback.title').css('display', 'none');
    }
    if (subject == '') {
      $('.invalid-feedback.subject').css('display', 'block');
      isCreate = false;
    } else {
      $('.invalid-feedback.subject').css('display', 'none');
    }
    if (!isCreate) {
      return;
    }
    $(this).addClass('loading');
    selectedTemplate.title = title;
    selectedTemplate.subject = subject;
    selectedTemplate.content = content;
    selectedTemplate.video_ids = video_ids;
    selectedTemplate.pdf_ids = pdf_ids;
    selectedTemplate.image_ids = image_ids;
    const data = { ...selectedTemplate, _id: undefined };
    $.ajax({
      type: 'PUT',
      url: 'api/template/' + templateId,
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      data: JSON.stringify(data),
      success: function (data) {
        $(this).removeClass('loading');
        window.close();
      },
      error: function (data) {
        if (data.status == 400) {
          const response = data;
          if (response && response['error']) {
            alert(response['error']);
          } else {
            alert('Internal Server Error');
          }
        } else {
          alert('Internal Server Error');
        }
      },
    });
  });
  $('.duplicate').click(function () {
    const title = $('#title').val().trim();
    const subject = $('#subject').val().trim();
    const content = templateContent.root.innerHTML;
    const { video_ids, pdf_ids, image_ids } = getMaterials(templateContent);
    let isCreate = true;
    if (title == '') {
      $('.invalid-feedback.title').css('display', 'block');
      isCreate = false;
    } else {
      $('.invalid-feedback.title').css('display', 'none');
    }
    if (subject == '') {
      $('.invalid-feedback.subject').css('display', 'block');
      isCreate = false;
    } else {
      $('.invalid-feedback.subject').css('display', 'none');
    }
    if (!isCreate) {
      return;
    }
    $(this).addClass('loading');
    const data = {
      type: 'email',
      title: title,
      subject: subject,
      content: content,
      video_ids,
      pdf_ids,
      image_ids,
    };
    $.ajax({
      type: 'POST',
      url: 'api/template/create',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      data: JSON.stringify(data),
      success: function (data) {
        $(this).removeClass('loading');
        window.close();
      },
      error: function (data) {
        if (data.status == 400) {
          const response = data;
          if (response && response['error']) {
            alert(response['error']);
          } else {
            alert('Internal Server Error');
          }
        } else {
          alert('Internal Server Error');
        }
      },
    });
  });
});

const getMaterials = (content) => {
  if (!content) {
    return {
      video_ids: [],
      pdf_ids: [],
      image_ids: [],
    };
  } else {
    const video_ids = [];
    const pdf_ids = [];
    const image_ids = [];
    content.getContents().forEach((e) => {
      if (e.insert?.materialLink) {
        const material_type = e.insert?.materialLink?.material_type || 'video';
        switch (material_type) {
          case 'video':
            video_ids.push(e.insert?.materialLink?._id);
            break;
          case 'pdf':
            pdf_ids.push(e.insert?.materialLink?._id);
            break;
          case 'image':
            image_ids.push(e.insert?.materialLink?._id);
            break;
        }
      }
    });
    return {
      video_ids,
      pdf_ids,
      image_ids,
    };
  }
};
