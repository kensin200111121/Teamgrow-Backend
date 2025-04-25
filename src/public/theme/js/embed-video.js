const dom = document.querySelector("script[data-source='crmgrow']");
const data = dom?.dataset.id;
const src = new URL(dom?.src);
const domain = src.hostname;
const port = src.port;
const videos = document.querySelectorAll("div[data-source='crmgrow']");
const videoDatas = Array.from(videos).map((e) => e.dataset.id);
if (data + videoDatas.length) {
  videoDatas.forEach((videoData) => {
    const video = document.querySelector(
      `div[data-source='crmgrow'][data-id=${videoData}]`
    );
    let iframeLink = '';
    if (domain === 'localhost' && port) {
      iframeLink = `http://${domain}:${port}/embeded/video?u=${data}&v=${videoData}`;
    } else {
      iframeLink = `https://${domain}/embeded/video?u=${data}&v=${videoData}`;
    }
    video.innerHTML = `<iframe style="border: none; position: absolute; top: 0px; bottom: 0px; width: 100%; height: 100%;" src='${iframeLink}'></iframe>`;
    video.style.position = 'relative';
    video.style.aspectRatio = '16/9';
  });
}
