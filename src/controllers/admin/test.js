const {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const moment = require('moment-timezone');
const api = require('../../configs/api');
const { Octokit } = require('@octokit/rest');

const s3 = new S3Client({
  credentials: {
    accessKeyId: api.AWS.AWS_ACCESS_KEY,
    secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  },
  region: 'us-east-1',
});

const octokit = new Octokit({
  auth: api.GITHUB.ACTION_LAUNCH,
});

const OWNER = 'teamgrow';
const WORKFLOW_ID = 'development.yml';
const BRANCH = 'development';
const REPO = 'ui-automation-crmgrow';

const loadAllTestHistory = async (req, res) => {
  const BUCKET = 'crmgrow-test-report';

  const dateHistoryCommand = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: '',
    Delimiter: '/',
  });
  const dateHistoryData = await s3.send(dateHistoryCommand);
  const dateHistory = (dateHistoryData.CommonPrefixes || []).map((e) => {
    return e.Prefix;
  });

  const results = [];
  for (let i = 0; i < dateHistory.length; i++) {
    const datePrefix = dateHistory[i];
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: datePrefix,
      Delimiter: '/',
    });
    const data = await s3.send(listCommand).catch((err) => {
      res.status(400).send({
        error: err,
      });
    });
    const resultList = (data.CommonPrefixes || []).map((e) => {
      return e.Prefix;
    });
    for (let i = 0; i < resultList.length; i++) {
      const resultItem = resultList[i];
      const getCommand = new HeadObjectCommand({
        Bucket: BUCKET,
        Key: resultItem + 'results.html',
      });
      const resultItemDetail = await s3.send(getCommand).catch((_) => {
        console.log('return error', _.message || _);
      });
      if (resultItemDetail) {
        results.push({
          ...resultItemDetail,
          key: resultItem + 'results.html',
        });
      }
    }
  }
  res.send({
    status: true,
    data: results,
  });
};

const runWorkflow = async (req, res) => {
  let tests;
  try {
    tests = await loadProgressingTestImpl();
  } catch (err) {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  }

  let existing = false;
  tests.some((test) => {
    if (test.name.includes(req.body.account)) {
      existing = true;
      return true;
    }
  });

  if (existing) {
    return res.status(400).send({
      status: false,
      error: 'You are running the test case with current email already.',
    });
  }

  try {
    await octokit.request(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        owner: 'teamgrow',
        repo: 'ui-automation-crmgrow',
        workflow_id: 'development.yml',
        ref: 'development',
        inputs: {
          platform: req.body.platform,
          user: req.body.account,
          case: req.body.case,
          uid: Date.now() + '',
          environment: process.env.NODE_ENV,
        },
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    return res.status(200).send();
  } catch (err) {
    return res.status(400).send({
      status: false,
    });
  }
};

const loadProgressingTestImpl = async () => {
  const results = await octokit.request(
    'GET /repos/{owner}/{repo}/actions/runs?event=workflow_dispatch',
    {
      owner: OWNER,
      repo: REPO,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  const statuses = ['in_progress', 'queued', 'requested', 'waiting', 'pending'];
  return results.data.workflow_runs.filter((e) => {
    if (statuses.includes(e.status)) {
      return true;
    } else {
      return false;
    }
  });
};

const loadProgressingTests = async (req, res) => {
  try {
    const tests = await loadProgressingTestImpl();
    return res.send({
      status: true,
      data: tests,
    });
  } catch (err) {
    return res.send({
      status: true,
      data: [],
    });
  }
};

module.exports = {
  loadAllTestHistory,
  runWorkflow,
  loadProgressingTests,
};
